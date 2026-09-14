import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSparkline, pushSparkline, sparklinePoint } from "./sparkline";

test("sparklinePoint matches Number(rx+tx) used on the old sample list", () => {
  assert.equal(sparklinePoint(10n, 3n), Number(10n + 3n));
  assert.equal(sparklinePoint(0n, 0n), 0);
});

test("parseSparkline keeps finite numbers and drops junk", () => {
  assert.deepEqual(parseSparkline(null), []);
  assert.deepEqual(parseSparkline([1, 2, Number.NaN, "x", 3]), [1, 2, 3]);
});

test("pushSparkline is oldest-first and caps at 192", () => {
  const first = pushSparkline([], 4);
  assert.deepEqual(first, [4]);
  const grown = pushSparkline(new Array(192).fill(1), 9);
  assert.equal(grown.length, 192);
  assert.equal(grown[0], 1);
  assert.equal(grown[191], 9);
});
