import assert from "node:assert/strict";
import { test } from "node:test";

import { PROTOCOL_TRAFFIC_MAX_BYTES } from "@/server/poll-defaults";

import {
  isPeerOnline,
  isPollFresh,
  isProtocolTraffic,
  peerPresence,
  presenceEventView,
  presenceTransition,
  previousPresenceOnline,
  serverPollBadge,
} from "./presence";

const NOW = Date.parse("2026-09-06T00:00:00.000Z");
const NOW_SEC = Math.floor(NOW / 1000);

test("peerPresence: fresh handshake is online", () => {
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt: new Date(NOW - 15_000),
    handshakeUnix: BigInt(NOW_SEC - 20),
    nowMs: NOW,
  });
  assert.equal(presence.kind, "online");
  assert.equal(presence.label, "онлайн · сессия");
  assert.equal(presence.activity, "session");
});

test("peerPresence: handshake 70s old without traffic is session", () => {
  const capturedAt = new Date(NOW - 15_000);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix: BigInt(Math.floor(capturedAt.getTime() / 1000) - 70),
    rxDelta: 0n,
    txDelta: 0n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "online");
  assert.equal(presence.activity, "session");
  assert.equal(presence.label, "онлайн · сессия");
  assert.equal(presence.sessionLeftSec, 110);
  assert.equal(presence.handshakeAgeSec, 70);
});

test("peerPresence: user-scale traffic is active online", () => {
  const capturedAt = new Date(NOW - 15_000);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix: BigInt(Math.floor(capturedAt.getTime() / 1000) - 20),
    rxDelta: 50_000n,
    txDelta: 0n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "online");
  assert.equal(presence.activity, "active");
  assert.equal(presence.label, "онлайн");
  assert.equal(presence.pollBytes, 50_000n);
});

test("peerPresence: handshake 200s old with keepalive bytes is offline", () => {
  const capturedAt = new Date(NOW - 15_000);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix: BigInt(Math.floor(capturedAt.getTime() / 1000) - 200),
    rxDelta: 128n,
    txDelta: 0n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "offline");
  assert.equal(presence.activity, null);
  assert.equal(presence.sessionLeftSec, null);
});

test("peerPresence: stale handshake plus 2.57 KB tx is offline", () => {
  const capturedAt = new Date(NOW - 15_000);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix: BigInt(Math.floor(capturedAt.getTime() / 1000) - 540),
    rxDelta: 0n,
    txDelta: 2632n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "offline");
  assert.equal(presence.pollBytes, 2632n);
});

test("peerPresence: sessionLeftSec is taken from the poll snapshot, not nowMs", () => {
  const capturedAt = new Date(NOW - 15_000);
  const handshakeUnix = BigInt(Math.floor(capturedAt.getTime() / 1000) - 40);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix,
    rxDelta: 0n,
    txDelta: 0n,
    nowMs: NOW + 50_000,
  });
  assert.equal(presence.kind, "online");
  assert.equal(presence.sessionLeftSec, 140);
});

test("isProtocolTraffic stays at the documented 4 KiB ceiling", () => {
  assert.equal(isProtocolTraffic(0), true);
  assert.equal(isProtocolTraffic(128n), true);
  assert.equal(isProtocolTraffic(PROTOCOL_TRAFFIC_MAX_BYTES), true);
  assert.equal(isProtocolTraffic(PROTOCOL_TRAFFIC_MAX_BYTES + 1), false);
});

test("peerPresence: handshake 200s old without traffic is offline", () => {
  const capturedAt = new Date(NOW - 15_000);
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix: BigInt(Math.floor(capturedAt.getTime() / 1000) - 200),
    rxDelta: 0n,
    txDelta: 0n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "offline");
});

test("peerPresence: snapshot does not age between refreshes", () => {
  const capturedAt = new Date(NOW - 15_000);
  const handshakeUnix = BigInt(Math.floor(capturedAt.getTime() / 1000) - 170);
  const atCapture = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix,
    rxDelta: 0n,
    txDelta: 0n,
    nowMs: capturedAt.getTime(),
  });
  const afterRefresh = peerPresence({
    status: "ACTIVE",
    capturedAt,
    handshakeUnix,
    rxDelta: 0n,
    txDelta: 0n,
    nowMs: NOW + 50_000,
  });
  assert.equal(atCapture.kind, "online");
  assert.equal(afterRefresh.kind, "online");
});

test("peerPresence: 3h-old sample is stale, not online", () => {
  const presence = peerPresence({
    status: "ACTIVE",
    capturedAt: new Date(NOW - 3 * 3600 * 1000),
    handshakeUnix: BigInt(NOW_SEC - 3 * 3600),
    rxDelta: 1024n,
    nowMs: NOW,
  });
  assert.equal(presence.kind, "stale");
  assert.equal(presence.label, "данные устарели");
});

test("isPeerOnline: future handshake counts as a live session", () => {
  assert.equal(
    isPeerOnline({
      capturedAt: new Date(NOW),
      handshakeUnix: BigInt(NOW_SEC + 30),
    }),
    true,
  );
});

test("isPeerOnline: stale handshake stays offline even with traffic", () => {
  const capturedAt = new Date(NOW);
  assert.equal(
    isPeerOnline({
      capturedAt,
      handshakeUnix: BigInt(NOW_SEC - 200),
      rxDelta: 128n,
      txDelta: 2632n,
    }),
    false,
  );
  assert.equal(
    isPeerOnline({
      capturedAt,
      handshakeUnix: BigInt(NOW_SEC - 20),
      rxDelta: 0n,
      txDelta: 0n,
    }),
    true,
  );
});

test("isPollFresh stays at 120s after session threshold change", () => {
  assert.equal(isPollFresh(new Date(NOW - 90_000), NOW), true);
  assert.equal(isPollFresh(new Date(NOW - 121_000), NOW), false);
});

test("previousPresenceOnline prefers last event over last sample", () => {
  assert.equal(previousPresenceOnline({ lastEventKind: "OFFLINE", lastSampleOnline: true }), false);
  assert.equal(previousPresenceOnline({ lastEventKind: "ONLINE", lastSampleOnline: false }), true);
  assert.equal(previousPresenceOnline({ lastSampleOnline: true }), true);
  assert.equal(previousPresenceOnline({}), null);
});

test("presenceTransition: first sample online emits ONLINE, offline is silent", () => {
  assert.equal(presenceTransition({ online: true, previousOnline: null }), "ONLINE");
  assert.equal(presenceTransition({ online: false, previousOnline: null }), null);
});

test("presenceTransition: flips both ways and ignores no-op", () => {
  assert.equal(presenceTransition({ online: true, previousOnline: false }), "ONLINE");
  assert.equal(presenceTransition({ online: false, previousOnline: true }), "OFFLINE");
  assert.equal(presenceTransition({ online: true, previousOnline: true }), null);
  assert.equal(presenceTransition({ online: false, previousOnline: false }), null);
});

test("presenceTransition: vanish after OFFLINE event stays silent", () => {
  const previousOnline = previousPresenceOnline({ lastEventKind: "OFFLINE", lastSampleOnline: true });
  assert.equal(presenceTransition({ online: false, previousOnline }), null);
});

test("presenceTransition: return after vanish emits ONLINE", () => {
  const previousOnline = previousPresenceOnline({ lastEventKind: "OFFLINE", lastSampleOnline: true });
  assert.equal(presenceTransition({ online: true, previousOnline }), "ONLINE");
});

test("presenceTransition: pruned events fall back to sample and stay quiet if still online", () => {
  const previousOnline = previousPresenceOnline({ lastSampleOnline: true });
  assert.equal(presenceTransition({ online: true, previousOnline }), null);
});

test("presenceEventView matches status card labels", () => {
  assert.deepEqual(presenceEventView("ONLINE"), { kind: "online", label: "онлайн", tone: "ok" });
  assert.deepEqual(presenceEventView("OFFLINE"), { kind: "offline", label: "офлайн", tone: "warn" });
});

test("serverPollBadge prefers stale over frozen running flag", () => {
  const badge = serverPollBadge({
    lastPollAt: new Date(NOW - 3 * 3600 * 1000),
    lastPollError: null,
    running: true,
    versionLabel: "AmneziaWG 3.1",
    nowMs: NOW,
  });
  assert.equal(badge.kind, "stale");
});
