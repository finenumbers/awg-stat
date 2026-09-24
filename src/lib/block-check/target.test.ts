import assert from "node:assert/strict";
import { test } from "node:test";

import { blockCheckHostKey, canQueryBlockCheckHost } from "./target";

test("canQueryBlockCheckHost allows public names and addresses", () => {
  assert.equal(canQueryBlockCheckHost("poland.gate.finenumbers.com"), true);
  assert.equal(canQueryBlockCheckHost("8.8.8.8"), true);
  assert.equal(canQueryBlockCheckHost("2001:4860:4860::8888"), true);
});

test("canQueryBlockCheckHost rejects private, CGNAT, and metadata addresses", () => {
  assert.equal(canQueryBlockCheckHost("10.1.2.3"), false);
  assert.equal(canQueryBlockCheckHost("192.168.0.5"), false);
  assert.equal(canQueryBlockCheckHost("100.64.0.8"), false);
  assert.equal(canQueryBlockCheckHost("169.254.169.254"), false);
  assert.equal(canQueryBlockCheckHost("127.0.0.1"), false);
  assert.equal(canQueryBlockCheckHost("::ffff:10.0.0.1"), false);
  assert.equal(canQueryBlockCheckHost("localhost"), false);
  assert.equal(canQueryBlockCheckHost("vpn.internal"), false);
  assert.equal(canQueryBlockCheckHost("fd12::1"), false);
  assert.equal(canQueryBlockCheckHost("::1"), false);
});

test("blockCheckHostKey lowercases and trims", () => {
  assert.equal(blockCheckHostKey("  VPN.Example.COM "), "vpn.example.com");
});
