import {
  isIcmpPermanentlyUnavailable,
  pingAddress,
  resolveProbeAddress,
  type IcmpAttempt,
  type IcmpFailKind,
} from "@/lib/net/icmp-ping";
import { isSafeProbeHost } from "@/lib/net/probe-host";
import {
  ICMP_BACKOFF_MS,
  ICMP_DNS_CACHE_TTL_MS,
  ICMP_FAILURES_BEFORE_BACKOFF,
} from "@/server/poll-defaults";

export type IcmpProbeDeps = {
  now: () => number;
  resolve: (host: string) => Promise<string>;
  ping: (ip: string) => Promise<IcmpAttempt>;
};

type BackoffEntry = {
  failures: number;
  nextAt: number;
};

type DnsEntry = {
  ip: string;
  expiresAt: number;
};

export class IcmpProbeController {
  private disabled = false;
  private readonly backoff = new Map<string, BackoffEntry>();
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

  isDue(serverId: string): boolean {
    if (this.disabled) {
      return false;
    }
    const entry = this.backoff.get(serverId);
    if (!entry || entry.failures < ICMP_FAILURES_BEFORE_BACKOFF) {
      return true;
    }
    return this.deps.now() >= entry.nextAt;
  }

  async probe(serverId: string, host: string): Promise<number | null> {
    if (!this.isDue(serverId)) {
      return null;
    }
    if (!isSafeProbeHost(host)) {
      return null;
    }

    let ip: string;
    try {
      ip = await this.resolveCached(host);
    } catch {
      this.recordFailure(serverId, "dns");
      return null;
    }

    const attempt = await this.deps.ping(ip);
    if (attempt.ok) {
      this.recordSuccess(serverId);
      return attempt.rttMs;
    }
    this.recordFailure(serverId, attempt.kind);
    return null;
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

  private recordSuccess(serverId: string) {
    this.backoff.delete(serverId);
  }

  private recordFailure(serverId: string, kind: IcmpFailKind) {
    if (isIcmpPermanentlyUnavailable(kind)) {
      this.disabled = true;
      return;
    }
    if (kind === "invalid-host") {
      return;
    }
    const entry = this.backoff.get(serverId) ?? { failures: 0, nextAt: 0 };
    entry.failures += 1;
    if (entry.failures >= ICMP_FAILURES_BEFORE_BACKOFF) {
      entry.nextAt = this.deps.now() + ICMP_BACKOFF_MS;
    }
    this.backoff.set(serverId, entry);
  }
}

const globalForIcmp = globalThis as { __gateIcmpProbe?: IcmpProbeController };

export function getIcmpProbeController(): IcmpProbeController {
  return (globalForIcmp.__gateIcmpProbe ??= new IcmpProbeController());
}

export function resetIcmpProbeController(controller?: IcmpProbeController) {
  globalForIcmp.__gateIcmpProbe = controller;
}
