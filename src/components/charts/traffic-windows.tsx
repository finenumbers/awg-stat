"use client";

import { useState, type ReactNode } from "react";

import { TrafficChart, type TrafficPoint } from "@/components/charts/traffic-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isProtocolTraffic } from "@/lib/presence";
import { cn, formatBytes } from "@/lib/utils";

export type TrafficWindowId = "30m" | "24h" | "30d";

export type TrafficWindowView = {
  totals: { rx: number; tx: number };
  points: TrafficPoint[];
};

const WINDOW_IDS: TrafficWindowId[] = ["30m", "24h", "30d"];

const WINDOW_LABELS: Record<TrafficWindowId, string> = {
  "30m": "За 30 минут",
  "24h": "За 24 часа",
  "30d": "За 30 дней",
};

const UNIT_LABELS: Record<TrafficWindowId, string> = {
  "30m": "За опрос",
  "24h": "За минуту",
  "30d": "За час",
};

const CHART_HINTS: Record<TrafficWindowId, string> = {
  "30m": "Объём за каждый опрос. Наведите на график, чтобы увидеть точное время и байты.",
  "24h": "Объём за каждую минуту. Наведите на график, чтобы увидеть точное время и байты.",
  "30d": "Объём за каждый час. Наведите на график, чтобы увидеть точное время и байты.",
};

export type TrafficChartScope = "peer" | "server";
export type ProtocolScale = "poll";

function windowMaxBytes(points: TrafficPoint[]): number {
  return Math.max(0, ...points.map((point) => point.rx + point.tx));
}

function chartHint(
  id: TrafficWindowId,
  scope: TrafficChartScope,
  protocolScaleActive: boolean,
): string {
  if (id === "30m" && protocolScaleActive) {
    return "Масштаб служебного трафика (keepalive/handshake). Ось Y — байты за опрос, не скорость.";
  }
  if (id === "30m" && scope === "server") {
    return "Объём за каждый опрос, сумма пиров. Мелкие всплески — keepalive/handshake.";
  }
  if (id === "30m" && scope === "peer") {
    return "Объём за каждый опрос. Мелкие всплески — keepalive/handshake протокола.";
  }
  return CHART_HINTS[id];
}

function WindowCard({
  id,
  totals,
  fromLabel,
  toLabel,
  active,
  onSelect,
  stale,
}: {
  id: TrafficWindowId;
  totals: { rx: number; tx: number };
  fromLabel: string;
  toLabel: string;
  active: boolean;
  onSelect: (id: TrafficWindowId) => void;
  stale?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(id)}
      className={cn(
        "rounded-lg border bg-card p-6 text-left text-card-foreground shadow-sm transition-colors",
        active ? "border-yellow-400 bg-yellow-200" : "hover:bg-accent/40",
        stale && !active && "opacity-70",
      )}
    >
      <p className="text-sm text-muted-foreground">{WINDOW_LABELS[id]}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {formatBytes(totals.rx + totals.tx)}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        {fromLabel} {formatBytes(totals.rx)} · {toLabel} {formatBytes(totals.tx)}
      </p>
      {stale ? <p className="mt-2 text-xs text-amber-800">нет свежих опросов</p> : null}
    </button>
  );
}

export function TrafficWindows({
  firstCard,
  windows,
  rxLabel,
  txLabel,
  fromLabel,
  toLabel,
  chartTitle,
  lastPollLabel,
  chartScope = "server",
  protocolScale,
}: {
  firstCard: ReactNode;
  windows: Record<TrafficWindowId, TrafficWindowView>;
  rxLabel: string;
  txLabel: string;
  fromLabel: string;
  toLabel: string;
  chartTitle: string;
  lastPollLabel?: string | null;
  chartScope?: TrafficChartScope;
  protocolScale?: ProtocolScale;
}) {
  const [active, setActive] = useState<TrafficWindowId>("30m");
  const current = windows[active];
  const empty30m = windows["30m"].points.length < 2;
  const protocolScaleActive =
    protocolScale === "poll" &&
    active === "30m" &&
    current.points.length >= 2 &&
    isProtocolTraffic(windowMaxBytes(current.points));
  const emptyTitle =
    active === "30m" && empty30m
      ? "Нет опросов за последние 30 минут"
      : undefined;
  const emptyHint =
    active === "30m" && empty30m
      ? lastPollLabel
        ? `Последний опрос: ${lastPollLabel}`
        : "Появится после двух свежих опросов."
      : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {firstCard}
        {WINDOW_IDS.map((id) => (
          <WindowCard
            key={id}
            id={id}
            totals={windows[id].totals}
            fromLabel={fromLabel}
            toLabel={toLabel}
            active={active === id}
            onSelect={setActive}
            stale={id === "30m" && empty30m}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
          <CardDescription>{chartHint(active, chartScope, protocolScaleActive)}</CardDescription>
        </CardHeader>
        <CardContent>
          <TrafficChart
            points={current.points}
            rxLabel={rxLabel}
            txLabel={txLabel}
            unitLabel={UNIT_LABELS[active]}
            emptyTitle={emptyTitle}
            emptyHint={emptyHint}
            protocolCeiling={protocolScale === "poll" && active === "30m"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
