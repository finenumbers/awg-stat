"use client";

import { useState } from "react";

import type { TrafficWindowId } from "@/components/charts/traffic-windows";
import { PeersMatrixTable } from "@/components/peers/peers-matrix-table";
import type { PeersMatrixView } from "@/lib/peers-matrix";
import { cn } from "@/lib/utils";

const WINDOW_IDS: TrafficWindowId[] = ["30m", "24h", "30d"];

const WINDOW_LABELS: Record<TrafficWindowId, string> = {
  "30m": "За 30 минут",
  "24h": "За 24 часа",
  "30d": "За 30 дней",
};

const WINDOW_CAPTIONS: Record<TrafficWindowId, string> = {
  "30m": "Трафик пиров за 30 минут",
  "24h": "Трафик пиров за 24 часа",
  "30d": "Трафик пиров за 30 дней",
};

const LONGEST_LABEL = WINDOW_LABELS["30m"];

export function PeersMatrixView({ windows }: { windows: Record<TrafficWindowId, PeersMatrixView> }) {
  const [active, setActive] = useState<TrafficWindowId>("30m");

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Пиры</h1>
        <div role="group" aria-label="Период трафика" className="ml-auto flex justify-end gap-2">
          {WINDOW_IDS.map((id) => {
            const selected = active === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActive(id)}
                className={cn(
                  "inline-flex items-center justify-center rounded-md border border-black px-3 py-1.5 text-sm font-medium",
                  selected ? "bg-black text-white" : "bg-white text-black",
                )}
              >
                <span className="relative">
                  <span aria-hidden className="invisible whitespace-nowrap">
                    {LONGEST_LABEL}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
                    {WINDOW_LABELS[id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <PeersMatrixTable matrix={windows[active]} caption={WINDOW_CAPTIONS[active]} />
    </>
  );
}
