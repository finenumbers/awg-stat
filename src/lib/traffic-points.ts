export type TrafficPoint = { t: number; rx: number; tx: number };

export function filterPointsSince(points: TrafficPoint[], sinceMs: number): TrafficPoint[] {
  return points.filter((point) => point.t >= sinceMs);
}
