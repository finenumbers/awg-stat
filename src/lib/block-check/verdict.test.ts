import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBadgeStatus, selectProbeVerdict, type ProbeVote } from "./verdict";

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
