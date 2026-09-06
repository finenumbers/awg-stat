import assert from "node:assert/strict";
import { test } from "node:test";

import { filterPointsSince } from "./traffic-points";

test("filterPointsSince drops points older than the window", () => {
  const now = 1_000_000_000;
  const since = now - 30 * 60 * 1000;
  const points = [
    { t: now - 31 * 60 * 1000, rx: 1, tx: 1 },
    { t: now - 10 * 60 * 1000, rx: 2, tx: 2 },
    { t: now - 1000, rx: 3, tx: 3 },
  ];
  const out = filterPointsSince(points, since);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.rx, 2);
  assert.equal(out[1]?.rx, 3);
});

test("filterPointsSince needs two fresh points for a line chart", () => {
  const now = 1_000_000_000;
  const since = now - 30 * 60 * 1000;
  const stale = filterPointsSince([{ t: now - 40 * 60 * 1000, rx: 8, tx: 1 }], since);
  const fresh = filterPointsSince(
    [
      { t: now - 20_000, rx: 4, tx: 1 },
      { t: now - 5000, rx: 6, tx: 2 },
    ],
    since,
  );
  assert.ok(stale.length < 2);
  assert.ok(fresh.length >= 2);
});
