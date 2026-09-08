import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoblockBody, INFOBLOCK_CHROME } from "@/components/charts/infoblock";
import { Sparkline } from "@/components/charts/traffic-chart";
import { TrafficWindows } from "@/components/charts/traffic-windows";
import { WindowTrafficValues } from "@/components/charts/window-traffic";
import { ActivePeersToggle } from "@/components/servers/active-peers-toggle";
import { ServerLatencyReadout } from "@/components/servers/server-latency";
import { DeleteServerDialog } from "@/components/servers/delete-server-dialog";
import { ServerSettingsDialog } from "@/components/servers/server-settings-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { peerPresence, serverPollBadge } from "@/lib/presence";
import {
  activeAwgVersionLabel,
  displayPeerEndpoint,
  displayPeerName,
  formatDateTime,
  formatEndpointGeo,
  formatRelativeHandshake,
  formatUptime,
} from "@/lib/utils";
import { getServerDetail, peersTrafficTotals, serverTrafficWindows } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

const TRAFFIC_RX_LABEL = "исходящий:";
const TRAFFIC_TX_LABEL = "входящий:";

function statusTone(kind: "ok" | "warn" | "off") {
  if (kind === "ok") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (kind === "warn") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-zinc-100 text-zinc-700";
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function peerEndpointHostLine(
  endpoint: string | null,
  geo: {
    countryName: string | null;
    cityName: string | null;
    organization: string | null;
  },
) {
  const host = displayPeerEndpoint(endpoint)?.host;
  if (!host) {
    return null;
  }
  const suffix = formatEndpointGeo(geo);
  return suffix ? `${host} (${suffix})` : host;
}

export default async function ServerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ active?: string | string[] }>;
}) {
  const { id } = await params;
  const { active } = await searchParams;
  const activeOnly = firstSearchParam(active) !== "0";
  const server = await getServerDetail(id);
  if (!server) {
    notFound();
  }

  const peers = server.vpnInstance?.peers ?? [];
  const peerRows = peers.map((peer) => {
    const sample = peer.samples[0];
    const status = peerPresence({
      status: peer.status,
      capturedAt: sample?.capturedAt,
      handshakeUnix: sample?.handshakeUnix,
      rxDelta: sample?.rxDelta,
      txDelta: sample?.txDelta,
    });
    return { peer, sample, status };
  });
  const visibleRows = activeOnly ? peerRows.filter((row) => row.status.kind === "online") : peerRows;
  const [byPeer, windows] = await Promise.all([
    peersTrafficTotals(visibleRows.map((row) => row.peer.id)),
    serverTrafficWindows(server.id),
  ]);
  const latest = server.serverSamples[0];
  const version = activeAwgVersionLabel(server.vpnInstance?.awgVersion);
  const pollBadge = serverPollBadge({
    lastPollAt: server.lastPollAt,
    lastSampleAt: latest?.capturedAt,
    lastPollError: server.lastPollError,
    running: Boolean(server.vpnInstance?.running),
    versionLabel: version,
  });
  const lastPollLabel = latest
    ? formatDateTime(latest.capturedAt)
    : server.lastPollAt
      ? formatDateTime(server.lastPollAt)
      : null;

  return (
    <main className="w-full space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(pollBadge.tone)}`}>
              {pollBadge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {server.host}
            {server.vpnInstance?.containerName ? ` · ${server.vpnInstance.containerName}` : ""}
            {server.vpnInstance?.listenPort ? ` · UDP ${server.vpnInstance.listenPort}` : ""}
            {server.vpnInstance?.hostListenPort &&
            server.vpnInstance.hostListenPort !== server.vpnInstance.listenPort
              ? ` · хост ${server.vpnInstance.hostListenPort}`
              : ""}
            {server.vpnInstance?.containerStartedAt
              ? ` · аптайм ${formatUptime(server.vpnInstance.containerStartedAt)}`
              : ""}
          </p>
          <div className="mt-2">
            <ServerLatencyReadout samples={server.latencySamples} compact />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <ServerSettingsDialog
            serverId={server.id}
            username={server.sshUsername}
            authMethod={server.sshAuthMethod}
          />
          <DeleteServerDialog serverId={server.id} serverName={server.name} />
        </div>
      </div>

      {server.lastPollError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {server.lastPollError}
        </p>
      )}

      <TrafficWindows
        firstCard={
          <div className={INFOBLOCK_CHROME}>
            <InfoblockBody
              label="Пиры"
              value={latest ? `${latest.onlineCount} / ${latest.peerCount}` : "—"}
              caption="сессии WG"
            />
          </div>
        }
        windows={windows}
        chartTitle="Трафик сервера"
        lastPollLabel={lastPollLabel}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Пиры</CardTitle>
          <ActivePeersToggle checked={activeOnly} />
        </CardHeader>
        <CardContent>
          {peers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пиры появятся после успешного опроса живого awg show.</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет активных пиров.</p>
          ) : (
            <ul className="divide-y">
              {visibleRows.map(({ peer, sample, status }) => {
                const peerTraffic = byPeer.get(peer.id);
                const window30m = peerTraffic?.["30m"] ?? { rx: 0n, tx: 0n };
                const window24h = peerTraffic?.["24h"] ?? { rx: 0n, tx: 0n };
                const window30d = peerTraffic?.["30d"] ?? { rx: 0n, tx: 0n };
                const spark = [...peer.samples].reverse().map((item) => Number(item.rxDelta + item.txDelta));
                const endpointLine = peerEndpointHostLine(peer.endpoint, {
                  countryName: peer.endpointCountryName,
                  cityName: peer.endpointCityName,
                  organization: peer.endpointOrganization,
                });
                return (
                  <li key={peer.id}>
                    <Link href={`/servers/${server.id}/peers/${peer.id}`} className="block rounded-md py-3 hover:bg-accent/40">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{displayPeerName(peer.vpnName, peer.publicKey)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(status.tone)}`}>{status.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Handshake: {sample ? formatRelativeHandshake(sample.handshakeUnix) : "—"}
                            {peer.allowedIps ? ` · ${peer.allowedIps}` : ""}
                            {endpointLine ? ` · ${endpointLine}` : ""}
                          </p>
                          {!peer.vpnName && (
                            <p className="text-[11px] text-muted-foreground">{peer.publicKey}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-4 sm:min-w-[520px] sm:justify-end">
                          <div className="min-w-0 text-right text-xs">
                            <p className="tabular-nums">
                              За 30 минут:{" "}
                              <WindowTrafficValues
                                rx={window30m.rx}
                                tx={window30m.tx}
                                rxLabel={TRAFFIC_RX_LABEL}
                                txLabel={TRAFFIC_TX_LABEL}
                              />
                            </p>
                            <p className="text-muted-foreground tabular-nums">
                              За 24 часа:{" "}
                              <WindowTrafficValues
                                rx={window24h.rx}
                                tx={window24h.tx}
                                rxLabel={TRAFFIC_RX_LABEL}
                                txLabel={TRAFFIC_TX_LABEL}
                              />
                            </p>
                            <p className="text-muted-foreground tabular-nums">
                              За 30 дней:{" "}
                              <WindowTrafficValues
                                rx={window30d.rx}
                                tx={window30d.tx}
                                rxLabel={TRAFFIC_RX_LABEL}
                                txLabel={TRAFFIC_TX_LABEL}
                              />
                            </p>
                          </div>
                          <Sparkline values={spark} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
