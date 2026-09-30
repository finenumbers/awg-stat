import { Writable } from "node:stream";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import Docker from "dockerode";

import { pollInnerScript } from "@/lib/amnezia/commands";
import { bearerMatches } from "@/lib/docker/bearer";
import {
  AWG_EXEC_TIMEOUT_MS,
  AwgExecTimeoutError,
  hostListenPortFromDockerPorts,
  readLocalAwgContainer,
  type AwgDocker,
  type ExecOutput,
} from "@/lib/docker/awg-target";

const PORT = 8090;
const MAX_STDOUT_BYTES = 1_048_576;

type InspectJson = {
  Name?: string;
  RestartCount?: number;
  State?: { Running?: boolean; Status?: string; StartedAt?: string };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostPort?: string }> | null> | null;
  };
};

function limitedBuffer() {
  let value = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      if (value.length < MAX_STDOUT_BYTES) {
        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        const next = value + text;
        value = next.length <= MAX_STDOUT_BYTES ? next : next.slice(0, MAX_STDOUT_BYTES);
      }
      callback();
    },
  });
  return { stream, text: () => value };
}

function createDockerClient(docker: Docker): AwgDocker {
  return {
    async list() {
      const rows = await docker.listContainers({
        all: true,
        filters: { name: ["amnezia-awg2"] },
      });
      return rows.map((row) => ({
        id: row.Id,
        names: row.Names ?? [],
        state: row.State,
      }));
    },
    async inspect(id: string) {
      const info = (await docker.getContainer(id).inspect()) as InspectJson;
      return {
        name: info.Name ?? "",
        running: Boolean(info.State?.Running),
        status: info.State?.Status ?? null,
        startedAt: info.State?.StartedAt ?? null,
        restartCount: typeof info.RestartCount === "number" ? info.RestartCount : null,
        hostListenPort: hostListenPortFromDockerPorts(info.NetworkSettings?.Ports),
      };
    },
    exec(id, script, signal) {
      return execInContainer(docker, id, script, signal);
    },
  };
}

async function execInContainer(docker: Docker, id: string, script: string, signal: AbortSignal): Promise<ExecOutput> {
  if (signal.aborted) {
    throw new AwgExecTimeoutError();
  }
  const container = docker.getContainer(id);
  const exec = await container.exec({
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: ["sh", "-c", script],
  });
  const stream = await exec.start({ hijack: true, stdin: false, Tty: false });
  const stdout = limitedBuffer();
  const stderr = limitedBuffer();

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new AwgExecTimeoutError());
      }, AWG_EXEC_TIMEOUT_MS);
      const onAbort = () => {
        clearTimeout(timer);
        stream.destroy();
        reject(new AwgExecTimeoutError());
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      docker.modem.demuxStream(stream, stdout.stream, stderr.stream);
      stream.on("end", () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
      stream.on("error", (error: Error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
    });
  } catch (error) {
    if (error instanceof AwgExecTimeoutError) {
      throw error;
    }
    throw new Error("docker exec failed");
  }

  let info = await exec.inspect();
  if (info.ExitCode == null) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    info = await exec.inspect();
  }
  return {
    exitCode: typeof info.ExitCode === "number" ? info.ExitCode : 1,
    stdout: stdout.text(),
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function contentLength(request: IncomingMessage): number {
  const raw = request.headers["content-length"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function handleRead(request: IncomingMessage, response: ServerResponse, docker: AwgDocker, token: string) {
  if (!bearerMatches(request.headers.authorization, token)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (contentLength(request) > 0) {
    sendJson(response, 400, { error: "awg_read_failed" });
    return;
  }

  const started = Date.now();
  const abort = new AbortController();
  const onClose = () => {
    if (!response.writableEnded) {
      abort.abort();
    }
  };
  request.on("close", onClose);
  try {
    const result = await readLocalAwgContainer(docker, pollInnerScript(), abort.signal);
    const elapsed = Date.now() - started;
    console.info(`[docker-agent] read result=${result.ok ? "ok" : result.error} ms=${elapsed}`);
    if (!result.ok) {
      const status = result.error === "awg_not_found" ? 404 : result.error === "awg_stopped" ? 409 : result.error === "awg_timeout" ? 504 : 502;
      sendJson(response, status, { error: result.error });
      return;
    }
    sendJson(response, 200, result);
  } catch (error) {
    console.error("[docker-agent] read failed", error instanceof Error ? error.name : "error");
    sendJson(response, 502, { error: "awg_read_failed" });
  } finally {
    request.off("close", onClose);
  }
}

export function startDockerAgent(docker: Docker, token: string) {
  const client = createDockerClient(docker);
  return createServer((request, response) => {
    const url = request.url?.split("?")[0];
    if (request.method === "GET" && url === "/health") {
      void docker
        .ping()
        .then(() => sendJson(response, 200, { ok: true }))
        .catch(() => {
          console.error("[docker-agent] docker ping failed");
          sendJson(response, 503, { ok: false });
        });
      return;
    }
    if (request.method === "POST" && url === "/v1/awg/read") {
      void handleRead(request, response, client, token);
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });
}

function main() {
  const token = process.env.GATE_DOCKER_AGENT_TOKEN?.trim();
  if (!token) {
    console.error("[docker-agent] GATE_DOCKER_AGENT_TOKEN is required");
    process.exit(1);
  }
  const socketPath = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  const docker = new Docker({ socketPath });
  const server = startDockerAgent(docker, token);
  server.listen(PORT, "0.0.0.0", () => {
    console.info(`[docker-agent] listening on ${PORT}`);
  });
}

main();
