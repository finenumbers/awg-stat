"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { isProtocolTraffic } from "@/lib/presence";
import { formatBytes, formatChartTime } from "@/lib/utils";

export type TrafficPoint = { t: number; rx: number; tx: number };

const RX_COLOR = "#0f766e";
const TX_COLOR = "#4338ca";

function yTicks(max: number): number[] {
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const raw = max <= 0 ? 1 : max;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = (nice.find((n) => n * exp >= raw / 4) ?? 10) * exp;
  const top = Math.max(step, Math.ceil(raw / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) {
    ticks.push(value);
  }
  return ticks;
}

export function TrafficChart({
  points,
  height = 260,
  rxLabel = "От пиров",
  txLabel = "К пирам",
  unitLabel = "За опрос",
  emptyTitle,
  emptyHint,
  protocolCeiling = false,
}: {
  points: TrafficPoint[];
  height?: number;
  rxLabel?: string;
  txLabel?: string;
  unitLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
  protocolCeiling?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [points.length]);

  const layout = useMemo(() => {
    const left = 68;
    const right = 18;
    const top = 18;
    const bottom = 42;
    const innerW = Math.max(width - left - right, 1);
    const innerH = height - top - bottom;
    const maxValue = Math.max(...points.flatMap((point) => [point.rx, point.tx]), 0);
    const ticks = yTicks(maxValue);
    const max = ticks[ticks.length - 1] ?? 1;
    const span = points.length > 1 ? points[points.length - 1]!.t - points[0]!.t : 0;
    const xAt = (index: number) =>
      left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
    const yAt = (value: number) => top + innerH - (value / max) * innerH;
    const path = (key: "rx" | "tx") =>
      points
        .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(point[key]).toFixed(1)}`)
        .join(" ");
    const area = (key: "rx" | "tx") =>
      points.length > 1
        ? `${path(key)} L${xAt(points.length - 1).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} Z`
        : "";
    const timeIndexes = points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    if (points.length >= 5) {
      timeIndexes.splice(1, 0, Math.floor((points.length - 1) / 4));
      timeIndexes.splice(3, 0, Math.floor(((points.length - 1) * 3) / 4));
    }
    return { width, left, top, innerW, innerH, max, ticks, span, xAt, yAt, path, area, timeIndexes: [...new Set(timeIndexes)] };
  }, [points, height, width]);

  if (points.length < 2) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        <p>{emptyTitle ?? "Недостаточно опросов для графика"}</p>
        <p className="mt-1 text-xs">
          {emptyHint ?? `Появится после двух точек. Ось Y — объём ${unitLabel.toLowerCase()}, не скорость.`}
        </p>
      </div>
    );
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: RX_COLOR }} />
            {rxLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: TX_COLOR }} />
            {txLabel}
          </span>
        </div>
        <p className="text-muted-foreground">{unitLabel}</p>
      </div>
      <div ref={chartRef} className="relative w-full">
        <svg
          viewBox={`0 0 ${layout.width} ${height}`}
          className="block w-full"
          style={{ height }}
          preserveAspectRatio="none"
          role="img"
          aria-label="Трафик по опросам"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * layout.width;
            const ratio = (x - layout.left) / layout.innerW;
            const index = Math.round(Math.min(1, Math.max(0, ratio)) * (points.length - 1));
            setHover(index);
          }}
        >
          {layout.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={layout.left}
                x2={layout.left + layout.innerW}
                y1={layout.yAt(tick)}
                y2={layout.yAt(tick)}
                stroke="currentColor"
                className="text-border"
                strokeWidth="1"
              />
              <text
                x={layout.left - 8}
                y={layout.yAt(tick) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="11"
              >
                {formatBytes(tick)}
              </text>
            </g>
          ))}
          {layout.timeIndexes.map((index) => (
            <text
              key={`t-${index}`}
              x={layout.xAt(index)}
              y={height - 12}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="11"
            >
              {formatChartTime(points[index]!.t, layout.span)}
            </text>
          ))}
          <path d={layout.area("tx")} fill={TX_COLOR} opacity="0.18" />
          <path d={layout.area("rx")} fill={RX_COLOR} opacity="0.18" />
          <path d={layout.path("rx")} fill="none" stroke={RX_COLOR} strokeWidth="2" />
          <path d={layout.path("tx")} fill="none" stroke={TX_COLOR} strokeWidth="2" />
          {hover !== null && (
            <>
              <line
                x1={layout.xAt(hover)}
                x2={layout.xAt(hover)}
                y1={layout.top}
                y2={layout.top + layout.innerH}
                stroke="currentColor"
                className="text-foreground/30"
                strokeDasharray="3 3"
              />
              <circle cx={layout.xAt(hover)} cy={layout.yAt(points[hover]!.rx)} r="3.5" fill={RX_COLOR} />
              <circle cx={layout.xAt(hover)} cy={layout.yAt(points[hover]!.tx)} r="3.5" fill={TX_COLOR} />
            </>
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border bg-card/95 px-3 py-2 text-xs shadow-sm">
            <p className="font-medium">{formatChartTime(active.t, layout.span)}</p>
            <p style={{ color: RX_COLOR }}>
              {rxLabel}: {formatBytes(active.rx)}
            </p>
            <p style={{ color: TX_COLOR }}>
              {txLabel}: {formatBytes(active.tx)}
            </p>
            {protocolCeiling && isProtocolTraffic(active.rx + active.tx) ? (
              <p className="mt-1 text-muted-foreground">служебный</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-8 w-24 rounded bg-muted/60" />;
  }
  const width = 96;
  const height = 32;
  const max = Math.max(...values, 1);
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 2) - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24 text-foreground/70" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
