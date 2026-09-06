import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDelta,
  parseClientsTable,
  parseDockerInspect,
  parseDockerPs,
  parsePollOutput,
  selectTargetContainer,
} from "./parse";

const KEY_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const KEY_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

function sectioned(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([name, body]) => `---GATE:${name}---\n${body}`)
    .concat("---GATE:end---")
    .join("\n");
}

test("parses non-secret awg show selectors and clientsTable names", () => {
  const raw = sectioned({
    "public-key": `awg0\t${KEY_A}`,
    "listen-port": "awg0\t55424",
    peers: `awg0\t${KEY_B}`,
    endpoints: `awg0\t${KEY_B}\t203.0.113.10:51820`,
    "allowed-ips": `awg0\t${KEY_B}\t10.8.1.2/32 10.8.1.3/32`,
    "latest-handshakes": `awg0\t${KEY_B}\t1700000000`,
    transfer: `awg0\t${KEY_B}\t1000\t2000`,
    "random-trailers": "awg0\ton",
    "disable-cookies": "awg0\toff",
    "clients-table": JSON.stringify([
      { clientId: KEY_B, userData: { clientName: "Телефон", creationDate: "2026-01-01" } },
    ]),
  });

  const parsed = parsePollOutput(raw);
  assert.equal(parsed.transferOk, true);
  assert.equal(parsed.handshakeOk, true);
  assert.equal(parsed.interfaceName, "awg0");
  assert.equal(parsed.listenPort, 55424);
  assert.equal(parsed.awgVersion, "V31");
  assert.equal(parsed.peers.length, 1);
  assert.equal(parsed.peers[0]?.publicKey, KEY_B);
  assert.equal(parsed.peers[0]?.rxBytes, 1000n);
  assert.equal(parsed.peers[0]?.txBytes, 2000n);
  assert.equal(parsed.peers[0]?.handshakeUnix, 1700000000n);
  assert.equal(parsed.peers[0]?.allowedIps, "10.8.1.2/32 10.8.1.3/32");
  assert.equal(parsed.peers[0]?.vpnName, "Телефон");
});

test("detects AWG 3.0 from content-padding-addition without trailers", () => {
  const raw = sectioned({
    "public-key": `awg0\t${KEY_A}`,
    "listen-port": "awg0\t55424",
    peers: `awg0\t${KEY_B}`,
    "latest-handshakes": `awg0\t${KEY_B}\t0`,
    transfer: `awg0\t${KEY_B}\t0\t0`,
    "content-padding-addition": "awg0\t4-12",
  });
  assert.equal(parsePollOutput(raw).awgVersion, "V30");
});

test("empty optional padding does not break transfer", () => {
  const raw = sectioned({
    "public-key": `awg0\t${KEY_A}`,
    "listen-port": "awg0\t1234",
    peers: `awg0\t${KEY_B}`,
    "latest-handshakes": `awg0\t${KEY_B}\t0`,
    transfer: `awg0\t${KEY_B}\t0\t0`,
    "content-padding-addition": "",
  });
  const parsed = parsePollOutput(raw);
  assert.equal(parsed.transferOk, true);
  assert.equal(parsed.awgVersion, "V2");
});

test("keeps peers when clientsTable is empty", () => {
  const raw = sectioned({
    "public-key": `awg0\t${KEY_A}`,
    "listen-port": "awg0\t1234",
    peers: `awg0\t${KEY_B}`,
    "latest-handshakes": `awg0\t${KEY_B}\t0`,
    transfer: `awg0\t${KEY_B}\t0\t0`,
    "clients-table": "",
  });
  const parsed = parsePollOutput(raw);
  assert.equal(parsed.peers.length, 1);
  assert.equal(parsed.peers[0]?.vpnName, null);
});

test("parses legacy clientsTable object", () => {
  const names = parseClientsTable(JSON.stringify({ [KEY_B]: { clientName: "Ноут" } }));
  assert.equal(names[0]?.name, "Ноут");
});

test("computeDelta treats counter reset as current value", () => {
  assert.equal(computeDelta(50n, null), 0n);
  assert.equal(computeDelta(150n, 100n), 50n);
  assert.equal(computeDelta(12n, 999n), 12n);
});

test("parses docker inspect TSV health fields", () => {
  const raw = "true\trunning\t2026-09-05T12:34:56.123456789Z\t3\t55424/udp=55424 80/tcp=8080 ";
  const parsed = parseDockerInspect(raw);
  assert.equal(parsed.running, true);
  assert.equal(parsed.status, "running");
  assert.equal(parsed.startedAt?.toISOString(), "2026-09-05T12:34:56.123Z");
  assert.equal(parsed.restartCount, 3);
  assert.equal(parsed.hostListenPort, 55424);
});

test("parses docker inspect false without inventing a start time", () => {
  const parsed = parseDockerInspect("false\texited\t0001-01-01T00:00:00Z\t0\t");
  assert.equal(parsed.running, false);
  assert.equal(parsed.status, "exited");
  assert.equal(parsed.startedAt, null);
  assert.equal(parsed.restartCount, 0);
  assert.equal(parsed.hostListenPort, null);
});

test("selects running amnezia-awg2 and does not invent containers", () => {
  const rows = parseDockerPs("amnezia-awg2\trunning\namnezia-awg\texited\namnezia-dns\trunning\n");
  assert.equal(rows.some((row) => row.name === "amnezia-dns"), false);
  const selected = selectTargetContainer(rows);
  assert.equal(selected.target?.name, "amnezia-awg2");
  assert.equal(selected.others[0]?.name, "amnezia-awg");
});
