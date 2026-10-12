import assert from "node:assert/strict";
import { test } from "node:test";

import { sameIp } from "@/lib/awg/conf";
import {
  chooseRouteIp,
  deletionPlan,
  hostKeepDecision,
  kernelSnapshotUsable,
  parseAwgRoutePayload,
  parseIfaceRoutes,
  presentAwgRoutes,
  privateDnsRoute,
  visibleAwgRoutes,
} from "@/lib/awg/routes";

test("routes a public node through a full-tunnel AllowedIPs", () => {
  const choice = chooseRouteIp({
    resolved: ["203.0.113.10"],
    endpointIps: ["198.51.100.8"],
    allowedIps: ["0.0.0.0/0", "::/0"],
    families: [4],
  });
  assert.deepEqual(choice, { ok: true, ip: "203.0.113.10", prefix: 32 });
});

test("refuses the tunnel endpoint and a split-tunnel miss", () => {
  const endpoint = chooseRouteIp({
    resolved: ["198.51.100.8"],
    endpointIps: ["198.51.100.8"],
    allowedIps: ["0.0.0.0/0"],
    families: [4],
  });
  assert.equal(endpoint.ok, false);
  if (!endpoint.ok) {
    assert.match(endpoint.error, /endpoint/);
  }

  const split = chooseRouteIp({
    resolved: ["203.0.113.10"],
    endpointIps: [],
    allowedIps: ["10.8.1.0/24"],
    families: [4],
  });
  assert.equal(split.ok, false);
  if (!split.ok) {
    assert.match(split.error, /AllowedIPs/);
  }
});

test("refuses IPv6 when the client address is IPv4 only", () => {
  const choice = chooseRouteIp({
    resolved: ["2001:db8::10"],
    endpointIps: [],
    allowedIps: ["::/0"],
    families: [4],
  });
  assert.equal(choice.ok, false);
  if (!choice.ok) {
    assert.match(choice.error, /семейства/);
  }
});

const KERNEL_SHOW = `
10.8.1.2 dev awg0 proto kernel scope link src 10.8.1.2
203.0.113.10 dev awg0 scope link
198.51.100.9 dev awg0 scope link
10.8.1.0/24 dev awg0 proto kernel scope link src 10.8.1.2
2001:db8::5 dev awg0 metric 1024 pref medium
fd00::2 dev awg0 proto kernel metric 256 pref medium
default via 192.0.2.1 dev awg0
10.9.0.0/24 via 10.8.1.1 dev awg0
10.8.1.2 dev awg0 scope link
`;

test("keeps a previous address while it is still announced", () => {
  const choice = chooseRouteIp({
    resolved: ["203.0.113.11", "203.0.113.10"],
    endpointIps: [],
    allowedIps: ["0.0.0.0/0"],
    families: [4],
    previousIp: "203.0.113.10",
  });
  assert.deepEqual(choice, { ok: true, ip: "203.0.113.10", prefix: 32 });
});

test("compares compressed and expanded IPv6 as the same address", () => {
  assert.equal(sameIp("2001:db8::5", "2001:0db8:0000:0000:0000:0000:0000:0005"), true);
  assert.equal(sameIp("203.0.113.10", "203.0.113.11"), false);
});

test("parses host routes and leaves kernel, subnet, default, and via routes alone", () => {
  const shown = parseIfaceRoutes(KERNEL_SHOW);
  const plan = deletionPlan({
    keep: ["198.51.100.9", "2001:0db8:0000:0000:0000:0000:0000:0005"],
    tracked: ["203.0.113.10", "198.51.100.9"],
    shown,
    ownAddresses: ["10.8.1.2/32", "fd00::2/128"],
    sweep: true,
  });
  assert.deepEqual(plan.tracked, ["203.0.113.10"]);
  assert.deepEqual(plan.kernel, []);
});

test("sweeps a kernel route that the agent no longer tracks", () => {
  const shown = parseIfaceRoutes(KERNEL_SHOW);
  const plan = deletionPlan({
    keep: ["198.51.100.9"],
    tracked: ["198.51.100.9"],
    shown,
    ownAddresses: ["10.8.1.2/32"],
    sweep: true,
  });
  assert.deepEqual(plan.tracked, []);
  assert.deepEqual(
    plan.kernel.map((route) => route.ip),
    ["203.0.113.10", "2001:db8::5"],
  );
});

test("does not sweep kernel routes when a desired name failed to resolve", () => {
  const shown = parseIfaceRoutes(KERNEL_SHOW);
  const failed = hostKeepDecision({
    previousIp: null,
    havePreviousRoute: false,
    resolved: [],
    allowedChoice: null,
    installed: false,
  });
  assert.equal(failed.sweepUnsafe, true);
  const pinned = hostKeepDecision({
    previousIp: "198.51.100.9",
    havePreviousRoute: true,
    resolved: [],
    allowedChoice: null,
    installed: false,
  });
  assert.equal(pinned.keepIp, "198.51.100.9");
  assert.equal(pinned.sweepUnsafe, true);
  const plan = deletionPlan({
    keep: [pinned.keepIp!],
    tracked: ["203.0.113.10", "198.51.100.9"],
    shown,
    ownAddresses: ["10.8.1.2/32"],
    sweep: false,
  });
  assert.deepEqual(plan.tracked, ["203.0.113.10"]);
  assert.deepEqual(plan.kernel, []);
});

test("a failed route snapshot is not a list of routes to delete", () => {
  assert.equal(kernelSnapshotUsable({ code: 1, truncated: false }), false);
  assert.equal(kernelSnapshotUsable({ code: 0, truncated: true }), false);
  const plan = deletionPlan({
    keep: [],
    tracked: [],
    shown: null,
    ownAddresses: [],
    sweep: false,
  });
  assert.deepEqual(plan.kernel, []);
});

test("shows domains, bare addresses, DNS, and kernel leftovers", () => {
  const rows = visibleAwgRoutes({
    shown: parseIfaceRoutes(`${KERNEL_SHOW}\n10.8.1.1 dev awg0 scope link\n`),
    ownAddresses: ["10.8.1.2/32", "fd00::2/128"],
    bindings: [
      { host: "10.8.1.1", ip: "10.8.1.1", dns: true },
      { host: "vpn.example.com", ip: "203.0.113.10", dns: false },
      { host: "198.51.100.9", ip: "198.51.100.9", dns: false },
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.label),
    ["DNS 10.8.1.1", "198.51.100.9", "2001:db8::5", "vpn.example.com → 203.0.113.10"],
  );
});

test("route payload states stay distinct from an empty list", () => {
  assert.equal(presentAwgRoutes(null).status, "unavailable");
  assert.equal(presentAwgRoutes({ up: false, routes: [] }).status, "down");
  assert.equal(presentAwgRoutes({ up: true, routes: [] }).status, "empty");
  assert.equal(presentAwgRoutes(parseAwgRoutePayload({ up: true, routes: [{ host: 1, ip: "203.0.113.10", dns: false }] })).status, "unavailable");
  const listed = presentAwgRoutes({ up: true, routes: [{ host: "vpn.example.com", ip: "203.0.113.10", dns: false }] });
  assert.equal(listed.status, "list");
  if (listed.status === "list") {
    assert.equal(listed.rows[0]?.label, "vpn.example.com → 203.0.113.10");
  }
});

test("keeps only a private DNS address inside AllowedIPs", () => {
  assert.equal(
    privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["0.0.0.0/0"] }, ["198.51.100.8"]),
    "10.8.1.1",
  );
  assert.equal(privateDnsRoute({ dnsHost: "1.1.1.1", allowedIps: ["0.0.0.0/0"] }, []), null);
  assert.equal(privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["10.9.0.0/24"] }, []), null);
  assert.equal(privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["0.0.0.0/0"] }, ["10.8.1.1"]), null);
});
