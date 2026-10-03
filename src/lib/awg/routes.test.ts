import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseRouteIp, privateDnsRoute } from "@/lib/awg/routes";

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

test("keeps only a private DNS address inside AllowedIPs", () => {
  assert.equal(
    privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["0.0.0.0/0"] }, ["198.51.100.8"]),
    "10.8.1.1",
  );
  assert.equal(privateDnsRoute({ dnsHost: "1.1.1.1", allowedIps: ["0.0.0.0/0"] }, []), null);
  assert.equal(privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["10.9.0.0/24"] }, []), null);
  assert.equal(privateDnsRoute({ dnsHost: "10.8.1.1", allowedIps: ["0.0.0.0/0"] }, ["10.8.1.1"]), null);
});
