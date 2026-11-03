import assert from "node:assert/strict";
import { test } from "node:test";

import { ICMP_DNS_CACHE_TTL_MS } from "@/server/poll-defaults";

import {
  HOST_IP_UNKNOWN_TTL_MS,
  canonicalIps,
  createHostIpCache,
  formatResolvedIps,
  queryHostRecords,
  resolveHostIps,
  resolvedIpsWrite,
  type HostIpResult,
} from "./host-ip";

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

test("orders IPv4 before IPv6 and compares addresses numerically", () => {
  assert.deepEqual(canonicalIps(["10.1.0.10", "2001:db8::10", "10.1.0.2", "2001:db8::2", "not-an-ip"]), [
    "10.1.0.2",
    "10.1.0.10",
    "2001:db8::2",
    "2001:db8::10",
  ]);
});

test("collapses textual duplicates of the same address", () => {
  assert.deepEqual(canonicalIps(["1.1.1.1", "1.1.1.1", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"]), [
    "1.1.1.1",
    "2001:db8::1",
  ]);
});

test("formats a stable newline-separated list", () => {
  assert.equal(formatResolvedIps(["10.1.0.10", "10.1.0.2"]), "10.1.0.2\n10.1.0.10");
  assert.equal(formatResolvedIps(["nope"]), null);
});

test("keeps the column on resolver failure and clears it when the name is gone", () => {
  assert.equal(resolvedIpsWrite("1.1.1.1", { kind: "unknown" }), null);
  assert.equal(resolvedIpsWrite(null, { kind: "unknown" }), null);
  assert.deepEqual(resolvedIpsWrite("1.1.1.1", { kind: "absent" }), { resolvedIps: null });
  assert.equal(resolvedIpsWrite(null, { kind: "absent" }), null);
  assert.equal(resolvedIpsWrite("10.1.0.2\n10.1.0.10", { kind: "ok", ips: ["10.1.0.10", "10.1.0.2"] }), null);
  assert.deepEqual(resolvedIpsWrite(null, { kind: "ok", ips: ["1.1.1.1"] }), { resolvedIps: "1.1.1.1" });
});

test("returns addresses when either family answers", async () => {
  const result = await queryHostRecords(
    "vpn.example.com",
    {
      resolve4: async () => ["10.1.0.10", "10.1.0.2"],
      resolve6: async () => {
        throw dnsError("ENODATA");
      },
    },
    1_000,
  );
  assert.deepEqual(result, { kind: "ok", ips: ["10.1.0.2", "10.1.0.10"] });
});

test("treats NXDOMAIN on both families as absence", async () => {
  const result = await queryHostRecords(
    "missing.example.com",
    {
      resolve4: async () => {
        throw dnsError("ENOTFOUND");
      },
      resolve6: async () => {
        throw dnsError("ENODATA");
      },
    },
    1_000,
  );
  assert.deepEqual(result, { kind: "absent" });
});

test("does not treat SERVFAIL as an empty name", async () => {
  const result = await queryHostRecords(
    "vpn.example.com",
    {
      resolve4: async () => {
        throw dnsError("ESERVFAIL");
      },
      resolve6: async () => {
        throw dnsError("ENOTFOUND");
      },
    },
    1_000,
  );
  assert.deepEqual(result, { kind: "unknown" });
});

test("cancels a lookup that misses the deadline", async () => {
  let cancelled = false;
  const result = await queryHostRecords(
    "vpn.example.com",
    {
      resolve4: () => new Promise(() => {}),
      resolve6: () => new Promise(() => {}),
      cancel: () => {
        cancelled = true;
      },
    },
    20,
  );
  assert.deepEqual(result, { kind: "unknown" });
  assert.equal(cancelled, true);
});

test("returns a literal address without a lookup", async () => {
  let calls = 0;
  const result = await resolveHostIps("203.0.113.10", {
    cache: createHostIpCache(),
    lookup: async () => {
      calls += 1;
      return { kind: "absent" };
    },
  });
  assert.deepEqual(result, { kind: "ok", ips: ["203.0.113.10"] });
  assert.equal(calls, 0);
});

test("does not look up an unsafe host", async () => {
  let calls = 0;
  const result = await resolveHostIps("-f", {
    cache: createHostIpCache(),
    lookup: async () => {
      calls += 1;
      return { kind: "ok", ips: ["1.1.1.1"] };
    },
  });
  assert.deepEqual(result, { kind: "unknown" });
  assert.equal(calls, 0);
});

test("shares one lookup for the same name and remembers a failure briefly", async () => {
  const cache = createHostIpCache();
  let now = 1_000;
  let calls = 0;
  let release: (result: HostIpResult) => void = () => {};
  const lookup = () => {
    calls += 1;
    return new Promise<HostIpResult>((resolve) => {
      release = resolve;
    });
  };
  const deps = { cache, now: () => now, lookup };
  const first = resolveHostIps("VPN.example.com", deps);
  const second = resolveHostIps("vpn.example.com", deps);
  assert.equal(calls, 1);
  release({ kind: "unknown" });
  assert.deepEqual(await first, { kind: "unknown" });
  assert.deepEqual(await second, { kind: "unknown" });
  assert.deepEqual(await resolveHostIps("vpn.example.com", deps), { kind: "unknown" });
  assert.equal(calls, 1);
  now += HOST_IP_UNKNOWN_TTL_MS;
  const refreshed = resolveHostIps("vpn.example.com", deps);
  assert.equal(calls, 2);
  release({ kind: "ok", ips: ["198.51.100.8"] });
  assert.deepEqual(await refreshed, { kind: "ok", ips: ["198.51.100.8"] });
});

test("remembers a successful lookup for the ICMP DNS window", async () => {
  const cache = createHostIpCache();
  let now = 5_000;
  let calls = 0;
  const lookup = async (): Promise<HostIpResult> => {
    calls += 1;
    return { kind: "ok", ips: ["198.51.100.9"] };
  };
  const deps = { cache, now: () => now, lookup };
  await resolveHostIps("vpn.example.com", deps);
  now += ICMP_DNS_CACHE_TTL_MS - 1;
  await resolveHostIps("vpn.example.com", deps);
  assert.equal(calls, 1);
  now += 1;
  await resolveHostIps("vpn.example.com", deps);
  assert.equal(calls, 2);
});
