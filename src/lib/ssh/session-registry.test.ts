import assert from "node:assert/strict";
import { test } from "node:test";

import type { SshConnectionConfig, SshSession } from "./client";
import { SshSessionRegistry, SshSessionRevokedError } from "./session-registry";

class FakeClient implements SshSession {
  alive = false;
  connectCalls = 0;
  ended = false;

  constructor(
    private readonly onConnect?: () => void,
    private readonly hold?: Promise<void>,
  ) {}

  isAlive(): boolean {
    return this.alive;
  }

  async connect() {
    this.connectCalls += 1;
    if (this.hold) {
      await this.hold;
    }
    this.onConnect?.();
    this.alive = true;
    return { hostKeyFingerprint: "fp" };
  }

  async exec() {
    return { stdout: "", stderr: "", code: 0 };
  }

  end(): void {
    this.alive = false;
    this.ended = true;
  }
}

const baseConfig: SshConnectionConfig = {
  host: "vpn.example",
  port: 22,
  username: "root",
  privateKey: "key-a",
};

test("reuses a live session for the same config", async () => {
  const created: FakeClient[] = [];
  const registry = new SshSessionRegistry({
    createClient: () => {
      const client = new FakeClient();
      created.push(client);
      return client;
    },
  });

  const first = await registry.acquire("srv-1", baseConfig);
  const second = await registry.acquire("srv-1", baseConfig);

  assert.equal(first.client, second.client);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.connectCalls, 1);
});

test("opens a new session when the secret changes", async () => {
  const created: FakeClient[] = [];
  const registry = new SshSessionRegistry({
    createClient: () => {
      const client = new FakeClient();
      created.push(client);
      return client;
    },
  });

  await registry.acquire("srv-1", baseConfig);
  await registry.acquire("srv-1", { ...baseConfig, privateKey: "key-b" });

  assert.equal(created.length, 2);
  assert.equal(created[0]?.ended, true);
  assert.equal(created[1]?.connectCalls, 1);
});

test("opens a new session after close or max age", async () => {
  const created: FakeClient[] = [];
  const registry = new SshSessionRegistry({
    maxAgeMs: 20,
    createClient: () => {
      const client = new FakeClient();
      created.push(client);
      return client;
    },
  });

  const first = await registry.acquire("srv-1", baseConfig);
  first.client.end();
  await registry.acquire("srv-1", baseConfig);
  assert.equal(created.length, 2);

  await new Promise((resolve) => setTimeout(resolve, 25));
  await registry.acquire("srv-1", baseConfig);
  assert.equal(created.length, 3);
});

test("closeAll and prune drop leftover sessions", async () => {
  const created: FakeClient[] = [];
  const registry = new SshSessionRegistry({
    createClient: () => {
      const client = new FakeClient();
      created.push(client);
      return client;
    },
  });

  await registry.acquire("keep", baseConfig);
  await registry.acquire("gone", { ...baseConfig, host: "other" });
  registry.prune(["keep"]);
  assert.equal(created[1]?.ended, true);
  assert.equal(registry.size(), 1);

  registry.closeAll();
  assert.equal(created[0]?.ended, true);
  assert.equal(registry.size(), 0);
});

async function acquireWhileConnecting(action: (registry: SshSessionRegistry) => void) {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created: FakeClient[] = [];
  const registry = new SshSessionRegistry({
    createClient: () => {
      const client = new FakeClient(undefined, hold);
      created.push(client);
      return client;
    },
  });

  const pending = registry.acquire("srv-1", baseConfig);
  while (created.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  action(registry);
  release();
  await assert.rejects(pending, (error: unknown) => error instanceof SshSessionRevokedError);
  assert.equal(created[0]?.ended, true);
  assert.equal(registry.size(), 0);
}

test("invalidate during connect does not keep the session", async () => {
  await acquireWhileConnecting((registry) => {
    registry.invalidate("srv-1");
  });
});

test("prune during connect does not keep the session", async () => {
  await acquireWhileConnecting((registry) => {
    registry.prune([]);
  });
});

test("closeAll during connect does not keep the session", async () => {
  await acquireWhileConnecting((registry) => {
    registry.closeAll();
  });
});
