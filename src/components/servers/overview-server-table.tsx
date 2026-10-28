import Link from "next/link";

import {
  BLOCK_CHECK_FRACTION_SEPARATOR,
  blockCheckBadge,
  blockCheckLabel,
  blockCheckLabelParts,
} from "@/lib/block-check/label";
import { buildDetailUrl } from "@/lib/block-check/probe-stream";
import { ICMP_TABLE_UNAVAILABLE_LABEL } from "@/lib/latency";
import type { PresenceTone } from "@/lib/presence";
import { RX_COLOR, TX_COLOR } from "@/lib/traffic-colors";
import { cn, formatBytes, formatDateTime, formatInteger } from "@/lib/utils";

const COLUMNS = ["Сервер", "Адрес", "Пиры", "Версия", "Трафик за 30 минут", "Трафик за 24 часа", "Трафик за 30 дней", "Задержка", "Блокировка ТСПУ"] as const;

const VERSION_TONE: Record<PresenceTone, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-800",
  off: "text-muted-foreground",
};

export type OverviewTraffic = { rx: bigint; tx: bigint };

export type OverviewServerRow = {
  id: string;
  name: string;
  host: string;
  peers:
    | { kind: "sample"; online: number; total: number; fresh: boolean }
    | { kind: "count"; total: number };
  versionLabel: string;
  versionTone: PresenceTone;
  traffic30m: OverviewTraffic;
  traffic24h: OverviewTraffic;
  traffic30d: OverviewTraffic;
  icmpText: string | null;
  blockStatus: string | null;
  blockCheckedAt: Date | null;
  tspuVotes: number | null;
  probeVotes: number | null;
};

function TrafficHalf({
  value,
  widthText,
  color,
}: {
  value: string;
  widthText: string;
  color: string;
}) {
  return (
    <span className="grid px-3 text-right font-bold tabular-nums whitespace-nowrap" style={{ color }}>
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
        {widthText}
      </span>
      <span className="col-start-1 row-start-1">{value}</span>
    </span>
  );
}

function TrafficPair({ rx, tx }: OverviewTraffic) {
  const outgoing = formatBytes(rx);
  const incoming = formatBytes(tx);
  return (
    <span className="grid grid-cols-2">
      <TrafficHalf value={outgoing} widthText={incoming} color={RX_COLOR} />
      <TrafficHalf value={incoming} widthText={outgoing} color={TX_COLOR} />
    </span>
  );
}

function PeerCount({ peers }: { peers: OverviewServerRow["peers"] }) {
  if (peers.kind === "count") {
    return <span className="tabular-nums">{formatInteger(peers.total)}</span>;
  }
  const live = peers.online > 0 && peers.fresh;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={live ? "font-bold text-emerald-600 underline" : undefined}>
        {formatInteger(peers.online)}
      </span>
      {` / ${formatInteger(peers.total)}`}
    </span>
  );
}

function BlockCell({ row }: { row: OverviewServerRow }) {
  const badge = blockCheckBadge(row.blockStatus);
  if (!badge) {
    return null;
  }
  const parts = blockCheckLabelParts(badge, { tspuVotes: row.tspuVotes, probeVotes: row.probeVotes });
  const label = blockCheckLabel(badge, { tspuVotes: row.tspuVotes, probeVotes: row.probeVotes });
  const title = row.blockCheckedAt ? `${label} · ${formatDateTime(row.blockCheckedAt)}` : label;
  return (
    <a
      href={buildDetailUrl(row.host)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={title}
      className="flex items-center justify-between gap-2 whitespace-nowrap px-3 py-2"
    >
      <span
        className={
          badge === "blocked"
            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"
            : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
        }
      >
        {parts.base}
      </span>
      {parts.tspuVotes != null && parts.probeVotes != null ? (
        <span className="tabular-nums">
          {parts.emphasizeTspu ? <span className="font-bold text-red-700">{parts.tspuVotes}</span> : parts.tspuVotes}
          {BLOCK_CHECK_FRACTION_SEPARATOR}
          {parts.probeVotes}
        </span>
      ) : null}
    </a>
  );
}

export function OverviewServerTable({ rows }: { rows: OverviewServerRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max border-separate border-spacing-0 text-sm [&_tbody_tr:last-child_td]:border-b-0 [&_td:not(:last-child)]:border-r [&_th:not(:last-child)]:border-r">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="border-b px-3 py-2 text-center font-medium whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border-b px-3 py-2 whitespace-nowrap">
                <Link href={`/servers/${row.id}`} className="hover:underline">
                  {row.name}
                </Link>
              </td>
              <td className="border-b px-3 py-2 text-right whitespace-nowrap">{row.host}</td>
              <td className="border-b px-3 py-2 text-right whitespace-nowrap">
                <PeerCount peers={row.peers} />
              </td>
              <td className={cn("border-b px-3 py-2 whitespace-nowrap", VERSION_TONE[row.versionTone])}>
                {row.versionLabel}
              </td>
              <td className="border-b py-2 whitespace-nowrap">
                <TrafficPair {...row.traffic30m} />
              </td>
              <td className="border-b py-2 whitespace-nowrap">
                <TrafficPair {...row.traffic24h} />
              </td>
              <td className="border-b py-2 whitespace-nowrap">
                <TrafficPair {...row.traffic30d} />
              </td>
              <td
                className={cn(
                  "border-b px-3 py-2 text-right whitespace-nowrap",
                  row.icmpText === ICMP_TABLE_UNAVAILABLE_LABEL && "font-medium text-red-700",
                )}
              >
                {row.icmpText}
              </td>
              <td className="border-b p-0 whitespace-nowrap">
                <BlockCell row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
