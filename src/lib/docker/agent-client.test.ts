import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchAwgRead, localDockerErrorMessage } from "@/lib/docker/agent-client";

const okBody = {
  ok: true,
  containerName: "amnezia-awg2",
  running: true,
  status: "running",
  startedAt: null,
  restartCount: 0,
  hostListenPort: null,
  exitCode: 0,
  pollStdout: "---GATE:transfer---",
};

test("local docker errors stay specific for onboard and poll", () => {
  assert.match(localDockerErrorMessage("unconfigured", "onboard"), /не подключён/);
  assert.match(localDockerErrorMessage("not_found", "poll"), /amnezia-awg2/);
  assert.match(localDockerErrorMessage("stopped", "onboard"), /не стартует/);
  assert.equal(localDockerErrorMessage("stopped", "poll").includes("не стартует"), false);
});

test("fetch refuses to call the agent when it is not configured", async () => {
  const previousUrl = process.env.GATE_DOCKER_AGENT_URL;
  const previousToken = process.env.GATE_DOCKER_AGENT_TOKEN;
  delete process.env.GATE_DOCKER_AGENT_URL;
  delete process.env.GATE_DOCKER_AGENT_TOKEN;
  try {
    const result = await fetchAwgRead(new AbortController().signal);
    assert.deepEqual(result, { ok: false, code: "unconfigured" });
  } finally {
    if (previousUrl === undefined) delete process.env.GATE_DOCKER_AGENT_URL;
    else process.env.GATE_DOCKER_AGENT_URL = previousUrl;
    if (previousToken === undefined) delete process.env.GATE_DOCKER_AGENT_TOKEN;
    else process.env.GATE_DOCKER_AGENT_TOKEN = previousToken;
  }
});

test("fetch sends the bearer token and rejects a foreign container name", async () => {
  const previousUrl = process.env.GATE_DOCKER_AGENT_URL;
  const previousToken = process.env.GATE_DOCKER_AGENT_TOKEN;
  process.env.GATE_DOCKER_AGENT_URL = "http://docker-agent:8090";
  process.env.GATE_DOCKER_AGENT_TOKEN = "secret";
  const original = globalThis.fetch;
  const headers: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    headers.push(new Headers(init?.headers).get("authorization") ?? "");
    return new Response(JSON.stringify({ ...okBody, containerName: "gate-postgres" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await fetchAwgRead(new AbortController().signal);
    assert.deepEqual(headers, ["Bearer secret"]);
    assert.deepEqual(result, { ok: false, code: "bad_response" });
  } finally {
    globalThis.fetch = original;
    if (previousUrl === undefined) delete process.env.GATE_DOCKER_AGENT_URL;
    else process.env.GATE_DOCKER_AGENT_URL = previousUrl;
    if (previousToken === undefined) delete process.env.GATE_DOCKER_AGENT_TOKEN;
    else process.env.GATE_DOCKER_AGENT_TOKEN = previousToken;
  }
});

test("fetch maps agent status codes", async () => {
  const previousUrl = process.env.GATE_DOCKER_AGENT_URL;
  const previousToken = process.env.GATE_DOCKER_AGENT_TOKEN;
  process.env.GATE_DOCKER_AGENT_URL = "http://docker-agent:8090/";
  process.env.GATE_DOCKER_AGENT_TOKEN = "secret";
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "awg_stopped" }), { status: 409 })) as typeof fetch;
  try {
    const result = await fetchAwgRead(new AbortController().signal);
    assert.deepEqual(result, { ok: false, code: "stopped" });
  } finally {
    globalThis.fetch = original;
    if (previousUrl === undefined) delete process.env.GATE_DOCKER_AGENT_URL;
    else process.env.GATE_DOCKER_AGENT_URL = previousUrl;
    if (previousToken === undefined) delete process.env.GATE_DOCKER_AGENT_TOKEN;
    else process.env.GATE_DOCKER_AGENT_TOKEN = previousToken;
  }
});
