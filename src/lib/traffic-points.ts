export type TrafficPoint = { t: number; rx: number; tx: number };

const MS_MINUTE = 60 * 1000;

export function filterPointsSince(points: TrafficPoint[], sinceMs: number): TrafficPoint[] {
  return points.filter((point) => point.t >= sinceMs);
}

/** UTC minute bucket; must match SQL floor(extract(epoch from ts)/60)*60*1000. */
export function utcMinuteStartMs(ts: number): number {
  return Math.floor(ts / MS_MINUTE) * MS_MINUTE;
}
