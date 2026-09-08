import assert from "node:assert/strict";
import { test } from "node:test";

import { serverSchema } from "./server";

test("rejects flag-like SSH hosts", () => {
  const parsed = serverSchema.safeParse({ name: "vpn", host: "-f", port: 22 });
  assert.equal(parsed.success, false);
});

test("accepts a normal hostname", () => {
  const parsed = serverSchema.safeParse({ name: "vpn", host: "vpn.example.com", port: 22 });
  assert.equal(parsed.success, true);
});
