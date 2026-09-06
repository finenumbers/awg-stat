import { createHash } from "node:crypto";

import { SshClient, type SshConnectionConfig, type SshSession } from "@/lib/ssh/client";
import { SESSION_MAX_AGE_MS } from "@/server/poll-defaults";

export type SshClientFactory = () => SshSession;

export class SshSessionRevokedError extends Error {
  constructor() {
    super("SSH session revoked");
    this.name = "SshSessionRevokedError";
  }
}

type SessionEntry = {
  client: SshSession;
  fingerprint: string;
  openedAt: number;
  hostKeyFingerprint: string | null;
};

export function sshConfigFingerprint(config: SshConnectionConfig): string {
  return createHash("sha256")
    .update(
      [config.host, String(config.port), config.username, config.password ?? "", config.privateKey ?? "", config.passphrase ?? ""].join(
        "\0",
      ),
    )
    .digest("hex");
}

export class SshSessionRegistry {
  private readonly maxAgeMs: number;
  private readonly createClient: SshClientFactory;
  private readonly entries = new Map<string, SessionEntry>();
  private readonly inflight = new Map<string, Promise<SessionEntry>>();
  private readonly generations = new Map<string, number>();

  constructor(options?: { maxAgeMs?: number; createClient?: SshClientFactory }) {
    this.maxAgeMs = options?.maxAgeMs ?? SESSION_MAX_AGE_MS;
    this.createClient = options?.createClient ?? (() => new SshClient());
  }

  async acquire(
    serverId: string,
    config: SshConnectionConfig,
  ): Promise<{ client: SshSession; hostKeyFingerprint: string | null }> {
    const fingerprint = sshConfigFingerprint(config);
    const current = this.entries.get(serverId);
    if (current && this.isReusable(current, fingerprint)) {
      return { client: current.client, hostKeyFingerprint: current.hostKeyFingerprint };
    }
    if (current) {
      this.invalidate(serverId);
    }

    const pending = this.inflight.get(serverId);
    if (pending) {
      const entry = await pending;
      if (this.isReusable(entry, fingerprint)) {
        return { client: entry.client, hostKeyFingerprint: entry.hostKeyFingerprint };
      }
      if (this.entries.get(serverId) === entry) {
        this.invalidate(serverId);
      }
    }

    const connecting = this.open(serverId, config, fingerprint);
    this.inflight.set(serverId, connecting);
    try {
      const entry = await connecting;
      return { client: entry.client, hostKeyFingerprint: entry.hostKeyFingerprint };
    } finally {
      if (this.inflight.get(serverId) === connecting) {
        this.inflight.delete(serverId);
      }
    }
  }

  invalidate(serverId: string): void {
    this.bump(serverId);
    this.inflight.delete(serverId);
    const entry = this.entries.get(serverId);
    if (!entry) {
      return;
    }
    this.entries.delete(serverId);
    entry.client.end();
  }

  prune(keepIds: Iterable<string>): void {
    const keep = new Set(keepIds);
    for (const serverId of this.knownIds()) {
      if (!keep.has(serverId)) {
        this.invalidate(serverId);
      }
    }
  }

  closeAll(): void {
    for (const serverId of this.knownIds()) {
      this.invalidate(serverId);
    }
  }

  size(): number {
    return this.entries.size;
  }

  private knownIds(): string[] {
    return [...new Set([...this.entries.keys(), ...this.inflight.keys()])];
  }

  private bump(serverId: string): void {
    this.generations.set(serverId, (this.generations.get(serverId) ?? 0) + 1);
  }

  private isReusable(entry: SessionEntry, fingerprint: string): boolean {
    if (!entry.client.isAlive()) {
      return false;
    }
    if (entry.fingerprint !== fingerprint) {
      return false;
    }
    return Date.now() - entry.openedAt < this.maxAgeMs;
  }

  private async open(serverId: string, config: SshConnectionConfig, fingerprint: string): Promise<SessionEntry> {
    const generation = this.generations.get(serverId) ?? 0;
    const client = this.createClient();
    const { hostKeyFingerprint } = await client.connect(config);
    if ((this.generations.get(serverId) ?? 0) !== generation) {
      client.end();
      throw new SshSessionRevokedError();
    }
    const entry: SessionEntry = {
      client,
      fingerprint,
      openedAt: Date.now(),
      hostKeyFingerprint,
    };
    this.entries.set(serverId, entry);
    return entry;
  }
}

export function getSshSessionRegistry(): SshSessionRegistry {
  const globalForRegistry = globalThis as { __gateSshRegistry?: SshSessionRegistry };
  return (globalForRegistry.__gateSshRegistry ??= new SshSessionRegistry());
}
