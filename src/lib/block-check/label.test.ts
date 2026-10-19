import assert from "node:assert/strict";
import { test } from "node:test";

import { BLOCK_BLOCKED_LABEL, BLOCK_UNRESTRICTED_LABEL, blockCheckBadge, blockCheckLabel } from "./label";

test("blockCheckBadge hides unknown and garbage values", () => {
  assert.equal(blockCheckBadge(null), null);
  assert.equal(blockCheckBadge(undefined), null);
  assert.equal(blockCheckBadge("unknown"), null);
  assert.equal(blockCheckBadge("blocked "), null);
  assert.equal(blockCheckBadge("unrestricted"), "unrestricted");
  assert.equal(blockCheckBadge("blocked"), "blocked");
});

test("blockCheckLabel matches the dashboard copy", () => {
  assert.equal(blockCheckLabel("unrestricted"), BLOCK_UNRESTRICTED_LABEL);
  assert.equal(blockCheckLabel("blocked"), BLOCK_BLOCKED_LABEL);
});

test("blockCheckLabel appends the TSPU scanner fraction", () => {
  assert.equal(blockCheckLabel("unrestricted", { tspuVotes: 0, probeVotes: 31 }), "Не ограничен (0/31)");
  assert.equal(blockCheckLabel("blocked", { tspuVotes: 16, probeVotes: 31 }), "Заблокирован (16/31)");
  assert.equal(blockCheckLabel("unrestricted", { tspuVotes: null, probeVotes: null }), BLOCK_UNRESTRICTED_LABEL);
  assert.equal(blockCheckLabel("blocked", { tspuVotes: 2, probeVotes: 1 }), BLOCK_BLOCKED_LABEL);
});
