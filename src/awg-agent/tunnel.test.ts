import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_PING_ATTEMPTS } from "@/server/poll-defaults";

import { lowestRespondingRtt, rttFromAgentPing } from "./tunnel";

test("agent ping keeps a successful echo and drops a failed exit", () => {
  assert.equal(rttFromAgentPing(0, "64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms"), 12);
  assert.equal(rttFromAgentPing(1, "64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms"), null);
  assert.equal(rttFromAgentPing(0, ""), null);
});

test("lowestRespondingRtt keeps the best of three and still sends every echo", async () => {
  const replies = [40, null, 18];
  let calls = 0;
  const best = await lowestRespondingRtt(ICMP_PING_ATTEMPTS, async () => {
    const reply = replies[calls];
    calls += 1;
    return reply ?? null;
  });
  assert.equal(best, 18);
  assert.equal(calls, ICMP_PING_ATTEMPTS);
});

test("lowestRespondingRtt is empty only when every echo is silent", async () => {
  let calls = 0;
  const best = await lowestRespondingRtt(ICMP_PING_ATTEMPTS, async () => {
    calls += 1;
    return null;
  });
  assert.equal(best, null);
  assert.equal(calls, ICMP_PING_ATTEMPTS);
});
