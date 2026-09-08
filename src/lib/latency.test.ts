import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRttMs, freshIcmpLabel } from "./latency";

const NOW = Date.parse("2026-09-08T00:00:00.000Z");

test("formats RTT and treats missing as н/д", () => {
  assert.equal(formatRttMs(null), "н/д");
  assert.equal(formatRttMs(0), "<1 мс");
  assert.equal(formatRttMs(14), "14 мс");
});

test("freshIcmpLabel hides stale or missing ICMP", () => {
  assert.equal(freshIcmpLabel(14, new Date(NOW - 15_000), NOW), "14 мс");
  assert.equal(freshIcmpLabel(14, new Date(NOW - 3 * 60_000), NOW), null);
  assert.equal(freshIcmpLabel(null, new Date(NOW), NOW), null);
  assert.equal(freshIcmpLabel(14, null, NOW), null);
});
