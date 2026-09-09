import { compareServerName } from "@/lib/utils";

export type PeersMatrixServer = { id: string; name: string };

export type PeersMatrixPeer = { id: string; name: string; serverId: string };

export type PeersMatrixTraffic = Map<string, { rx: bigint; tx: bigint }>;

export type PeersMatrixCell = { peerId: string; rx: bigint; tx: bigint };

export type PeersMatrixRow = { name: string; cells: Array<PeersMatrixCell | null> };

export type PeersMatrix = {
  servers: PeersMatrixServer[];
  rows: PeersMatrixRow[];
};

type CellDraft = { id: string; rx: bigint; tx: bigint };

export function buildPeersTrafficMatrix(
  servers: PeersMatrixServer[],
  peers: PeersMatrixPeer[],
  traffic: PeersMatrixTraffic,
): PeersMatrix {
  const serverIds = new Set(servers.map((server) => server.id));
  const byName = new Map<string, Map<string, CellDraft>>();

  for (const peer of peers) {
    const name = peer.name.trim();
    if (!name || !serverIds.has(peer.serverId)) {
      continue;
    }

    const byServer = byName.get(name) ?? new Map<string, CellDraft>();
    const previous = byServer.get(peer.serverId);
    if (previous && previous.id <= peer.id) {
      byName.set(name, byServer);
      continue;
    }

    const totals = traffic.get(peer.id) ?? { rx: 0n, tx: 0n };
    byServer.set(peer.serverId, { id: peer.id, rx: totals.rx, tx: totals.tx });
    byName.set(name, byServer);
  }

  const rows = [...byName.entries()]
    .sort((left, right) => compareServerName(left[0], right[0]))
    .map(([name, byServer]) => ({
      name,
      cells: servers.map((server) => {
        const cell = byServer.get(server.id);
        return cell ? { peerId: cell.id, rx: cell.rx, tx: cell.tx } : null;
      }),
    }));

  return { servers, rows };
}
