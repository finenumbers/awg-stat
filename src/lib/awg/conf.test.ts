import assert from "node:assert/strict";
import { test } from "node:test";

import { hashAwgConf, ipInCidr, isPrivateIp, parseAwgConf, renderSetconf } from "@/lib/awg/conf";

const SAMPLE = `
[Interface]
PrivateKey = client-private
Address = 10.8.1.3/32
DNS = 1.1.1.1, 10.8.1.1
MTU = 1376
Jc = 4
Jmin = 40
Jmax = 70
S1 = 0
S2 = 0
H1 = 1
H2 = 2
H3 = 3
H4 = 4

[Peer]
PublicKey = server-public
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = vpn.example.com:443
PersistentKeepalive = 25
`;

test("parses an Amnezia client conf and strips DNS from setconf", () => {
  const parsed = parseAwgConf(SAMPLE);
  assert.equal(parsed.endpointHost, "vpn.example.com");
  assert.equal(parsed.endpointPort, 443);
  assert.equal(parsed.mtu, 1376);
  assert.equal(parsed.dnsHost, "10.8.1.1");
  assert.deepEqual(parsed.allowedIps, ["0.0.0.0/0", "::/0"]);
  const setconf = renderSetconf(parsed);
  assert.equal(setconf.includes("DNS"), false);
  assert.equal(setconf.includes("Address"), false);
  assert.equal(setconf.includes("MTU"), false);
  assert.equal(setconf.includes("PrivateKey = client-private"), true);
  assert.equal(setconf.includes("Jc = 4"), true);
  assert.equal(setconf.includes("Endpoint = vpn.example.com:443"), true);
});

test("rejects a plain WireGuard conf", () => {
  assert.throws(
    () =>
      parseAwgConf(`
[Interface]
PrivateKey = abc
Address = 10.0.0.2/32
[Peer]
PublicKey = def
AllowedIPs = 0.0.0.0/0
Endpoint = vpn.example.com:51820
`),
    /AmneziaWG/,
  );
});

test("rejects a second peer", () => {
  assert.throws(() => parseAwgConf(`${SAMPLE}\n[Peer]\nPublicKey = other\n`), /один/);
});

test("hash ignores CR LF differences", () => {
  assert.equal(hashAwgConf(SAMPLE), hashAwgConf(SAMPLE.replace(/\n/g, "\r\n")));
});

test("matches addresses inside AllowedIPs", () => {
  assert.equal(ipInCidr("203.0.113.8", "0.0.0.0/0"), true);
  assert.equal(ipInCidr("10.8.1.9", "10.8.1.0/24"), true);
  assert.equal(ipInCidr("10.9.0.1", "10.8.1.0/24"), false);
  assert.equal(ipInCidr("2001:db8::1", "::/0"), true);
  assert.equal(isPrivateIp("1.1.1.1"), false);
  assert.equal(isPrivateIp("10.8.1.1"), true);
});
