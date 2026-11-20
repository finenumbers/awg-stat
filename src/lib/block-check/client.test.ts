import assert from "node:assert/strict";
import { test } from "node:test";

import { queryCheburcheck } from "./client";
import { buildProbeUrl } from "./probe-stream";

const PROBE_ID = "01a0d4a8-f830-7179-be40-f69866b977c0";
const CHECK_CONTEXT = "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.c2lnbmF0dXJldmFsdWU";

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

function sseChunks(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function probeEvents(count: number, tspu: number, responseCount: number, onlineProbes: number): string {
  const blocks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push(
      `event:result\ndata:${JSON.stringify({
        verdicts: [index < tspu ? "tspu_block" : "ok"],
        probe_id: String(index + 1),
        host_results: [{}],
      })}\n\n`,
    );
  }
  blocks.push(
    `event:done\ndata:${JSON.stringify({ response_count: responseCount, online_probes: onlineProbes })}\n\n`,
  );
  return blocks.join("");
}

test("queryCheburcheck follows a signed check context to the probe", async () => {
  const seen: string[] = [];
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: CHECK_CONTEXT });
      }
      return sseResponse(
        'event:result\ndata:{"verdicts":["tspu_block"],"probe_id":"1","host_results":[{}]}\n\nevent:done\ndata:{"response_count":1}\n\n',
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.tspuVotes, 1);
  assert.equal(outcome.probeVotes, 1);
  assert.equal(seen[1], buildProbeUrl(CHECK_CONTEXT));
});

test("queryCheburcheck keeps a registry block when the probe id cannot be opened", async () => {
  let calls = 0;
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ blocked: true, id: "not a probe id" });
    },
  });
  assert.equal(calls, 1);
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
  assert.equal(outcome.summary, "probe-id-rejected");
});

test("queryCheburcheck marks registry-blocked without a probe as blocked", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async () => jsonResponse({ blocked: true }),
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.statusCode, 200);
  assert.equal(outcome.tspuVotes, null);
  assert.equal(outcome.probeVotes, null);
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

test("queryCheburcheck treats cdn_block as unrestricted when the host is not a CDN", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID, cdn_providers: {} });
      }
      return sseResponse(
        'event:result\ndata:{"verdicts":["cdn_block"],"probe_id":"1","host_results":[{}]}\n\nevent:done\ndata:{}\n\n',
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "unrestricted");
  assert.equal(outcome.summary, "ok=1");
  assert.equal(outcome.tspuVotes, 0);
  assert.equal(outcome.probeVotes, 1);
});

test("queryCheburcheck keeps a partial tspu vote when the probe never finishes", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return sseResponse(
        'event:result\ndata:{"verdicts":["tspu_block"],"probe_id":"1","host_results":[{}]}\n\n',
      );
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
  assert.equal(outcome.summary, "probe-incomplete");
  assert.equal(outcome.tspuVotes, null);
  assert.equal(outcome.probeVotes, null);
});

test("queryCheburcheck accepts a done event that arrives without a trailing blank line", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse(
        'event:result\ndata:{"verdicts":["tspu_block"],"probe_id":"1","host_results":[{}]}\n\nevent:done\ndata:{"response_count":1,"online_probes":31}',
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.tspuVotes, 1);
  assert.equal(outcome.probeVotes, 1);
});

test("queryCheburcheck keeps the latest vote when one probe reports twice", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse(
        [
          "event:result",
          'data:{"verdicts":["tspu_block"],"probe_id":"7","host_results":[{}]}',
          "",
          "event:result",
          'data:{"verdicts":["ok"],"probe_id":"7","host_results":[{}]}',
          "",
          "event:done",
          "data:{}",
          "",
          "",
        ].join("\n"),
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "unrestricted");
  assert.equal(outcome.summary, "ok=1");
  assert.equal(outcome.tspuVotes, 0);
  assert.equal(outcome.probeVotes, 1);
});

test("queryCheburcheck marks a registry block when the probe request fails", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return sseResponse("nope", 503);
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "blocked");
  assert.equal(outcome.statusCode, 503);
  assert.equal(outcome.tspuVotes, null);
  assert.equal(outcome.probeVotes, null);
});

test("queryCheburcheck keeps the parsed reply count when response_count matches", async () => {
  const check = (body: string) =>
    queryCheburcheck("vpn.example.com", {
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/api/v1/check")) {
          return jsonResponse({ blocked: false, id: PROBE_ID });
        }
        return sseResponse(body);
      },
    });

  const smaller = await check(probeEvents(18, 0, 18, 31));
  assert.equal(smaller.status, "unrestricted");
  assert.equal(smaller.tspuVotes, 0);
  assert.equal(smaller.probeVotes, 18);

  const larger = await check(probeEvents(25, 2, 25, 40));
  assert.equal(larger.status, "unrestricted");
  assert.equal(larger.tspuVotes, 2);
  assert.equal(larger.probeVotes, 25);
});

test("queryCheburcheck reads response_count from a done chunk that follows the votes", async () => {
  const votes = probeEvents(18, 0, 18, 31);
  const split = votes.lastIndexOf("event:done");
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseChunks([votes.slice(0, split), votes.slice(split)]);
    },
  });
  assert.equal(outcome.status, "unrestricted");
  assert.equal(outcome.tspuVotes, 0);
  assert.equal(outcome.probeVotes, 18);
});

test("queryCheburcheck ignores a response_count smaller than the parsed votes", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse(probeEvents(5, 1, 3, 31));
    },
  });
  assert.equal(outcome.tspuVotes, 1);
  assert.equal(outcome.probeVotes, 5);
});

test("queryCheburcheck keeps the previous snapshot when response_count exceeds parsed replies", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return sseResponse(probeEvents(5, 4, 8, 31));
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
  assert.equal(outcome.tspuVotes, null);
  assert.equal(outcome.probeVotes, null);
  assert.equal(outcome.summary, "probe-short parsed=5 response_count=8");
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

function authorizationOf(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get("authorization");
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([name]) => name.toLowerCase() === "authorization");
    return found?.[1] ?? null;
  }
  const record = headers as Record<string, string>;
  return record.Authorization ?? record.authorization ?? null;
}

test("queryCheburcheck sends the bearer token only on the probe request", async () => {
  const seen: Array<{ url: string; authorization: string | null }> = [];
  const outcome = await queryCheburcheck("vpn.example.com", {
    token: "secret-token",
    fetchImpl: async (input, init) => {
      const url = String(input);
      seen.push({ url, authorization: authorizationOf(init) });
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: false, id: PROBE_ID });
      }
      return sseResponse(
        'event:result\ndata:{"verdicts":["ok"],"probe_id":"1","host_results":[{}]}\n\nevent:done\ndata:{"response_count":1}\n\n',
      );
    },
  });
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.status, "unrestricted");
  assert.equal(seen[0]?.authorization, null);
  assert.equal(seen[1]?.authorization, "Bearer secret-token");
  assert.equal(seen[1]?.url.includes("secret-token"), false);
  assert.equal(seen[1]?.url.includes("token="), false);
});

test("queryCheburcheck keeps a registry block when the probe asks for an API token", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    token: "secret-token",
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return jsonResponse(
        {
          code: 403,
          documentation_url: "https://cheburcheck.ru/kb/api#authorization",
          info: "Для запуска сканеров необходим API-токен.",
        },
        403,
      );
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
  assert.equal(outcome.statusCode, 403);
  assert.equal(outcome.summary, "probe-unauthorized");
  assert.equal(outcome.tspuVotes, null);
  assert.equal(outcome.probeVotes, null);
});

test("queryCheburcheck keeps a 401 probe without turning the registry into a verdict", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return new Response(null, { status: 401 });
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.summary, "probe-unauthorized");
  assert.equal(outcome.status, null);
});

test("queryCheburcheck keeps a forbidden target when the registry is blocked", async () => {
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return jsonResponse({ code: 403, info: "Forbidden" }, 403);
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.summary, "probe-forbidden");
  assert.equal(outcome.status, null);
});

test("queryCheburcheck keeps a probe body that exceeds the read cap", async () => {
  const vote = 'event:result\ndata:{"verdicts":["tspu_block"],"probe_id":"1","host_results":[{}]}\n\n';
  const outcome = await queryCheburcheck("vpn.example.com", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/check")) {
        return jsonResponse({ blocked: true, id: PROBE_ID });
      }
      return sseChunks([vote, "x".repeat(4_000_001)]);
    },
  });
  assert.equal(outcome.kind, "keep");
  assert.equal(outcome.status, null);
  assert.equal(outcome.summary, "probe-truncated");
  assert.equal(outcome.tspuVotes, null);
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
