import assert from "node:assert/strict";
import { test } from "node:test";

import { readBlockCheckToken } from "./token";

test("readBlockCheckToken treats an empty value as missing", () => {
  assert.deepEqual(readBlockCheckToken(undefined), { kind: "missing" });
  assert.deepEqual(readBlockCheckToken(null), { kind: "missing" });
  assert.deepEqual(readBlockCheckToken(""), { kind: "missing" });
  assert.deepEqual(readBlockCheckToken("   "), { kind: "missing" });
  assert.deepEqual(readBlockCheckToken("Bearer"), { kind: "missing" });
  assert.deepEqual(readBlockCheckToken("Bearer   "), { kind: "missing" });
});

test("readBlockCheckToken strips one bearer prefix and surrounding space", () => {
  assert.deepEqual(readBlockCheckToken("secret-token"), { kind: "ready", value: "secret-token" });
  assert.deepEqual(readBlockCheckToken("  secret-token\n"), { kind: "ready", value: "secret-token" });
  assert.deepEqual(readBlockCheckToken("Bearer secret-token"), { kind: "ready", value: "secret-token" });
  assert.deepEqual(readBlockCheckToken("bearer\tsecret-token"), { kind: "ready", value: "secret-token" });
});

test("readBlockCheckToken rejects whitespace or control characters inside the token", () => {
  assert.deepEqual(readBlockCheckToken("sec ret"), { kind: "invalid" });
  assert.deepEqual(readBlockCheckToken("sec\nret"), { kind: "invalid" });
  assert.deepEqual(readBlockCheckToken("Bearer sec ret"), { kind: "invalid" });
});
