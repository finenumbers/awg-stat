import assert from "node:assert/strict";
import { test } from "node:test";

import { bearerMatches } from "@/lib/docker/bearer";

test("bearer token match ignores a missing or wrong header", () => {
  assert.equal(bearerMatches("Bearer secret", "secret"), true);
  assert.equal(bearerMatches("Bearer other", "secret"), false);
  assert.equal(bearerMatches(undefined, "secret"), false);
  assert.equal(bearerMatches("secret", "secret"), false);
});
