import { isPollFresh } from "@/lib/presence";

export function formatRttMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "н/д";
  }
  if (ms < 1) {
    return "<1 мс";
  }
  return `${Math.round(ms)} мс`;
}

export function freshIcmpLabel(
  rttMs: number | null | undefined,
  at: Date | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (rttMs == null || !isPollFresh(at, nowMs)) {
    return null;
  }
  return formatRttMs(rttMs);
}
