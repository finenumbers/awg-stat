import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_PING_ATTEMPTS } from "@/server/poll-defaults";

import { IcmpProbeController } from "./icmp-controller";
import type { IcmpAttempt } from "./icmp-ping";

test("disables ICMP on the first permission failure and does not send the rest", async () => {
  let pings = 0;
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => {
      pings += 1;
      return { ok: false, kind: "permission" };
    },
  });
  assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  assert.equal(pings, 1);
  assert.equal(controller.isDisabled(), true);
  assert.equal(controller.isDue(), false);
  assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  assert.equal(pings, 1);
});

test("writes unavailable only after every echo is silent", async () => {
  let pings = 0;
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => {
      pings += 1;
      return { ok: false, kind: "timeout" };
    },
  });
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await controller.probe("s1", "vpn.example.com"), { rttMs: null });
  }
  assert.equal(pings, 5 * ICMP_PING_ATTEMPTS);
  assert.equal(controller.isDue(), true);
});

test("keeps the lowest reply among three echoes", async () => {
  const replies: IcmpAttempt[] = [
    { ok: true, rttMs: 40 },
    { ok: true, rttMs: 12 },
    { ok: true, rttMs: 18 },
  ];
  let pings = 0;
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => {
      const reply = replies[pings];
      pings += 1;
      return reply ?? { ok: false, kind: "timeout" };
    },
  });
  assert.equal(ICMP_PING_ATTEMPTS, 3);
  assert.deepEqual(await controller.probe("s1", "vpn.example.com"), { rttMs: 12 });
  assert.equal(pings, 3);
  assert.equal(controller.isDue(), true);
});

test("one reply among three echoes is enough", async () => {
  const replies: IcmpAttempt[] = [
    { ok: false, kind: "timeout" },
    { ok: true, rttMs: 14 },
    { ok: false, kind: "loss" },
  ];
  let pings = 0;
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => {
      const reply = replies[pings];
      pings += 1;
      return reply ?? { ok: false, kind: "timeout" };
    },
  });
  assert.deepEqual(await controller.probe("s1", "vpn.example.com"), { rttMs: 14 });
  assert.equal(pings, ICMP_PING_ATTEMPTS);
});

test("stops the remaining echoes when ping cannot run", async () => {
  const replies: IcmpAttempt[] = [
    { ok: false, kind: "timeout" },
    { ok: false, kind: "missing" },
    { ok: true, rttMs: 9 },
  ];
  let pings = 0;
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => {
      const reply = replies[pings];
      pings += 1;
      return reply ?? { ok: false, kind: "timeout" };
    },
  });
  assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  assert.equal(pings, 2);
  assert.equal(controller.isDisabled(), true);
});

test("skips unsafe hosts without calling ping", async () => {
  let pingCalls = 0;
  const controller = new IcmpProbeController({
    resolve: async () => "1.1.1.1",
    ping: async () => {
      pingCalls += 1;
      return { ok: true, rttMs: 1 };
    },
  });
  assert.equal(await controller.probe("s1", "-f"), null);
  assert.equal(pingCalls, 0);
});
