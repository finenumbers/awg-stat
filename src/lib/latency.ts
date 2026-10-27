import { formatInteger } from "@/lib/utils";

export const ICMP_UNAVAILABLE_LABEL = "Сервер недоступен";
export const ICMP_TABLE_UNAVAILABLE_LABEL = "Недоступен";

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

export function overviewIcmpText(
  rttMs: number | null | undefined,
  at: Date | null | undefined,
): string | null {
  const label = freshIcmpLabel(rttMs, at);
  if (label === ICMP_UNAVAILABLE_LABEL) {
    return ICMP_TABLE_UNAVAILABLE_LABEL;
  }
  return label;
}
