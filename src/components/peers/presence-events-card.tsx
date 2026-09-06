import type { PeerPresenceEvent } from "@prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { presenceEventView } from "@/lib/presence";
import {
  displayPeerEndpoint,
  formatDateTime,
  formatEndpointGeo,
  type EndpointGeoLabel,
} from "@/lib/utils";

function statusTone(tone: "ok" | "warn" | "off") {
  if (tone === "ok") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (tone === "warn") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-zinc-100 text-zinc-700";
}

function EndpointParts({ endpoint, geo }: { endpoint: string | null | undefined; geo?: EndpointGeoLabel | null }) {
  const parsed = displayPeerEndpoint(endpoint);
  if (!parsed) {
    return <span className="text-muted-foreground">нет в архиве</span>;
  }
  const suffix = formatEndpointGeo(geo);
  return (
    <span className="tabular-nums">
      <span className="font-bold text-black">{parsed.host}</span>
      {parsed.port ? `:${parsed.port}` : null}
      {suffix ? ` (${suffix})` : null}
    </span>
  );
}

function EndpointLabel({ endpoint, geo }: { endpoint: string | null; geo?: EndpointGeoLabel | null }) {
  if (!displayPeerEndpoint(endpoint)) {
    return <span className="text-muted-foreground">нет в архиве</span>;
  }
  return <EndpointParts endpoint={endpoint} geo={geo} />;
}

function CurrentEndpoint({
  endpoint,
  geo,
}: {
  endpoint: string | null | undefined;
  geo?: EndpointGeoLabel | null;
}) {
  if (!displayPeerEndpoint(endpoint)) {
    return null;
  }
  return (
    <p className="text-sm">
      Сейчас <EndpointParts endpoint={endpoint} geo={geo} />
    </p>
  );
}

export function PresenceEventsCard({
  items,
  total,
  currentEndpoint,
  currentGeo,
}: {
  items: PeerPresenceEvent[];
  total: number;
  currentEndpoint?: string | null;
  currentGeo?: EndpointGeoLabel | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Подключения</CardTitle>
        {total > items.length ? (
          <CardDescription>
            Показаны {items.length} из {total} за 30 дней.
          </CardDescription>
        ) : null}
        <CurrentEndpoint endpoint={currentEndpoint} geo={currentGeo} />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет смен состояния за 30 дней. Пир мог быть онлайн всё это время.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map((event) => {
              const view = presenceEventView(event.kind);
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 ${statusTone(view.tone)}`}>{view.label}</span>
                    <EndpointLabel
                      endpoint={event.endpoint}
                      geo={{
                        countryName: event.countryName,
                        cityName: event.cityName,
                        organization: event.organization,
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground tabular-nums">{formatDateTime(event.occurredAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
