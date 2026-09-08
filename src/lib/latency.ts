import { formatInteger } from "@/lib/utils";

export const ICMP_UNAVAILABLE_LABEL = "Сервер недоступен";

export function formatRttMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "н/д";
  }
  if (ms < 1) {
    return "<1 мс";
  }
  return `${formatInteger(Math.round(ms))} мс`;
}

export function freshIcmpLabel(
  rttMs: number | null | undefined,
  at: Date | null | undefined,
): string | null {
  if (rttMs != null && Number.isFinite(rttMs)) {
    return formatRttMs(rttMs);
  }
  if (at) {
    return ICMP_UNAVAILABLE_LABEL;
  }
  return null;
}
