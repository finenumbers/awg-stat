import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_UNAVAILABLE_LABEL, formatRttMs, freshIcmpLabel } from "./latency";

const NOW = Date.parse("2026-09-08T00:00:00.000Z");

test("formats RTT and treats missing as н/д", () => {
  assert.equal(formatRttMs(null), "н/д");
  assert.equal(formatRttMs(0), "<1 мс");
  assert.equal(formatRttMs(14), "14 мс");
});

test("freshIcmpLabel always shows current RTT or unavailable", () => {
  assert.equal(freshIcmpLabel(14, new Date(NOW - 15_000)), "14 мс");
  assert.equal(freshIcmpLabel(14, new Date(NOW - 3 * 60_000)), "14 мс");
  assert.equal(freshIcmpLabel(null, new Date(NOW)), ICMP_UNAVAILABLE_LABEL);
  assert.equal(freshIcmpLabel(null, null), null);
  assert.equal(freshIcmpLabel(14, null), "14 мс");
});
