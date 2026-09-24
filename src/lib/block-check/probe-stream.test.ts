import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDetailUrl, buildProbeUrl, consumeSseBuffer, votesFromSseEvents } from "./probe-stream";

test("buildProbeUrl rejects a non-uuid id", () => {
  assert.equal(buildProbeUrl("not-a-uuid"), null);
  assert.equal(buildProbeUrl("../admin"), null);
  assert.equal(
    buildProbeUrl("01a0d4a8-f830-7179-be40-f69866b977c0"),
    "https://cheburcheck.ru/api/v1/probe/01a0d4a8-f830-7179-be40-f69866b977c0",
  );
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

test("votesFromSseEvents keeps votes already received when the stream stops before done", () => {
  const consumed = consumeSseBuffer(
    'event: started\ndata: {"online_probes":2}\n\nevent: result\ndata: {"verdicts":["sni_block"]}\n\n',
  );
  const collected = votesFromSseEvents(consumed.events);
  assert.equal(collected.done, false);
  assert.equal(collected.votes.length, 1);
  assert.deepEqual(collected.votes[0]?.verdicts, ["sni_block"]);
});
