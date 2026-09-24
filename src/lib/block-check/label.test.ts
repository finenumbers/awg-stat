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
