import assert from "node:assert/strict";
import { test } from "node:test";

import { pollInnerScript } from "@/lib/amnezia/commands";
import {
  AwgExecTimeoutError,
  findLocalAwgContainer,
  hostListenPortFromDockerPorts,
  isExactLocalAwgName,
  normalizeContainerName,
  readLocalAwgContainer,
  type AwgDocker,
  type ExecOutput,
} from "@/lib/docker/awg-target";

test("strips the docker name prefix and accepts only amnezia-awg2", () => {
  assert.equal(normalizeContainerName("/amnezia-awg2"), "amnezia-awg2");
  assert.equal(isExactLocalAwgName("/amnezia-awg2"), true);
  assert.equal(isExactLocalAwgName("amnezia-awg"), false);
  assert.equal(isExactLocalAwgName("amnezia-awg2-old"), false);
  assert.equal(isExactLocalAwgName("gate-postgres"), false);
});

test("host network without published ports is not an error", () => {
  assert.equal(hostListenPortFromDockerPorts(null), null);
  assert.equal(hostListenPortFromDockerPorts({}), null);
  assert.equal(
    hostListenPortFromDockerPorts({
      "443/tcp": [{ HostPort: "443" }],
      "39743/udp": [{ HostPort: "39743" }],
    }),
    39743,
  );
});

test("finds the exact container among similarly named ones", () => {
  const found = findLocalAwgContainer([
    { id: "a", names: ["/amnezia-awg"], state: "running" },
    { id: "b", names: ["/amnezia-awg2"], state: "running" },
  ]);
  assert.equal(found?.id, "b");
  assert.equal(findLocalAwgContainer([{ id: "a", names: ["/amnezia-awg2-old"], state: "running" }]), null);
});

function fakeDocker(overrides: Partial<AwgDocker> & { execCalls?: string[] }): AwgDocker {
  return {
    async list() {
      return [{ id: "id-2", names: ["/amnezia-awg2"], state: "running" }];
    },
    async inspect() {
      return {
        name: "/amnezia-awg2",
        running: true,
        status: "running",
        startedAt: "2026-10-01T00:00:00.000000000Z",
        restartCount: 1,
        hostListenPort: null,
      };
    },
    async exec(_id, script) {
      overrides.execCalls?.push(script);
      return { exitCode: 0, stdout: "ok" } satisfies ExecOutput;
    },
    ...overrides,
  };
}

test("does not exec when amnezia-awg2 is missing or stopped", async () => {
  const missingCalls: string[] = [];
  const missing = await readLocalAwgContainer(
    fakeDocker({
      execCalls: missingCalls,
      async list() {
        return [{ id: "other", names: ["/gate-postgres"], state: "running" }];
      },
    }),
    pollInnerScript(),
    new AbortController().signal,
  );
  assert.deepEqual(missing, { ok: false, error: "awg_not_found" });
  assert.equal(missingCalls.length, 0);

  const stoppedCalls: string[] = [];
  const stopped = await readLocalAwgContainer(
    fakeDocker({
      execCalls: stoppedCalls,
      async list() {
        return [{ id: "id-2", names: ["/amnezia-awg2"], state: "exited" }];
      },
    }),
    pollInnerScript(),
    new AbortController().signal,
  );
  assert.deepEqual(stopped, { ok: false, error: "awg_stopped" });
  assert.equal(stoppedCalls.length, 0);
});

test("refuses exec when inspect name is not amnezia-awg2", async () => {
  const calls: string[] = [];
  const result = await readLocalAwgContainer(
    fakeDocker({
      execCalls: calls,
      async inspect() {
        return {
          name: "/gate-postgres",
          running: true,
          status: "running",
          startedAt: null,
          restartCount: 0,
          hostListenPort: null,
        };
      },
    }),
    pollInnerScript(),
    new AbortController().signal,
  );
  assert.deepEqual(result, { ok: false, error: "awg_read_failed" });
  assert.equal(calls.length, 0);
});

test("rejects a script that is not the read-only poll", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => readLocalAwgContainer(fakeDocker({ execCalls: calls }), "docker run --privileged alpine", new AbortController().signal),
  );
  assert.equal(calls.length, 0);
});

test("execs only the given script inside the exact container", async () => {
  const calls: string[] = [];
  const script = pollInnerScript();
  const result = await readLocalAwgContainer(fakeDocker({ execCalls: calls }), script, new AbortController().signal);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.containerName, "amnezia-awg2");
    assert.equal(result.hostListenPort, null);
    assert.equal(result.pollStdout, "ok");
  }
  assert.deepEqual(calls, [script]);
});

test("maps an exec timeout without treating it as a successful read", async () => {
  const result = await readLocalAwgContainer(
    fakeDocker({
      async exec() {
        throw new AwgExecTimeoutError();
      },
    }),
    pollInnerScript(),
    new AbortController().signal,
  );
  assert.deepEqual(result, { ok: false, error: "awg_timeout" });
});
