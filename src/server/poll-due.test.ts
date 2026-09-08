import assert from "node:assert/strict";
import { test } from "node:test";

import { POLL_INTERVAL_SEC, UNCLAIMED_PERSIST_SEC } from "@/server/poll-defaults";

import { isServerPollDue } from "./poll-due";

const NOW = Date.parse("2026-09-08T12:00:00.000Z");

test("isServerPollDue: lastPollAt younger than the interval is not due", () => {
  assert.equal(
    isServerPollDue({
      lastPollAt: new Date(NOW - (POLL_INTERVAL_SEC * 1000 - 1)),
      instanceLastSeenAt: new Date(NOW - 3600_000),
      nowMs: NOW,
    }),
    false,
  );
});

test("isServerPollDue: lastPollAt at the interval is due", () => {
  assert.equal(
    isServerPollDue({
      lastPollAt: new Date(NOW - POLL_INTERVAL_SEC * 1000),
      nowMs: NOW,
    }),
    true,
  );
});

test("isServerPollDue: onboard before persist is never due", () => {
  assert.equal(isServerPollDue({ lastPollAt: null, instanceLastSeenAt: null, nowMs: NOW }), false);
  assert.equal(isServerPollDue({ nowMs: NOW }), false);
});

test("isServerPollDue: unclaimed persist waits 180s after lastSeenAt", () => {
  assert.equal(
    isServerPollDue({
      lastPollAt: null,
      instanceLastSeenAt: new Date(NOW - (UNCLAIMED_PERSIST_SEC * 1000 - 1)),
      nowMs: NOW,
    }),
    false,
  );
  assert.equal(
    isServerPollDue({
      lastPollAt: null,
      instanceLastSeenAt: new Date(NOW - UNCLAIMED_PERSIST_SEC * 1000),
      nowMs: NOW,
    }),
    true,
  );
});
