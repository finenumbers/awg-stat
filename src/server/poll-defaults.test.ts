import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRESENCE_RETENTION_DAYS,
  RAW_SAMPLE_RETENTION_HOURS,
  SPARKLINE_SAMPLES,
  presenceCutoff,
  rawSampleCutoff,
} from "./poll-defaults";

test("raw samples stay 48h so 24h charts still have a clock-skew margin", () => {
  assert.equal(RAW_SAMPLE_RETENTION_HOURS, 48);
  assert.ok(RAW_SAMPLE_RETENTION_HOURS > 24);
});

test("presence journal stays 30 days and is not tied to raw sample retention", () => {
  assert.equal(PRESENCE_RETENTION_DAYS, 30);
  assert.ok(PRESENCE_RETENTION_DAYS * 24 > RAW_SAMPLE_RETENTION_HOURS);
});

test("cutoffs are wall-clock windows from now", () => {
  const now = Date.parse("2026-09-15T00:00:00.000Z");
  assert.equal(rawSampleCutoff(now).toISOString(), "2026-09-13T00:00:00.000Z");
  assert.equal(presenceCutoff(now).toISOString(), "2026-08-16T00:00:00.000Z");
});

test("sparkline still covers 192 last polls", () => {
  assert.equal(SPARKLINE_SAMPLES, 192);
});
