import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activeAwgVersionLabel,
  comparePeerInternalIp,
  compareServerName,
  displayPeerEndpoint,
  displayPeerInternalIp,
  formatBytes,
  formatDateTime,
  formatDbSizeGb,
  formatInteger,
  formatRelativeHandshake,
  formatUptime,
  groupThousands,
} from "./utils";

test("activeAwgVersionLabel returns only real protocol generations", () => {
  assert.equal(activeAwgVersionLabel("V31"), "AmneziaWG 3.1");
  assert.equal(activeAwgVersionLabel("V30"), "AmneziaWG 3.0");
  assert.equal(activeAwgVersionLabel("V2"), "AmneziaWG 2");
  assert.equal(activeAwgVersionLabel("UNKNOWN"), null);
  assert.equal(activeAwgVersionLabel(null), null);
  assert.equal(activeAwgVersionLabel(undefined), null);
});

test("compareServerName sorts Russian names case-insensitively", () => {
  const names = ["vpn-10", "Ёлка", "Vpn-2", "альфа"];
  assert.deepEqual([...names].sort(compareServerName), ["альфа", "Ёлка", "Vpn-2", "vpn-10"]);
});

test("comparePeerInternalIp sorts by numeric IPv4 and puts missing IPs last", () => {
  const peers = [
    { allowedIps: "10.8.1.10/32", publicKey: "b" },
    { allowedIps: null, publicKey: "z" },
    { allowedIps: "10.8.1.2/32", publicKey: "a" },
    { allowedIps: "fd00::2/128", publicKey: "c" },
  ];
  assert.deepEqual(
    [...peers].sort(comparePeerInternalIp).map((peer) => peer.publicKey),
    ["a", "b", "c", "z"],
  );
});

test("displayPeerInternalIp prefers the first IPv4 host from allowedIps", () => {
  assert.equal(displayPeerInternalIp("10.8.1.2/32 10.8.1.3/32"), "10.8.1.2");
  assert.equal(displayPeerInternalIp("fd00::2/128, 10.8.1.4/32"), "10.8.1.4");
  assert.equal(displayPeerInternalIp("10.8.1.0/24"), "10.8.1.0/24");
  assert.equal(displayPeerInternalIp("fd00::2/128"), "fd00::2");
  assert.equal(displayPeerInternalIp(""), null);
});

test("displayPeerEndpoint parses v4, bracketed v6, and fallbacks", () => {
  assert.deepEqual(displayPeerEndpoint("203.0.113.10:51820"), { host: "203.0.113.10", port: "51820" });
  assert.deepEqual(displayPeerEndpoint("[2001:db8::1]:51820"), { host: "2001:db8::1", port: "51820" });
  assert.deepEqual(displayPeerEndpoint("vpn.example:1234"), { host: "vpn.example", port: "1234" });
  assert.deepEqual(displayPeerEndpoint("2001:db8::1"), { host: "2001:db8::1", port: null });
  assert.equal(displayPeerEndpoint("(none)"), null);
  assert.equal(displayPeerEndpoint(null), null);
  assert.equal(displayPeerEndpoint("  "), null);
});

test("formatUptime uses coarse Russian units", () => {
  const now = new Date("2026-09-06T12:00:00.000Z");
  assert.equal(formatUptime(new Date("2026-09-06T11:59:40.000Z"), now), "20 с");
  assert.equal(formatUptime(new Date("2026-09-06T10:00:00.000Z"), now), "2 ч");
  assert.equal(formatUptime(new Date("2026-09-04T10:00:00.000Z"), now), "2 дн 2 ч");
  assert.equal(formatUptime(new Date("2022-04-18T12:00:00.000Z"), now), "1 602 дн");
});

test("groupThousands inserts a regular space every three integer digits", () => {
  assert.equal(groupThousands("3456.8"), "3 456.8");
  assert.equal(groupThousands("3456,8"), "3 456,8");
  assert.equal(groupThousands("1234567,89"), "1 234 567,89");
  assert.equal(groupThousands("12"), "12");
  assert.equal(groupThousands("0,12"), "0,12");
  assert.equal(groupThousands("-12345"), "-12 345");
});

test("formatInteger groups thousands and drops a fractional part", () => {
  assert.equal(formatInteger(3456), "3 456");
  assert.equal(formatInteger(12), "12");
  assert.equal(formatInteger(Number.NaN), "0");
});

test("formatBytes groups thousands and keeps the existing decimal style", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1000 * 1024), "1 000.0 KB");
  assert.equal(formatBytes(3456.8 * 1024 ** 4), "3 456.8 TB");
});

test("formatDbSizeGb always uses two decimals, a comma, and Gb", () => {
  assert.equal(formatDbSizeGb(0), "0,00 Gb");
  assert.equal(formatDbSizeGb(-1), "0,00 Gb");
  assert.equal(formatDbSizeGb(Number.NaN), "0,00 Gb");
  assert.equal(formatDbSizeGb(1024 ** 3), "1,00 Gb");
  assert.equal(formatDbSizeGb(Math.round(0.12 * 1024 ** 3)), "0,12 Gb");
  assert.equal(formatDbSizeGb(3456.8 * 1024 ** 3), "3 456,80 Gb");
});

test("formatDateTime labels the timestamp as UTC", () => {
  const text = formatDateTime(new Date("2026-09-05T14:45:19.000Z"));
  assert.match(text, /UTC$/);
  assert.match(text, /14:45:19/);
});

test("formatRelativeHandshake uses the supplied nowSec snapshot", () => {
  const capturedSec = Date.parse("2026-09-08T12:00:00.000Z") / 1000;
  assert.equal(formatRelativeHandshake(BigInt(capturedSec - 40), capturedSec), "40 с назад");
  assert.equal(formatRelativeHandshake(BigInt(capturedSec - 3456 * 86400), capturedSec), "3 456 дн назад");
  assert.equal(formatRelativeHandshake(0n, capturedSec), "никогда");
});
