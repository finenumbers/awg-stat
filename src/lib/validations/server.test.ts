import assert from "node:assert/strict";
import { test } from "node:test";

import { isLoopbackProbeHost, localServerSchema, serverSchema } from "./server";

test("rejects flag-like SSH hosts", () => {
  const parsed = serverSchema.safeParse({ name: "vpn", host: "-f", port: 22 });
  assert.equal(parsed.success, false);
});

test("accepts a normal hostname", () => {
  const parsed = serverSchema.safeParse({ name: "vpn", host: "vpn.example.com", port: 22 });
  assert.equal(parsed.success, true);
});

test("local mode rejects loopback and accepts a public host", () => {
  assert.equal(isLoopbackProbeHost("127.0.0.1"), true);
  assert.equal(isLoopbackProbeHost("::1"), true);
  assert.equal(isLoopbackProbeHost("localhost"), true);
  assert.equal(localServerSchema.safeParse({ name: "vpn", host: "127.0.0.1" }).success, false);
  assert.equal(localServerSchema.safeParse({ name: "vpn", host: "vpn.example.com" }).success, true);
  assert.equal(localServerSchema.safeParse({ name: "vpn", host: "10.0.0.8" }).success, true);
});
