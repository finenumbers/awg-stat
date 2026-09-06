"use client";

import { useState, type ReactNode } from "react";

import { InfoblockBody, INFOBLOCK_CHROME } from "@/components/charts/infoblock";
import { TrafficChart, type TrafficPoint } from "@/components/charts/traffic-chart";
import { WindowTrafficValues } from "@/components/charts/window-traffic";
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

export type ProtocolScale = "poll";

function windowMaxBytes(points: TrafficPoint[]): number {
  return Math.max(0, ...points.map((point) => point.rx + point.tx));
}

function chartHint(id: TrafficWindowId, protocolScaleActive: boolean): string | null {
  if (id === "30m" && protocolScaleActive) {
    return "Масштаб служебного трафика (keepalive/handshake). Ось Y — байты за опрос, не скорость.";
  }
  return null;
}

function WindowCard({
  id,
  totals,
  active,
  onSelect,
  stale,
}: {
  id: TrafficWindowId;
  totals: { rx: number; tx: number };
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
        INFOBLOCK_CHROME,
        "text-left transition-colors",
        active ? "border-yellow-400 bg-yellow-200" : "hover:bg-accent/40",
        stale && !active && "opacity-70",
      )}
    >
      <InfoblockBody
        label={WINDOW_LABELS[id]}
        value={formatBytes(totals.rx + totals.tx)}
        caption={<WindowTrafficValues rx={totals.rx} tx={totals.tx} />}
      />
      {stale ? <p className="mt-2 text-xs text-amber-800">нет свежих опросов</p> : null}
    </button>
  );
}

export function TrafficWindows({
  firstCard,
  windows,
  chartTitle,
  lastPollLabel,
  protocolScale,
}: {
  firstCard: ReactNode;
  windows: Record<TrafficWindowId, TrafficWindowView>;
  chartTitle: string;
  lastPollLabel?: string | null;
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
  const hint = chartHint(active, protocolScaleActive);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {firstCard}
        {WINDOW_IDS.map((id) => (
          <WindowCard
            key={id}
            id={id}
            totals={windows[id].totals}
            active={active === id}
            onSelect={setActive}
            stale={id === "30m" && empty30m}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
          {hint ? <CardDescription>{hint}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <TrafficChart
            points={current.points}
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
