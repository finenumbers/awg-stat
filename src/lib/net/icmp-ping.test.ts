import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyIcmpFailure,
  isIcmpPermanentlyUnavailable,
  parsePingRttMs,
  pingArgsFor,
} from "./icmp-ping";

test("parses Linux and Darwin ping RTT", () => {
  assert.equal(parsePingRttMs("64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=14.2 ms"), 14);
  assert.equal(parsePingRttMs("64 bytes from 1.1.1.1: icmp_seq=0 time=0.412 ms"), 0);
  assert.equal(parsePingRttMs("Request timeout for icmp_seq 0"), null);
});

test("builds platform-specific ping args without a shell", () => {
  assert.deepEqual(pingArgsFor("linux", "1.1.1.1"), ["-n", "-c", "1", "-W", "2", "1.1.1.1"]);
  assert.deepEqual(pingArgsFor("darwin", "1.1.1.1"), ["-n", "-c", "1", "-W", "2000", "1.1.1.1"]);
});

test("classifies missing binary and permission as permanent", () => {
  assert.equal(classifyIcmpFailure({ spawnCode: "ENOENT", stderr: "", timedOut: false, rttMs: null }), "missing");
  assert.equal(
    classifyIcmpFailure({ spawnCode: undefined, stderr: "ping: socktype: Operation not permitted", timedOut: false, rttMs: null }),
    "permission",
  );
  assert.equal(isIcmpPermanentlyUnavailable("missing"), true);
  assert.equal(isIcmpPermanentlyUnavailable("timeout"), false);
});
