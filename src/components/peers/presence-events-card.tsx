import type { PeerPresenceEvent } from "@prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { presenceEventView } from "@/lib/presence";
import { displayPeerEndpoint, formatDateTime } from "@/lib/utils";

function statusTone(tone: "ok" | "warn" | "off") {
  if (tone === "ok") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (tone === "warn") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-zinc-100 text-zinc-700";
}

function EndpointLabel({ endpoint }: { endpoint: string | null }) {
  const parsed = displayPeerEndpoint(endpoint);
  if (!parsed) {
    return <span className="text-muted-foreground">нет в архиве</span>;
  }
  return (
    <span className="font-mono tabular-nums">
      {parsed.host}
      {parsed.port ? <span className="text-muted-foreground">:{parsed.port}</span> : null}
    </span>
  );
}

function CurrentEndpoint({ endpoint }: { endpoint: string | null | undefined }) {
  const parsed = displayPeerEndpoint(endpoint);
  if (!parsed) {
    return null;
  }
  return (
    <p className="text-sm">
      Сейчас{" "}
      <span className="font-mono tabular-nums">
        {parsed.host}
        {parsed.port ? <span className="text-muted-foreground">:{parsed.port}</span> : null}
      </span>
    </p>
  );
}

export function PresenceEventsCard({
  items,
  total,
  currentEndpoint,
}: {
  items: PeerPresenceEvent[];
  total: number;
  currentEndpoint?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Подключения</CardTitle>
        <CardDescription>
          Переходы онлайн / офлайн по опросам (handshake 180 с или трафик). IP у строки — endpoint в момент перехода.
          У записей до обновления адреса не было в сырых сэмплах.
          {total > items.length ? ` Показаны ${items.length} из ${total} за 30 дней.` : ""}
        </CardDescription>
        <CurrentEndpoint endpoint={currentEndpoint} />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет смен состояния за 30 дней. Пир мог быть онлайн всё это время.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((event) => {
              const view = presenceEventView(event.kind);
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(view.tone)}`}>{view.label}</span>
                    <EndpointLabel endpoint={event.endpoint} />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(event.occurredAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
