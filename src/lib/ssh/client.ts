import { Client, type ConnectConfig } from "ssh2";

import { createHostKeyVerifier } from "@/lib/ssh/host-key";

const DEFAULT_EXEC_TIMEOUT_MS = 45_000;
const MAX_STREAM_BYTES = 1_048_576;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 15_000;
const DEFAULT_KEEPALIVE_COUNT_MAX = 3;

export type SshConnectionConfig = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  readyTimeout?: number;
  expectedHostKeyFingerprint?: string | null;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type SshSession = {
  isAlive(): boolean;
  connect(config: SshConnectionConfig): Promise<{ hostKeyFingerprint: string | null }>;
  exec(command: string, execTimeoutMs?: number): Promise<ExecResult>;
  end(): void;
};

function appendStreamData(current: string, chunk: Buffer): string {
  if (current.length >= MAX_STREAM_BYTES) {
    return current;
  }
  const next = current + chunk.toString();
  return next.length <= MAX_STREAM_BYTES ? next : next.slice(0, MAX_STREAM_BYTES);
}

export class SshClient implements SshSession {
  private client = new Client();
  private alive = false;

  isAlive(): boolean {
    return this.alive;
  }

  async connect(config: SshConnectionConfig): Promise<{ hostKeyFingerprint: string | null }> {
    const hostKey = createHostKeyVerifier(config.expectedHostKeyFingerprint);
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: config.readyTimeout ?? 15000,
      hostHash: "sha256",
      hostVerifier: hostKey.verifier,
      keepaliveInterval: DEFAULT_KEEPALIVE_INTERVAL_MS,
      keepaliveCountMax: DEFAULT_KEEPALIVE_COUNT_MAX,
    };

    if (config.password) {
      connectConfig.password = config.password;
    }
    if (config.privateKey) {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) {
        connectConfig.passphrase = config.passphrase;
      }
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      this.client
        .on("ready", () => {
          this.alive = true;
          if (settled) {
            return;
          }
          settled = true;
          resolve({ hostKeyFingerprint: hostKey.getCaptured() });
        })
        .on("error", (error) => {
          this.alive = false;
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        })
        .on("close", () => {
          this.alive = false;
        })
        .on("end", () => {
          this.alive = false;
        })
        .connect(connectConfig);
    });
  }

  async exec(command: string, execTimeoutMs = DEFAULT_EXEC_TIMEOUT_MS): Promise<ExecResult> {
    if (!this.alive) {
      throw new Error("Not connected");
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, result?: ExecResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve(result ?? { stdout: "", stderr: "", code: 0 });
      };

      const timeout = setTimeout(() => {
        this.end();
        finish(new Error(`SSH-команда превысила ${execTimeoutMs} мс`));
      }, execTimeoutMs);

      this.client.exec(command, (err, stream) => {
        if (err) {
          finish(err);
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("error", (streamError: Error) => {
          finish(streamError);
        });

        stream
          .on("close", (code: number) => {
            finish(undefined, { stdout, stderr, code: code ?? 0 });
          })
          .on("data", (data: Buffer) => {
            stdout = appendStreamData(stdout, data);
          });

        stream.stderr.on("data", (data: Buffer) => {
          stderr = appendStreamData(stderr, data);
        });
      });
    });
  }

  end(): void {
    this.alive = false;
    this.client.end();
  }
}

export async function withDeadline<T>(
  work: Promise<T>,
  deadlineMs: number,
  onTimeout: () => void,
  message?: string,
): Promise<T> {
  const label = message ?? `SSH-опрос превысил ${deadlineMs} мс`;
  if (deadlineMs <= 0) {
    onTimeout();
    throw new Error(label);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(label));
    }, deadlineMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function withSshConnection<T>(
  config: SshConnectionConfig,
  fn: (client: SshClient) => Promise<T>,
  deadlineMs?: number,
): Promise<{ result: T; hostKeyFingerprint: string | null }> {
  const client = new SshClient();
  const work = (async () => {
    const connectResult = await client.connect(config);
    const result = await fn(client);
    return { result, hostKeyFingerprint: connectResult.hostKeyFingerprint };
  })();

  try {
    if (!deadlineMs || deadlineMs <= 0) {
      return await work;
    }
    return await withDeadline(work, deadlineMs, () => client.end());
  } finally {
    client.end();
  }
}
