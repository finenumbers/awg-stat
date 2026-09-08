import assert from "node:assert/strict";
import { test } from "node:test";

import { IcmpProbeController } from "./icmp-controller";

test("disables ICMP globally after permission failure", async () => {
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => ({ ok: false, kind: "permission" }),
  });
  assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  assert.equal(controller.isDisabled(), true);
  assert.equal(controller.isDue(), false);
});

test("keeps probing after repeated timeouts", async () => {
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
  assert.equal(pings, 5);
  assert.equal(controller.isDue(), true);
});

test("successful ping returns current RTT", async () => {
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => ({ ok: true, rttMs: 12 }),
  });
  assert.deepEqual(await controller.probe("s1", "vpn.example.com"), { rttMs: 12 });
  assert.equal(controller.isDue(), true);
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
