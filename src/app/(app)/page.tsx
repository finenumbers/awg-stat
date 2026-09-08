import Link from "next/link";
import { Suspense } from "react";

import { Sparkline } from "@/components/charts/traffic-chart";
import { WindowTrafficValues } from "@/components/charts/window-traffic";
import { DeletionNotice } from "@/components/servers/deletion-notice";
import { ServerIcmpHint } from "@/components/servers/server-icmp-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { freshIcmpLabel } from "@/lib/latency";
import { serverPollBadge } from "@/lib/presence";
import { activeAwgVersionLabel, formatDbSizeGb } from "@/lib/utils";
import { getDatabaseSizeBytes } from "@/server/services/database.service";
import { listServers, serversTraffic24h, serversTraffic30d } from "@/server/services/server.service";

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
  const serverIds = servers.map((server) => server.id);
  const [traffic24h, traffic30d] = await Promise.all([
    serversTraffic24h(serverIds),
    serversTraffic30d(serverIds),
  ]);
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
            const icmpLabel = freshIcmpLabel(server.lastIcmpRttMs, server.lastIcmpAt);
            const window30m = sumSampleDeltas(server.serverSamples);
            const window24h = traffic24h.get(server.id) ?? { rx: 0n, tx: 0n };
            const window30d = traffic30d.get(server.id) ?? { rx: 0n, tx: 0n };

            return (
              <Link key={server.id} href={`/servers/${server.id}`}>
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader className="pb-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{server.name}</CardTitle>
                        <CardDescription>{server.host}</CardDescription>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            pollBadge.tone === "ok"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {pollBadge.label}
                        </span>
                        <ServerIcmpHint label={icmpLabel} />
                      </div>
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
                        <p>
                          За 30 дней:{" "}
                          <WindowTrafficValues
                            rx={window30d.rx}
                            tx={window30d.tx}
                            rxLabel="исходящий:"
                            txLabel="входящий:"
                          />
                        </p>
                      </div>
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
    </main>
  );
}
