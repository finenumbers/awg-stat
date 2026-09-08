import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRttMs, latestFreshLatency, latencySparkSeries, shouldPersistLatencySample } from "./latency";

const NOW = Date.parse("2026-09-08T00:00:00.000Z");

test("persists a sample when at least one RTT exists", () => {
  assert.equal(shouldPersistLatencySample(null, null), false);
  assert.equal(shouldPersistLatencySample(12, null), true);
  assert.equal(shouldPersistLatencySample(null, 18), true);
});

test("formats RTT and treats missing as н/д", () => {
  assert.equal(formatRttMs(null), "н/д");
  assert.equal(formatRttMs(0), "<1 мс");
  assert.equal(formatRttMs(14), "14 мс");
});

test("latestFreshLatency ignores stale samples", () => {
  const fresh = latestFreshLatency(
    [{ capturedAt: new Date(NOW - 15_000), icmpRttMs: 10, sshRttMs: 20 }],
    NOW,
  );
  assert.deepEqual(fresh, {
    icmpRttMs: 10,
    sshRttMs: 20,
    capturedAt: new Date(NOW - 15_000),
  });
  assert.equal(
    latestFreshLatency([{ capturedAt: new Date(NOW - 3 * 60_000), icmpRttMs: 10, sshRttMs: 20 }], NOW),
    null,
  );
});

test("spark series keep nulls and reverse to chronological order", () => {
  const series = latencySparkSeries([
    { capturedAt: new Date(NOW), icmpRttMs: 20, sshRttMs: null },
    { capturedAt: new Date(NOW - 15_000), icmpRttMs: null, sshRttMs: 11 },
  ]);
  assert.deepEqual(series.icmp, [null, 20]);
  assert.deepEqual(series.ssh, [11, null]);
});
