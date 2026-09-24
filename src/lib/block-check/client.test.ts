import assert from "node:assert/strict";
import { test } from "node:test";

import { queryCheburcheck } from "./client";

const PROBE_ID = "01a0d4a8-f830-7179-be40-f69866b977c0";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("queryCheburcheck marks registry-blocked without a probe as blocked", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => jsonResponse({ blocked: true }),
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.statusCode, 200);
});

test("queryCheburcheck keeps an unrestricted registry without scanner votes", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => jsonResponse({ blocked: false }),
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
});

test("queryCheburcheck maps an ok probe vote to unrestricted", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return sseResponse(
        `event: result\ndata: {"verdicts":["ok"],"host_results":[{}]}\n\nevent: done\ndata: {}\n\n`,
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "unrestricted");
});

test("queryCheburcheck maps a tspu_block probe vote to blocked", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse(
        `event: result\ndata: {"verdicts":["tspu_block"],"host_results":[{}]}\n\nevent: done\ndata: {}\n\n`,
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
});

test("queryCheburcheck turns a static CDN ok vote into blocked", async () => {
  const outcome = await queryCheburcheck("cdn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID, cdn_providers: { cloudflare: true } });
      }
      return sseResponse(
        `event: result\ndata: {"verdicts":["ok"],"host_results":[{},{}]}\n\nevent: done\ndata: {}\n\n`,
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
});

test("queryCheburcheck keeps a non-200 check", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => jsonResponse({ error: "nope" }, 400),
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.statusCode, 400);
});

test("queryCheburcheck keeps a failed probe when the registry is clear", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse("nope", 503);
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.statusCode, 503);
});

test("queryCheburcheck keeps a timeout or abort", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
});

test("queryCheburcheck returns keep when the caller already aborted", async () => {
  const abort = new AbortController();
  abort.abort();
  let called = 0;
  const outcome = await queryCheburcheck("vpn.example.com", {
    signal: abort.signal,
    fetchImpl: async () => {
      called += 1;
      return jsonResponse({ blocked: true });
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(called, 0);
});
