import Link from "next/link";
import { notFound } from "next/navigation";

import { Sparkline } from "@/components/charts/traffic-chart";
import { TrafficWindows } from "@/components/charts/traffic-windows";
import { DeleteServerDialog } from "@/components/servers/delete-server-dialog";
import { ServerSettingsDialog } from "@/components/servers/server-settings-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { peerPresence, serverPollBadge } from "@/lib/presence";
import {
  activeAwgVersionLabel,
  displayPeerName,
  formatPeerEndpointLine,
  formatDateTime,
  formatRelativeHandshake,
  formatUptime,
  formatWindowTraffic,
} from "@/lib/utils";
import { getServerDetail, peersTrafficTotals, serverTrafficWindows } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

function statusTone(kind: "ok" | "warn" | "off") {
  if (kind === "ok") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (kind === "warn") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-zinc-100 text-zinc-700";
}

export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = await getServerDetail(id);
  if (!server) {
    notFound();
  }

  const peers = server.vpnInstance?.peers ?? [];
  const [byPeer, windows] = await Promise.all([
    peersTrafficTotals(peers.map((peer) => peer.id)),
    serverTrafficWindows(server.id),
  ]);
  const traffic24h = [...byPeer.values()].map((item) => item["24h"]);
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
  const maxPeerDay = traffic24h.reduce((max, item) => {
    const total = Number(item.rx + item.tx);
    return total > max ? total : max;
  }, 1);

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
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Пиры</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {latest ? `${latest.onlineCount} / ${latest.peerCount}` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              сессии WG / всего по последнему опросу
            </CardContent>
          </Card>
        }
        windows={windows}
        rxLabel="От пиров"
        txLabel="К пирам"
        fromLabel="от пиров"
        toLabel="к пирам"
        chartTitle="Трафик сервера"
        lastPollLabel={lastPollLabel}
        chartScope="server"
      />

      <Card>
        <CardHeader>
          <CardTitle>Пиры</CardTitle>
          <CardDescription>Имя — из clientsTable на VPN. Если файла нет или он пуст, показываем начало публичного ключа.</CardDescription>
        </CardHeader>
        <CardContent>
          {peers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пиры появятся после успешного опроса живого awg show.</p>
          ) : (
            <ul className="divide-y">
              {peers.map((peer) => {
                const peerTraffic = byPeer.get(peer.id);
                const window30m = peerTraffic?.["30m"] ?? { rx: 0n, tx: 0n };
                const window24h = peerTraffic?.["24h"] ?? { rx: 0n, tx: 0n };
                const sample = peer.samples[0];
                const spark = [...peer.samples].reverse().map((item) => Number(item.rxDelta + item.txDelta));
                const dayTotal = Number(window24h.rx + window24h.tx);
                const status = peerPresence({
                  status: peer.status,
                  capturedAt: sample?.capturedAt,
                  handshakeUnix: sample?.handshakeUnix,
                  rxDelta: sample?.rxDelta,
                  txDelta: sample?.txDelta,
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
                            {peer.endpoint
                              ? ` · ${formatPeerEndpointLine(peer.endpoint, {
                                  countryName: peer.endpointCountryName,
                                  cityName: peer.endpointCityName,
                                  organization: peer.endpointOrganization,
                                }) ?? peer.endpoint}`
                              : ""}
                          </p>
                          {!peer.vpnName && (
                            <p className="text-[11px] text-muted-foreground">{peer.publicKey}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-4 sm:min-w-[360px] sm:justify-end">
                          <div className="min-w-0 text-right text-xs">
                            <p className="tabular-nums">
                              За 30 минут: {formatWindowTraffic(window30m.rx, window30m.tx)}
                            </p>
                            <p className="text-muted-foreground tabular-nums">
                              За 24 часа: {formatWindowTraffic(window24h.rx, window24h.tx)}
                            </p>
                            <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-foreground/70"
                                style={{ width: `${Math.max(4, Math.round((dayTotal / maxPeerDay) * 100))}%` }}
                              />
                            </div>
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
