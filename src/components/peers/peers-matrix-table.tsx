import Link from "next/link";

import type { PeersMatrix } from "@/lib/peers-matrix";
import { formatBytes } from "@/lib/utils";

export function PeersMatrixTable({ matrix }: { matrix: PeersMatrix }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">Трафик пиров за 30 дней</caption>
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left font-semibold"
            >
              Пир
            </th>
            {matrix.servers.map((server) => (
              <th
                key={server.id}
                scope="col"
                title={server.name}
                className="whitespace-nowrap px-3 py-2.5 text-right font-semibold"
              >
                {server.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.name} className="border-b last:border-b-0">
              <th
                scope="row"
                title={row.name}
                className="sticky left-0 z-10 max-w-48 truncate bg-card px-3 py-2.5 text-left font-medium"
              >
                {row.name}
              </th>
              {row.cells.map((cell, index) => {
                const server = matrix.servers[index];
                if (!server) {
                  return null;
                }
                return (
                  <td key={server.id} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {cell ? (
                      <Link
                        href={`/servers/${server.id}/peers/${cell.peerId}`}
                        className="hover:underline"
                      >
                        {formatBytes(cell.bytes)}
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
