import { LatencySparkline } from "@/components/charts/latency-sparkline";
import { formatRttMs, latestFreshLatency, latencySparkSeries, type LatencySampleView } from "@/lib/latency";

export function ServerLatencyReadout({
  samples,
  compact = false,
}: {
  samples: LatencySampleView[];
  compact?: boolean;
}) {
  const latest = latestFreshLatency(samples);
  const series = latencySparkSeries(samples);
  const icmpLabel = formatRttMs(latest?.icmpRttMs);
  const sshLabel = formatRttMs(latest?.sshRttMs);

  return (
    <div className={compact ? "flex items-center gap-3" : "space-y-1"}>
      <p className="text-sm text-muted-foreground">
        ICMP {icmpLabel}
        <span className="px-1">·</span>
        SSH {sshLabel}
      </p>
      <LatencySparkline icmp={series.icmp} ssh={series.ssh} />
    </div>
  );
}
