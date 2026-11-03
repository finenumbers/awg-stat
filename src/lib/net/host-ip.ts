import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

import { isSafeProbeHost } from "@/lib/net/probe-host";
import { ICMP_DNS_CACHE_TTL_MS } from "@/server/poll-defaults";

export const HOST_IP_UNKNOWN_TTL_MS = 15_000;
export const HOST_IP_DEADLINE_MS = 3_000;
const RESOLVER_TIMEOUT_MS = 1_000;
const RESOLVER_TRIES = 2;

const ABSENT_CODES = new Set(["ENOTFOUND", "ENODATA"]);

export type HostIpResult = { kind: "ok"; ips: string[] } | { kind: "absent" } | { kind: "unknown" };

type FamilyResult = { kind: "addresses"; ips: string[] } | { kind: "absent" } | { kind: "unknown" };

export type HostQuery = {
  resolve4: (host: string) => Promise<string[]>;
  resolve6: (host: string) => Promise<string[]>;
  cancel?: () => void;
};

export type HostIpCache = {
  entries: Map<string, { result: HostIpResult; expiresAt: number }>;
  inflight: Map<string, Promise<HostIpResult>>;
};

export type HostIpDeps = {
  now?: () => number;
  cache?: HostIpCache;
  lookup?: (host: string) => Promise<HostIpResult>;
};

export function createHostIpCache(): HostIpCache {
  return { entries: new Map(), inflight: new Map() };
}

const globalForHostIp = globalThis as { __gateHostIp?: HostIpCache };

function sharedCache(): HostIpCache {
  return (globalForHostIp.__gateHostIp ??= createHostIpCache());
}

function familyFromError(error: unknown): "absent" | "unknown" {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  return ABSENT_CODES.has(code) ? "absent" : "unknown";
}

function ipv4Value(ip: string): bigint {
  const parts = ip.split(".").map(Number);
  return BigInt((((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0));
}

function ipv6Value(ip: string): bigint {
  let value = ip.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const [a, b, c, d] = value
      .slice(lastColon + 1)
      .split(".")
      .map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    value = `${value.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = value.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  const parts = [...head, ...Array.from({ length: Math.max(missing, 0) }, () => "0"), ...tail];
  return parts.reduce((acc, part) => (acc << 16n) + BigInt(Number.parseInt(part || "0", 16)), 0n);
}

type RankedIp = { family: 4 | 6; value: bigint; text: string };

function rankIp(ip: string): RankedIp | null {
  const family = isIP(ip);
  if (family === 4) {
    return { family, value: ipv4Value(ip), text: ip };
  }
  if (family === 6) {
    return { family, value: ipv6Value(ip), text: ip };
  }
  return null;
}

export function canonicalIps(ips: string[]): string[] {
  const ranked = ips.map(rankIp).filter((item): item is RankedIp => item !== null);
  ranked.sort((a, b) => {
    if (a.family !== b.family) {
      return a.family - b.family;
    }
    if (a.value < b.value) {
      return -1;
    }
    if (a.value > b.value) {
      return 1;
    }
    if (a.text.length !== b.text.length) {
      return a.text.length - b.text.length;
    }
    if (a.text < b.text) {
      return -1;
    }
    if (a.text > b.text) {
      return 1;
    }
    return 0;
  });
  const unique: string[] = [];
  for (const item of ranked) {
    const previous = unique.length > 0 ? rankIp(unique[unique.length - 1]) : null;
    if (previous && previous.family === item.family && previous.value === item.value) {
      continue;
    }
    unique.push(item.text);
  }
  return unique;
}

export function formatResolvedIps(ips: string[]): string | null {
  const unique = canonicalIps(ips);
  return unique.length > 0 ? unique.join("\n") : null;
}

function mergeFamilies(left: FamilyResult, right: FamilyResult): HostIpResult {
  const ips = [...(left.kind === "addresses" ? left.ips : []), ...(right.kind === "addresses" ? right.ips : [])];
  const unique = canonicalIps(ips);
  if (unique.length > 0) {
    return { kind: "ok", ips: unique };
  }
  if (left.kind === "unknown" || right.kind === "unknown") {
    return { kind: "unknown" };
  }
  return { kind: "absent" };
}

/** `null` means the stored column stays as it is. */
export function resolvedIpsWrite(current: string | null, result: HostIpResult): { resolvedIps: string | null } | null {
  if (result.kind === "unknown") {
    return null;
  }
  const next = result.kind === "absent" ? null : formatResolvedIps(result.ips);
  if (next === current) {
    return null;
  }
  return { resolvedIps: next };
}

async function settleFamily(work: Promise<string[]>): Promise<FamilyResult> {
  try {
    const ips = await work;
    return ips.length > 0 ? { kind: "addresses", ips } : { kind: "absent" };
  } catch (error) {
    return familyFromError(error) === "absent" ? { kind: "absent" } : { kind: "unknown" };
  }
}

export function queryHostRecords(host: string, query: HostQuery, timeoutMs: number): Promise<HostIpResult> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  return new Promise((resolve) => {
    const finish = (result: HostIpResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      query.cancel?.();
      resolve(result);
    };
    timer = setTimeout(() => finish({ kind: "unknown" }), timeoutMs);
    void Promise.all([settleFamily(query.resolve4(host)), settleFamily(query.resolve6(host))])
      .then(([v4, v6]) => finish(mergeFamilies(v4, v6)))
      .catch(() => finish({ kind: "unknown" }));
  });
}

function defaultLookup(host: string): Promise<HostIpResult> {
  const resolver = new Resolver({ timeout: RESOLVER_TIMEOUT_MS, tries: RESOLVER_TRIES });
  return queryHostRecords(
    host,
    {
      resolve4: (name) => resolver.resolve4(name),
      resolve6: (name) => resolver.resolve6(name),
      cancel: () => {
        resolver.cancel();
      },
    },
    HOST_IP_DEADLINE_MS,
  );
}

function cacheKey(host: string): string {
  return host.trim().toLowerCase();
}

function ttlFor(result: HostIpResult): number {
  return result.kind === "unknown" ? HOST_IP_UNKNOWN_TTL_MS : ICMP_DNS_CACHE_TTL_MS;
}

async function resolveUncached(host: string, lookup: (host: string) => Promise<HostIpResult>): Promise<HostIpResult> {
  const trimmed = host.trim();
  if (!isSafeProbeHost(trimmed)) {
    return { kind: "unknown" };
  }
  if (isIP(trimmed)) {
    const ips = canonicalIps([trimmed]);
    return ips.length > 0 ? { kind: "ok", ips } : { kind: "unknown" };
  }
  try {
    return await lookup(trimmed);
  } catch {
    return { kind: "unknown" };
  }
}

export async function resolveHostIps(host: string, deps?: HostIpDeps): Promise<HostIpResult> {
  const now = deps?.now ?? Date.now;
  const cache = deps?.cache ?? sharedCache();
  const lookup = deps?.lookup ?? defaultLookup;
  const key = cacheKey(host);
  const cached = cache.entries.get(key);
  if (cached && cached.expiresAt > now()) {
    return cached.result;
  }
  const pending = cache.inflight.get(key);
  if (pending) {
    return pending;
  }

  const job = resolveUncached(host, lookup)
    .then((result) => {
      cache.entries.set(key, { result, expiresAt: now() + ttlFor(result) });
      return result;
    })
    .finally(() => {
      cache.inflight.delete(key);
    });
  cache.inflight.set(key, job);
  return job;
}
