import Link from "next/link";
import { Suspense } from "react";

import { Sparkline } from "@/components/charts/traffic-chart";
import { WindowTrafficValues } from "@/components/charts/window-traffic";
import { DeletionNotice } from "@/components/servers/deletion-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverPollBadge } from "@/lib/presence";
import { activeAwgVersionLabel, formatDbSizeGb } from "@/lib/utils";
import { ONLINE_THRESHOLD_SEC, POLL_INTERVAL_SEC } from "@/server/poll-defaults";
import { getDatabaseSizeBytes } from "@/server/services/database.service";
import { listServers, serversTraffic24h } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

function sessionWord(count: number): string {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) {
    return "сессий";
  }
  if (last === 1) {
    return "сессия";
  }
  if (last > 1 && last < 5) {
    return "сессии";
  }
  return "сессий";
}

function sumSampleDeltas(samples: { rxDelta: bigint; txDelta: bigint }[]) {
  let rx = 0n;
  let tx = 0n;
  for (const sample of samples) {
    rx += sample.rxDelta;
    tx += sample.txDelta;
  }
  return { rx, tx };
}

export default async function OverviewPage() {
  const [servers, databaseSizeBytes] = await Promise.all([listServers(), getDatabaseSizeBytes()]);
  const traffic24h = await serversTraffic24h(servers.map((server) => server.id));
  return (
    <main className="w-full space-y-8 p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Мониторинг серверов AmneziaVPN</h1>
        <p className="ml-auto text-sm font-bold text-black">Объем БД: {formatDbSizeGb(databaseSizeBytes)}</p>
      </div>

      <Suspense fallback={null}>
        <DeletionNotice />
      </Suspense>

      {servers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Нет серверов</CardTitle>
            <CardDescription>
              Подключите существующую установку AmneziaWG 3.1. Gate ничего не устанавливает и не меняет на VPN.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((server) => {
            const latest = server.serverSamples[0];
            const spark = [...server.serverSamples]
              .reverse()
              .map((sample) => Number(sample.rxDelta + sample.txDelta));
            const peers = server.vpnInstance?.peers ?? [];
            const online =
              latest && server.vpnInstance
                ? latest.onlineCount
                : 0;
            const version = activeAwgVersionLabel(server.vpnInstance?.awgVersion);
            const pollBadge = serverPollBadge({
              lastPollAt: server.lastPollAt,
              lastSampleAt: latest?.capturedAt,
              lastPollError: server.lastPollError,
              running: Boolean(server.vpnInstance?.running),
              versionLabel: version,
            });
            const window30m = sumSampleDeltas(server.serverSamples);
            const window24h = traffic24h.get(server.id) ?? { rx: 0n, tx: 0n };

            return (
              <Link key={server.id} href={`/servers/${server.id}`}>
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{server.name}</CardTitle>
                        <CardDescription>{server.host}</CardDescription>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          pollBadge.tone === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {pollBadge.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-4">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p>
                        Пиры:{" "}
                        {latest ? (
                          <>
                            <span
                              className={
                                online > 0 && pollBadge.kind !== "stale" && pollBadge.kind !== "offline"
                                  ? "font-bold text-emerald-600 underline"
                                  : undefined
                              }
                            >
                              {online} {sessionWord(online)}
                            </span>
                            {` / ${latest.peerCount} по последнему опросу`}
                          </>
                        ) : (
                          `${peers.length} (ещё нет сэмплов)`
                        )}
                      </p>
                      <div className="text-muted-foreground">
                        <p>
                          За 30 минут:{" "}
                          <WindowTrafficValues
                            rx={window30m.rx}
                            tx={window30m.tx}
                            rxLabel="исходящий:"
                            txLabel="входящий:"
                          />
                        </p>
                        <p>
                          За 24 часа:{" "}
                          <WindowTrafficValues
                            rx={window24h.rx}
                            tx={window24h.tx}
                            rxLabel="исходящий:"
                            txLabel="входящий:"
                          />
                        </p>
                      </div>
                      {server.lastPollError && (
                        <p className="text-destructive">{server.lastPollError}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <Sparkline values={spark} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Сессия WG {ONLINE_THRESHOLD_SEC} с · опрос каждые {POLL_INTERVAL_SEC} с · мелкий трафик на
        графике — keepalive/handshake
      </p>
    </main>
  );
}
