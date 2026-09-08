import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_BACKOFF_MS, ICMP_FAILURES_BEFORE_BACKOFF } from "@/server/poll-defaults";

import { IcmpProbeController } from "./icmp-controller";

test("disables ICMP globally after permission failure", async () => {
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => ({ ok: false, kind: "permission" }),
  });
  assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  assert.equal(controller.isDisabled(), true);
  assert.equal(controller.isDue("s2"), false);
});

test("backs off a host after repeated timeouts", async () => {
  let now = 10_000;
  const controller = new IcmpProbeController({
    now: () => now,
    resolve: async () => "1.1.1.1",
    ping: async () => ({ ok: false, kind: "timeout" }),
  });
  for (let i = 0; i < ICMP_FAILURES_BEFORE_BACKOFF; i += 1) {
    assert.equal(await controller.probe("s1", "vpn.example.com"), null);
  }
  assert.equal(controller.isDue("s1"), false);
  now += ICMP_BACKOFF_MS + 1;
  assert.equal(controller.isDue("s1"), true);
});

test("successful ping resets backoff", async () => {
  const controller = new IcmpProbeController({
    now: () => 1_000,
    resolve: async () => "1.1.1.1",
    ping: async () => ({ ok: true, rttMs: 12 }),
  });
  assert.equal(await controller.probe("s1", "vpn.example.com"), 12);
  assert.equal(controller.isDue("s1"), true);
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
