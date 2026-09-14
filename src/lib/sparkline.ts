import { SPARKLINE_SAMPLES } from "@/server/poll-defaults";

export function sparklinePoint(rxDelta: bigint, txDelta: bigint): number {
  return Number(rxDelta + txDelta);
}

export function parseSparkline(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

export function pushSparkline(values: unknown, next: number, max = SPARKLINE_SAMPLES): number[] {
  const out = parseSparkline(values);
  out.push(next);
  if (out.length > max) {
    return out.slice(out.length - max);
  }
  return out;
}
