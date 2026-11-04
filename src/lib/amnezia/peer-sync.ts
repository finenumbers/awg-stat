export type StoredPeerStatus = "ACTIVE" | "REMOVED";

export type StoredPeer = {
  id: string;
  publicKey: string;
  status: StoredPeerStatus;
};

export type PeerRemovalPlan = {
  deleteIds: string[];
  markRemovedIds: string[];
};

const COMPLETE_MARKERS = new Set(["---GATE:clients-table---", "---GATE:end---"]);

export function isPeerListComplete(raw: string): boolean {
  return raw.split(/\r?\n/).some((line) => COMPLETE_MARKERS.has(line.trim()));
}

export function planPeerRemovals(
  existing: readonly StoredPeer[],
  seenPublicKeys: Iterable<string>,
  listComplete: boolean,
): PeerRemovalPlan {
  if (!listComplete) {
    return { deleteIds: [], markRemovedIds: [] };
  }
  const seen = seenPublicKeys instanceof Set ? seenPublicKeys : new Set(seenPublicKeys);
  const deleteIds: string[] = [];
  const markRemovedIds: string[] = [];
  for (const peer of existing) {
    if (seen.has(peer.publicKey)) {
      continue;
    }
    if (peer.status === "REMOVED") {
      deleteIds.push(peer.id);
    } else {
      markRemovedIds.push(peer.id);
    }
  }
  return { deleteIds, markRemovedIds };
}
