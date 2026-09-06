import Link from "next/link";
import { Suspense } from "react";

import { Sparkline } from "@/components/charts/traffic-chart";
import { DeletionNotice } from "@/components/servers/deletion-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverPollBadge } from "@/lib/presence";
import { activeAwgVersionLabel, formatBytes, formatDateTime, formatDbSizeGb } from "@/lib/utils";
import { ONLINE_THRESHOLD_SEC, POLL_INTERVAL_SEC } from "@/server/poll-defaults";
import { getDatabaseSizeBytes } from "@/server/services/database.service";
import { listServers } from "@/server/services/server.service";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [servers, databaseSizeBytes] = await Promise.all([listServers(), getDatabaseSizeBytes()]);
  return (
    <main className="w-full space-y-8 p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Мониторинг серверов AmneziaVPN</h1>
        <p className="ml-auto text-sm text-muted-foreground">Объем БД: {formatDbSizeGb(databaseSizeBytes)}</p>
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
            const lastPollLabel = latest
              ? formatDateTime(latest.capturedAt)
              : server.lastPollAt
                ? formatDateTime(server.lastPollAt)
                : null;

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
                    <div className="space-y-1 text-sm">
                      <p>
                        Пиры:{" "}
                        {latest ? (
                          <>
                            <span
                              className={
                                online > 0 && pollBadge.kind !== "stale" && pollBadge.kind !== "offline"
                                  ? "font-bold text-emerald-600"
                                  : undefined
                              }
                            >
                              {online} онлайн
                            </span>
                            {` / ${latest.peerCount} по последнему опросу`}
                          </>
                        ) : (
                          `${peers.length} (ещё нет сэмплов)`
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        {latest
                          ? `за последний опрос ${formatBytes(latest.rxDelta + latest.txDelta)}`
                          : "график появится после первого опроса"}
                      </p>
                      {lastPollLabel ? (
                        <p className="text-muted-foreground">опрос {lastPollLabel}</p>
                      ) : null}
                      {server.lastPollError && (
                        <p className="text-destructive">{server.lastPollError}</p>
                      )}
                    </div>
                    <Sparkline values={spark} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Сессия {ONLINE_THRESHOLD_SEC} с или трафик в опросе · опрос каждые {POLL_INTERVAL_SEC} с
      </p>
    </main>
  );
}
