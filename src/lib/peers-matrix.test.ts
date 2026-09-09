import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPeersTrafficMatrix, type PeersMatrixPeer, type PeersMatrixServer } from "./peers-matrix";

const servers: PeersMatrixServer[] = [
  { id: "de", name: "Германия" },
  { id: "uk", name: "Великобритания" },
];

function traffic(entries: Array<[string, bigint, bigint]>) {
  return new Map(entries.map(([id, rx, tx]) => [id, { rx, tx }]));
}

test("same name on two servers is one row with values in separate columns", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "p-uk", name: "Иван", serverId: "uk" },
    { id: "p-de", name: "Иван", serverId: "de" },
  ];
  const matrix = buildPeersTrafficMatrix(
    servers,
    peers,
    traffic([
      ["p-uk", 100n, 50n],
      ["p-de", 20n, 10n],
    ]),
  );

  assert.deepEqual(
    matrix.rows.map((row) => row.name),
    ["Иван"],
  );
  assert.equal(matrix.rows[0]?.cells[0]?.peerId, "p-de");
  assert.equal(matrix.rows[0]?.cells[0]?.bytes, 30n);
  assert.equal(matrix.rows[0]?.cells[1]?.peerId, "p-uk");
  assert.equal(matrix.rows[0]?.cells[1]?.bytes, 150n);
});

test("partial rename is two rows keyed by current names", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "p-uk", name: "Пётр", serverId: "uk" },
    { id: "p-de", name: "Иван", serverId: "de" },
  ];
  const matrix = buildPeersTrafficMatrix(
    servers,
    peers,
    traffic([
      ["p-uk", 8n, 2n],
      ["p-de", 3n, 1n],
    ]),
  );

  assert.deepEqual(
    matrix.rows.map((row) => row.name),
    ["Иван", "Пётр"],
  );
  assert.equal(matrix.rows[0]?.cells[0]?.bytes, 4n);
  assert.equal(matrix.rows[0]?.cells[1], null);
  assert.equal(matrix.rows[1]?.cells[0], null);
  assert.equal(matrix.rows[1]?.cells[1]?.bytes, 10n);
});

test("missing peer on a server is a dash and zero traffic is zero bytes", () => {
  const peers: PeersMatrixPeer[] = [{ id: "p-uk", name: "Иван", serverId: "uk" }];
  const matrix = buildPeersTrafficMatrix(servers, peers, traffic([]));

  assert.equal(matrix.rows[0]?.cells[0], null);
  assert.deepEqual(matrix.rows[0]?.cells[1], { peerId: "p-uk", bytes: 0n });
});

test("trims names and drops empty or whitespace-only vpnName", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "keep", name: "  Анна  ", serverId: "uk" },
    { id: "empty", name: "", serverId: "uk" },
    { id: "spaces", name: "   ", serverId: "de" },
  ];
  const matrix = buildPeersTrafficMatrix(servers, peers, traffic([["keep", 1n, 1n]]));

  assert.deepEqual(
    matrix.rows.map((row) => row.name),
    ["Анна"],
  );
  assert.equal(matrix.rows[0]?.cells[1]?.bytes, 2n);
});

test("sorts peer rows with the same collator as servers", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "2", name: "vpn-10", serverId: "uk" },
    { id: "3", name: "Ёлка", serverId: "uk" },
    { id: "1", name: "Vpn-2", serverId: "de" },
    { id: "4", name: "альфа", serverId: "de" },
  ];
  const matrix = buildPeersTrafficMatrix(servers, peers, traffic([]));
  assert.deepEqual(
    matrix.rows.map((row) => row.name),
    ["альфа", "Ёлка", "Vpn-2", "vpn-10"],
  );
});

test("rebuilds every column when a server is added or removed", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "p-uk", name: "Иван", serverId: "uk" },
    { id: "p-de", name: "Иван", serverId: "de" },
    { id: "p-nl", name: "Иван", serverId: "nl" },
  ];
  const two = buildPeersTrafficMatrix(servers, peers, traffic([["p-uk", 1n, 0n]]));
  assert.equal(two.servers.length, 2);
  assert.equal(two.rows[0]?.cells.length, 2);
  assert.equal(two.rows[0]?.cells[1]?.peerId, "p-uk");

  const threeServers = [...servers, { id: "nl", name: "Нидерланды" }];
  const three = buildPeersTrafficMatrix(threeServers, peers, traffic([["p-nl", 4n, 1n]]));
  assert.equal(three.servers.length, 3);
  assert.equal(three.rows[0]?.cells.length, 3);
  assert.equal(three.rows[0]?.cells[2]?.bytes, 5n);

  const one = buildPeersTrafficMatrix([servers[1]!], peers, traffic([["p-uk", 1n, 0n]]));
  assert.equal(one.servers.length, 1);
  assert.equal(one.rows[0]?.cells.length, 1);
  assert.equal(one.rows[0]?.cells[0]?.peerId, "p-uk");
});

test("server without peers still contributes a column of dashes", () => {
  const peers: PeersMatrixPeer[] = [{ id: "p-uk", name: "Иван", serverId: "uk" }];
  const matrix = buildPeersTrafficMatrix(servers, peers, traffic([["p-uk", 1n, 0n]]));
  assert.equal(matrix.servers.length, 2);
  assert.equal(matrix.rows[0]?.cells[0], null);
  assert.equal(matrix.rows[0]?.cells[1]?.bytes, 1n);
});

test("same name on one server keeps the smaller peer id and does not throw", () => {
  const peers: PeersMatrixPeer[] = [
    { id: "p-b", name: "Иван", serverId: "uk" },
    { id: "p-a", name: "Иван", serverId: "uk" },
  ];
  const matrix = buildPeersTrafficMatrix(
    servers,
    peers,
    traffic([
      ["p-b", 100n, 0n],
      ["p-a", 3n, 1n],
    ]),
  );

  assert.equal(matrix.rows.length, 1);
  assert.deepEqual(matrix.rows[0]?.cells[1], { peerId: "p-a", bytes: 4n });
});
