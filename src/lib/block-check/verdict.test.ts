import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDisplayedVoteSummary, resolveBadgeStatus, selectProbeVerdict, type ProbeVote } from "./verdict";

function vote(verdicts: string[], extras: Partial<ProbeVote> = {}): ProbeVote {
  return {
    verdicts,
    cdnUnblocked: false,
    hostResultsLength: 1,
    ...extras,
  };
}

test("selectProbeVerdict breaks ties toward the stricter verdict", () => {
  assert.equal(selectProbeVerdict([vote(["ok"]), vote(["tspu_block"])], false), "tspu_block");
  assert.equal(selectProbeVerdict([vote(["ok"]), vote(["ok"]), vote(["tspu_block"])], false), "ok");
});

test("resolveBadgeStatus does not call a clear registry unrestricted without scanner votes", () => {
  assert.equal(
    resolveBadgeStatus({ registryBlocked: false, isStaticCdn: false, votes: [] }),
    "unknown",
  );
});

test("resolveBadgeStatus treats a blocked registry without scanner votes as blocked", () => {
  assert.equal(
    resolveBadgeStatus({ registryBlocked: true, isStaticCdn: false, votes: [] }),
    "blocked",
  );
});

test("resolveBadgeStatus maps scanner votes onto the two badge labels", () => {
  assert.equal(
    resolveBadgeStatus({ registryBlocked: true, isStaticCdn: false, votes: [vote(["ok"])] }),
    "unrestricted",
  );
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [vote(["whitelist"])],
    }),
    "unrestricted",
  );
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [vote(["sni_block"])],
    }),
    "blocked",
  );
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [vote(["dns_spoofing"])],
    }),
    "blocked",
  );
});

test("resolveBadgeStatus turns a static CDN ok vote into blocked", () => {
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: true,
      votes: [vote(["ok"], { hostResultsLength: 2 })],
    }),
    "blocked",
  );
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: true,
      votes: [vote(["ok"], { hostResultsLength: 0 })],
    }),
    "unrestricted",
  );
});

function repeated(verdicts: string[], count: number): ProbeVote[] {
  return Array.from({ length: count }, () => vote(verdicts));
}

test("resolveBadgeStatus treats cdn_block on an ordinary domain as unrestricted", () => {
  const austria = [
    ...repeated(["cdn_block"], 23),
    ...repeated(["ok"], 7),
    ...repeated(["uncertain"], 1),
  ];
  assert.equal(
    resolveBadgeStatus({ registryBlocked: false, isStaticCdn: false, votes: austria }),
    "unrestricted",
  );
  assert.equal(formatDisplayedVoteSummary(austria, false), "ok=30 uncertain=1");

  const hongKong = [
    ...repeated(["cdn_block"], 21),
    ...repeated(["ok"], 6),
    ...repeated(["tspu_block", "cdn_block"], 2),
    ...repeated(["uncertain"], 2),
  ];
  assert.equal(
    resolveBadgeStatus({ registryBlocked: false, isStaticCdn: false, votes: hongKong }),
    "unrestricted",
  );
  assert.equal(
    resolveBadgeStatus({ registryBlocked: true, isStaticCdn: false, votes: hongKong }),
    "unrestricted",
  );
  assert.equal(formatDisplayedVoteSummary(hongKong, false), "tspu_block=2 ok=27 uncertain=2");

  const latvia = [
    ...repeated(["cdn_block"], 23),
    ...repeated(["ok"], 5),
    ...repeated(["sni_block"], 1),
    ...repeated(["uncertain"], 2),
  ];
  assert.equal(
    resolveBadgeStatus({ registryBlocked: false, isStaticCdn: false, votes: latvia }),
    "unrestricted",
  );
});

test("resolveBadgeStatus keeps a real TSPU majority and a tie", () => {
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [...repeated(["tspu_block"], 16), ...repeated(["cdn_block"], 15)],
    }),
    "blocked",
  );
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [...repeated(["tspu_block"], 15), ...repeated(["cdn_block"], 15)],
    }),
    "blocked",
  );
});

test("resolveBadgeStatus keeps cdn_block when the target is a static CDN", () => {
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: true,
      votes: [vote(["cdn_block"], { hostResultsLength: 2 })],
    }),
    "blocked",
  );
});

test("resolveBadgeStatus ignores uncertain votes", () => {
  assert.equal(
    resolveBadgeStatus({
      registryBlocked: false,
      isStaticCdn: false,
      votes: [vote(["uncertain"])],
    }),
    "unknown",
  );
});
