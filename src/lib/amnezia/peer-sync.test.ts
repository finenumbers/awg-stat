import assert from "node:assert/strict";
import { test } from "node:test";

import { isPeerListComplete, planPeerRemovals, type StoredPeer } from "./peer-sync";

const active = (id: string, publicKey: string): StoredPeer => ({ id, publicKey, status: "ACTIVE" });
const removed = (id: string, publicKey: string): StoredPeer => ({ id, publicKey, status: "REMOVED" });

test("peer list is complete only when a closing marker is its own line", () => {
  assert.equal(isPeerListComplete(""), false);
  assert.equal(isPeerListComplete("---GATE:peers---\nawg0\tkey"), false);
  assert.equal(isPeerListComplete("note ---GATE:end--- inside"), false);
  assert.equal(isPeerListComplete("---GATE:endpoints---\n---GATE:clients-table---\n{"), true);
  assert.equal(isPeerListComplete("---GATE:clients-table---\n[]\n---GATE:end---"), true);
});

test("incomplete dump does not mark or delete missing peers", () => {
  const plan = planPeerRemovals([active("a", "key-a"), removed("b", "key-b")], [], false);
  assert.deepEqual(plan, { deleteIds: [], markRemovedIds: [] });
});

test("first complete absence marks an active peer and does not delete it", () => {
  const plan = planPeerRemovals([active("a", "key-a"), active("b", "key-b")], ["key-b"], true);
  assert.deepEqual(plan, { deleteIds: [], markRemovedIds: ["a"] });
});

test("second complete absence deletes a peer already marked removed", () => {
  const plan = planPeerRemovals([removed("a", "key-a"), active("b", "key-b")], ["key-b"], true);
  assert.deepEqual(plan, { deleteIds: ["a"], markRemovedIds: [] });
});

test("a key present in the dump is neither marked nor deleted", () => {
  const plan = planPeerRemovals([removed("a", "key-a")], ["key-a"], true);
  assert.deepEqual(plan, { deleteIds: [], markRemovedIds: [] });
});

test("empty complete dump marks active peers first and deletes them on the next pass", () => {
  const peers = [active("a", "key-a"), active("b", "key-b")];
  const first = planPeerRemovals(peers, [], true);
  assert.deepEqual(first, { deleteIds: [], markRemovedIds: ["a", "b"] });
  const second = planPeerRemovals(
    peers.map((peer) => ({ ...peer, status: "REMOVED" as const })),
    [],
    true,
  );
  assert.deepEqual(second, { deleteIds: ["a", "b"], markRemovedIds: [] });
});
