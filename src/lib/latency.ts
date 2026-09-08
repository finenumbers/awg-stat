import { isPollFresh } from "@/lib/presence";

export type LatencySampleView = {
  capturedAt: Date;
  icmpRttMs: number | null;
  sshRttMs: number | null;
};

export function shouldPersistLatencySample(icmpRttMs: number | null, sshRttMs: number | null): boolean {
  return icmpRttMs != null || sshRttMs != null;
}

export function formatRttMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "н/д";
  }
  if (ms < 1) {
    return "<1 мс";
  }
  return `${Math.round(ms)} мс`;
}

export function latestFreshLatency(
  samples: LatencySampleView[],
  nowMs = Date.now(),
): { icmpRttMs: number | null; sshRttMs: number | null; capturedAt: Date } | null {
  const latest = samples[0];
  if (!latest || !isPollFresh(latest.capturedAt, nowMs)) {
    return null;
  }
  return {
    icmpRttMs: latest.icmpRttMs,
    sshRttMs: latest.sshRttMs,
    capturedAt: latest.capturedAt,
  };
}

export function latencySparkSeries(samples: LatencySampleView[]): {
  icmp: Array<number | null>;
  ssh: Array<number | null>;
} {
  const chronological = [...samples].reverse();
  return {
    icmp: chronological.map((sample) => sample.icmpRttMs),
    ssh: chronological.map((sample) => sample.sshRttMs),
  };
}
