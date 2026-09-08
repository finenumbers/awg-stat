import {
  isIcmpPermanentlyUnavailable,
  pingAddress,
  resolveProbeAddress,
  type IcmpAttempt,
} from "@/lib/net/icmp-ping";
import { isSafeProbeHost } from "@/lib/net/probe-host";
import { ICMP_DNS_CACHE_TTL_MS } from "@/server/poll-defaults";

export type IcmpProbeDeps = {
  now: () => number;
  resolve: (host: string) => Promise<string>;
  ping: (ip: string) => Promise<IcmpAttempt>;
};

/** `null` means the probe was skipped and the last stored result must stay as-is. */
export type IcmpProbeResult = { rttMs: number | null } | null;

type DnsEntry = {
  ip: string;
  expiresAt: number;
};

export class IcmpProbeController {
  private disabled = false;
  private readonly dnsCache = new Map<string, DnsEntry>();
  private readonly deps: IcmpProbeDeps;

  constructor(deps?: Partial<IcmpProbeDeps>) {
    this.deps = {
      now: deps?.now ?? Date.now,
      resolve: deps?.resolve ?? resolveProbeAddress,
      ping: deps?.ping ?? pingAddress,
    };
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  isDue(): boolean {
    return !this.disabled;
  }

  async probe(serverId: string, host: string): Promise<IcmpProbeResult> {
    if (!this.isDue()) {
      return null;
    }
    if (!isSafeProbeHost(host)) {
      return null;
    }

    let ip: string;
    try {
      ip = await this.resolveCached(host);
    } catch {
      return { rttMs: null };
    }

    const attempt = await this.deps.ping(ip);
    if (attempt.ok) {
      return { rttMs: attempt.rttMs };
    }
    if (isIcmpPermanentlyUnavailable(attempt.kind)) {
      this.disabled = true;
      return null;
    }
    return { rttMs: null };
  }

  private async resolveCached(host: string): Promise<string> {
    const now = this.deps.now();
    const cached = this.dnsCache.get(host);
    if (cached && cached.expiresAt > now) {
      return cached.ip;
    }
    const ip = await this.deps.resolve(host);
    this.dnsCache.set(host, { ip, expiresAt: now + ICMP_DNS_CACHE_TTL_MS });
    return ip;
  }
}

const globalForIcmp = globalThis as { __gateIcmpProbe?: IcmpProbeController };

export function getIcmpProbeController(): IcmpProbeController {
  return (globalForIcmp.__gateIcmpProbe ??= new IcmpProbeController());
}

export function resetIcmpProbeController(controller?: IcmpProbeController) {
  globalForIcmp.__gateIcmpProbe = controller;
}
