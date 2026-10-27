import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDetailUrl,
  buildProbeUrl,
  consumeSseBuffer,
  dedupeProbeVotes,
  votesFromSseEvents,
} from "./probe-stream";

const CHECK_CONTEXT = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.c2lnbmF0dXJldmFsdWU";

test("buildProbeUrl accepts a signed check context and a uuid", () => {
  assert.equal(
    buildProbeUrl(CHECK_CONTEXT),
    `https://cheburcheck.ru/api/v1/probe/${CHECK_CONTEXT}`,
  );
  assert.equal(
    buildProbeUrl("01a0d4a8-f830-7179-be40-f69866b977c0"),
    "https://cheburcheck.ru/api/v1/probe/01a0d4a8-f830-7179-be40-f69866b977c0",
  );
  assert.equal(buildProbeUrl("not-a-uuid"), null);
  assert.equal(buildProbeUrl("../admin"), null);
  assert.equal(buildProbeUrl("a.b.c.d"), null);
  assert.equal(buildProbeUrl(`${"a".repeat(800)}.${"b".repeat(800)}.${"c".repeat(800)}`), null);
});

test("buildDetailUrl points at the public check page", () => {
  assert.equal(
    buildDetailUrl("vpn.example.com"),
    "https://cheburcheck.ru/check?target=vpn.example.com",
  );
});

test("consumeSseBuffer reassembles a result split across chunks", () => {
  const first = consumeSseBuffer(
    'event: result\ndata: {"verdicts":["ok"],"host_results":[]}\n\nevent: res',
  );
  assert.equal(first.events.length, 1);
  assert.equal(first.rest, "event: res");

  const second = consumeSseBuffer(
    `${first.rest}ult\ndata: {"verdicts":["tspu_block"],"host_results":[{}]}\n\n`,
  );
  const collected = votesFromSseEvents([...first.events, ...second.events]);
  assert.equal(collected.done, false);
  assert.deepEqual(
    collected.votes.map((vote) => vote.verdicts),
    [["ok"], ["tspu_block"]],
  );
});

test("consumeSseBuffer reads cheburcheck events without a space after the colon", () => {
  const consumed = consumeSseBuffer(
    [
      'event:started',
      'data:{"online_probes":1}',
      "",
      ":",
      "",
      "event:result",
      'data:{"verdicts":["cdn_block"],"probe_id":"1","host_results":[{}]}',
      "",
      "event:done",
      'data:{"status":"done"}',
      "",
      "",
    ].join("\n"),
  );
  const collected = votesFromSseEvents(consumed.events);
  assert.equal(consumed.rest, "");
  assert.equal(collected.done, true);
  assert.equal(collected.votes.length, 1);
  assert.deepEqual(collected.votes[0]?.verdicts, ["cdn_block"]);
  assert.equal(collected.votes[0]?.probeId, "1");
});

test("votesFromSseEvents reads response_count from done and ignores online_probes", () => {
  const consumed = consumeSseBuffer(
    'event:done\ndata:{"response_count":18,"online_probes":31,"status":"done"}\n\n',
  );
  const collected = votesFromSseEvents(consumed.events);
  assert.equal(collected.done, true);
  assert.equal(collected.responseCount, 18);
  assert.equal(collected.votes.length, 0);
});

test("dedupeProbeVotes keeps the latest result for one probe", () => {
  const deduped = dedupeProbeVotes([
    { verdicts: ["tspu_block"], cdnUnblocked: false, hostResultsLength: 1, probeId: "7" },
    { verdicts: ["ok"], cdnUnblocked: false, hostResultsLength: 1, probeId: "7" },
    { verdicts: ["sni_block"], cdnUnblocked: false, hostResultsLength: 1, probeId: null },
  ]);
  assert.deepEqual(
    deduped.map((vote) => vote.verdicts),
    [["ok"], ["sni_block"]],
  );
});

test("votesFromSseEvents keeps votes already received when the stream stops before done", () => {
  const consumed = consumeSseBuffer(
    'event: started\ndata: {"online_probes":2}\n\nevent: result\ndata: {"verdicts":["sni_block"]}\n\n',
  );
  const collected = votesFromSseEvents(consumed.events);
  assert.equal(collected.done, false);
  assert.equal(collected.votes.length, 1);
  assert.deepEqual(collected.votes[0]?.verdicts, ["sni_block"]);
});
