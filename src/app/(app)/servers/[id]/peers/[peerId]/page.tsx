import { notFound } from "next/navigation";

import { TrafficWindows } from "@/components/charts/traffic-windows";
import { PresenceEventsCard } from "@/components/peers/presence-events-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { peerPresence, type PresenceKind } from "@/lib/presence";
import { cn, displayPeerInternalIp, displayPeerName, formatDateTime, formatRelativeHandshake } from "@/lib/utils";
import { getPeerDetail, listPeerPresenceEvents, peerTrafficWindows } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

function statusCardClass(kind: PresenceKind): string {
  if (kind === "online") {
    return "border-emerald-400 bg-emerald-200 text-emerald-950";
  }
  if (kind === "offline") {
    return "border-red-400 bg-red-200 text-red-950";
  }
  return "";
}

export default async function PeerPage({
  params,
}: {
  params: Promise<{ id: string; peerId: string }>;
}) {
  const { id, peerId } = await params;
  const peer = await getPeerDetail(id, peerId);
  if (!peer) {
    notFound();
  }

  const [windows, presenceEvents] = await Promise.all([
    peerTrafficWindows(peer.id),
    listPeerPresenceEvents(peer.id),
  ]);
  const latest = peer.samples[0];
  const name = displayPeerName(peer.vpnName, peer.publicKey);
  const internalIp = displayPeerInternalIp(peer.allowedIps);
  const presence = peerPresence({
    status: peer.status,
    capturedAt: latest?.capturedAt,
    handshakeUnix: latest?.handshakeUnix,
    rxDelta: latest?.rxDelta,
    txDelta: latest?.txDelta,
  });
  const server = peer.vpnInstance.server;
  const lastPollLabel = latest
    ? formatDateTime(latest.capturedAt)
    : server.lastPollAt
      ? formatDateTime(server.lastPollAt)
      : null;

  return (
    <main className="w-full space-y-6 p-8">
      <div>
        <p className="text-sm text-muted-foreground">{peer.vpnInstance.server.name}</p>
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{name}</h1>
          {internalIp ? (
            <p className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight text-right">
              {internalIp}
            </p>
          ) : null}
        </div>
        <p className="mt-1 break-all text-xs text-muted-foreground">{peer.publicKey}</p>
      </div>

      {server.lastPollError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {server.lastPollError}
        </p>
      ) : null}

      <TrafficWindows
        firstCard={
          <Card className={statusCardClass(presence.kind)}>
            <CardHeader className="pb-2">
              <CardDescription
                className={cn(
                  (presence.kind === "online" || presence.kind === "offline") && "text-current/70",
                )}
              >
                Статус
              </CardDescription>
              <CardTitle className="text-lg">{presence.label}</CardTitle>
            </CardHeader>
            <CardContent
              className={cn(
                "text-sm",
                presence.kind === "online" || presence.kind === "offline"
                  ? "text-current/70"
                  : "text-muted-foreground",
              )}
            >
              Handshake: {latest ? formatRelativeHandshake(latest.handshakeUnix) : "—"}
              {lastPollLabel ? ` · опрос ${lastPollLabel}` : ""}
            </CardContent>
          </Card>
        }
        windows={windows}
        rxLabel="От пира"
        txLabel="К пиру"
        fromLabel="от пира"
        toLabel="к пиру"
        chartTitle="Трафик пира"
        lastPollLabel={lastPollLabel}
      />

      <PresenceEventsCard
        items={presenceEvents.items}
        total={presenceEvents.total}
        currentEndpoint={peer.endpoint}
        currentGeo={{
          countryName: peer.endpointCountryName,
          cityName: peer.endpointCityName,
          organization: peer.endpointOrganization,
        }}
      />
    </main>
  );
}
