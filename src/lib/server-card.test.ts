import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_UNAVAILABLE_LABEL } from "./latency";
import { overviewCardChrome } from "./server-card";

test("overviewCardChrome stays neutral without ping failure or TSPU block", () => {
  assert.equal(overviewCardChrome({ icmpLabel: null, blockStatus: null }), "hover:bg-accent/40");
  assert.equal(overviewCardChrome({ icmpLabel: "14 мс", blockStatus: "unrestricted" }), "hover:bg-accent/40");
});

test("overviewCardChrome tints red when ICMP is unavailable", () => {
  assert.equal(
    overviewCardChrome({ icmpLabel: ICMP_UNAVAILABLE_LABEL, blockStatus: null }),
    "border-red-200 bg-red-50 hover:bg-red-100",
  );
});

test("overviewCardChrome tints blue when TSPU is blocked", () => {
  assert.equal(
    overviewCardChrome({ icmpLabel: "14 мс", blockStatus: "blocked" }),
    "border-sky-200 bg-sky-50 hover:bg-sky-100",
  );
});

test("overviewCardChrome prefers ping failure over TSPU block", () => {
  assert.equal(
    overviewCardChrome({ icmpLabel: ICMP_UNAVAILABLE_LABEL, blockStatus: "blocked" }),
    "border-red-200 bg-red-50 hover:bg-red-100",
  );
});
