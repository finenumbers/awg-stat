function sparkSegments(values: Array<number | null>, width: number, height: number, max: number): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  const yAt = (value: number) => height - (value / max) * (height - 2) - 1;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      continue;
    }
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    current.push(`${current.length === 0 ? "M" : "L"}${x.toFixed(1)},${yAt(value).toFixed(1)}`);
  }
  if (current.length > 1) {
    segments.push(current.join(" "));
  }
  return segments;
}

export function LatencySparkline({
  icmp,
  ssh,
}: {
  icmp: Array<number | null>;
  ssh: Array<number | null>;
}) {
  const values = [...icmp, ...ssh].filter((value): value is number => value != null);
  if (values.length < 2) {
    return <div className="h-8 w-24 rounded bg-muted/60" />;
  }

  const width = 96;
  const height = 32;
  const max = Math.max(...values, 1);
  const icmpPaths = sparkSegments(icmp, width, height, max);
  const sshPaths = sparkSegments(ssh, width, height, max);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24" aria-hidden>
      {icmpPaths.map((d) => (
        <path key={`icmp-${d}`} d={d} fill="none" stroke="#ca8a04" strokeWidth="1.25" />
      ))}
      {sshPaths.map((d) => (
        <path key={`ssh-${d}`} d={d} fill="none" stroke="#0369a1" strokeWidth="1.25" />
      ))}
    </svg>
  );
}
