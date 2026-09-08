import assert from "node:assert/strict";
import { test } from "node:test";

import { isSafeProbeHost } from "./probe-host";

test("accepts hostname and IP addresses", () => {
  assert.equal(isSafeProbeHost("vpn.example.com"), true);
  assert.equal(isSafeProbeHost("10.8.0.1"), true);
  assert.equal(isSafeProbeHost("2001:db8::1"), true);
});

test("rejects flag-like and shell-like hosts", () => {
  assert.equal(isSafeProbeHost("-f"), false);
  assert.equal(isSafeProbeHost("-i"), false);
  assert.equal(isSafeProbeHost("127.0.0.1;id"), false);
  assert.equal(isSafeProbeHost("host && reboot"), false);
  assert.equal(isSafeProbeHost(""), false);
});
