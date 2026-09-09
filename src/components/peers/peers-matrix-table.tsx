import Link from "next/link";

import type { PeersMatrix, PeersMatrixCell } from "@/lib/peers-matrix";
import { RX_COLOR, TX_COLOR } from "@/lib/traffic-colors";
import { cn, formatBytes } from "@/lib/utils";

const HEAD_SHADOW = "shadow-[inset_-1px_-1px_0_0_hsl(var(--border))]";
const HEAD_SHADOW_LAST = "shadow-[inset_0_-1px_0_0_hsl(var(--border))]";

function cellLabel(serverName: string, cell: PeersMatrixCell): string {
  return `${serverName}, исходящий ${formatBytes(cell.rx)}, входящий ${formatBytes(cell.tx)}`;
}

export function PeersMatrixTable({ matrix }: { matrix: PeersMatrix }) {
  const lastServerId = matrix.servers.at(-1)?.id;

  return (
    <div className="overflow-x-auto">
      <table className="w-max caption-bottom border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Трафик пиров за 30 дней</caption>
        <thead>
          <tr className="hover:bg-background">
            <th
              scope="col"
              className={cn(
                "sticky top-0 left-0 z-30 h-8 bg-background px-2 text-left align-middle text-sm font-medium whitespace-nowrap text-foreground",
                HEAD_SHADOW,
              )}
            >
              Пир
            </th>
            {matrix.servers.map((server) => (
              <th
                key={server.id}
                scope="col"
                title={server.name}
                className={cn(
                  "sticky top-0 z-20 h-8 bg-background px-2 text-right align-middle text-sm font-medium whitespace-nowrap text-foreground",
                  server.id === lastServerId ? HEAD_SHADOW_LAST : HEAD_SHADOW,
                )}
              >
                {server.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0 [&_tr:last-child_th]:border-b-0">
          {matrix.rows.map((row) => (
            <tr key={row.name} className="transition-colors hover:bg-muted/50 [&:hover_th]:bg-muted/50">
              <th
                scope="row"
                title={row.name}
                className="sticky left-0 z-10 max-w-48 truncate border-b border-r bg-background px-2 py-1 text-left align-middle font-medium"
              >
                {row.name}
              </th>
              {row.cells.map((cell, index) => {
                const server = matrix.servers[index];
                if (!server) {
                  return null;
                }
                return (
                  <td
                    key={server.id}
                    className="border-b border-r px-2 py-1 text-right align-middle whitespace-nowrap last:border-r-0"
                  >
                    {cell ? (
                      <Link
                        href={`/servers/${server.id}/peers/${cell.peerId}`}
                        title={cellLabel(server.name, cell)}
                        aria-label={cellLabel(server.name, cell)}
                        className="block hover:underline"
                      >
                        <span className="flex flex-col items-end leading-tight font-bold tabular-nums">
                          <span style={{ color: RX_COLOR }}>{formatBytes(cell.rx)}</span>
                          <span style={{ color: TX_COLOR }}>{formatBytes(cell.tx)}</span>
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
