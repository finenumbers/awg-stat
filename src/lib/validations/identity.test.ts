import assert from "node:assert/strict";
import { test } from "node:test";

import { sshUpdateRequiresSecret } from "./identity";

test("username-only update keeps the stored SSH method", () => {
  assert.equal(sshUpdateRequiresSecret("PASSWORD", "PASSWORD", false), false);
  assert.equal(sshUpdateRequiresSecret("PRIVATE_KEY", "PRIVATE_KEY", false), false);
});

test("changing SSH method without a new secret is rejected", () => {
  assert.equal(sshUpdateRequiresSecret("PASSWORD", "PRIVATE_KEY", false), true);
  assert.equal(sshUpdateRequiresSecret("PRIVATE_KEY", "PASSWORD", false), true);
});

test("new secret may change the SSH method", () => {
  assert.equal(sshUpdateRequiresSecret("PASSWORD", "PRIVATE_KEY", true), false);
  assert.equal(sshUpdateRequiresSecret("PRIVATE_KEY", "PASSWORD", true), false);
});
