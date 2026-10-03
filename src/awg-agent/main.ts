import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";

import { AWG_CONF_MAX_BYTES } from "@/lib/awg/conf";
import { bearerMatches } from "@/lib/docker/bearer";
import { isSafeProbeHost } from "@/lib/net/probe-host";
import { AwgTunnel } from "@/awg-agent/tunnel";

const PORT = 8091;

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function authorized(request: IncomingMessage, token: string): boolean {
  const proxy = request.headers["proxy-authorization"];
  const header = Array.isArray(proxy) ? proxy[0] : proxy;
  return bearerMatches(request.headers.authorization, token) || bearerMatches(header, token);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const raw = await readBody(request, AWG_CONF_MAX_BYTES + 1024);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Некорректный запрос");
  }
}

function hostFromBody(body: unknown): string {
  const host = body && typeof body === "object" && "host" in body ? (body as { host?: unknown }).host : null;
  if (typeof host !== "string" || !isSafeProbeHost(host.trim())) {
    throw new Error("Некорректный адрес узла");
  }
  return host.trim();
}

function portFromBody(body: unknown): number {
  const port = body && typeof body === "object" && "port" in body ? (body as { port?: unknown }).port : null;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Некорректный порт");
  }
  return port;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function handleConnect(request: IncomingMessage, socket: Duplex, head: Buffer, tunnel: AwgTunnel, token: string) {
  if (!authorized(request, token)) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  const target = request.url ?? "";
  const idx = target.lastIndexOf(":");
  const host = target.slice(0, idx);
  const port = Number(target.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !isSafeProbeHost(host) || !tunnel.hasRoute(host)) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const upstream = connect(port, host);
  const fail = () => {
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    upstream.destroy();
  };
  upstream.once("error", fail);
  upstream.once("connect", () => {
    upstream.removeListener("error", fail);
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) {
      upstream.write(head);
    }
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
}

async function versionLabel(): Promise<string> {
  const pinned = process.env.AWG_GO_VERSION?.trim();
  if (pinned) {
    return `amneziawg-go ${pinned}`;
  }
  return "amneziawg-go";
}

function main() {
  const token = process.env.GATE_AWG_TOKEN?.trim();
  if (!token) {
    console.error("[awg] GATE_AWG_TOKEN is required");
    process.exit(1);
  }

  void versionLabel().then((version) => {
    const tunnel = new AwgTunnel(version);
    const server = createServer((request, response) => {
      const url = request.url?.split("?")[0];
      if (request.method === "GET" && url === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (!authorized(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      void (async () => {
        try {
          if (request.method === "GET" && url === "/v1/status") {
            sendJson(response, 200, await tunnel.exclusive(() => tunnel.status()));
            return;
          }
          if (request.method === "POST" && url === "/v1/config") {
            const body = (await readJson(request)) as { conf?: unknown };
            if (typeof body.conf !== "string") {
              sendJson(response, 400, { error: "Нужен текст конфига AmneziaWG" });
              return;
            }
            await tunnel.exclusive(() => tunnel.apply(body.conf as string));
            sendJson(response, 200, await tunnel.status());
            return;
          }
          if (request.method === "DELETE" && url === "/v1/config") {
            await tunnel.exclusive(() => tunnel.clear());
            sendJson(response, 200, { ok: true });
            return;
          }
          if (request.method === "PUT" && url === "/v1/routes") {
            const body = (await readJson(request)) as { hosts?: unknown };
            const hosts = Array.isArray(body.hosts) ? body.hosts.filter((host): host is string => typeof host === "string") : null;
            if (!hosts || hosts.some((host) => !isSafeProbeHost(host.trim()))) {
              sendJson(response, 400, { error: "Некорректный список узлов" });
              return;
            }
            const result = await tunnel.exclusive(() => tunnel.replaceRoutes(hosts.map((host) => host.trim())));
            sendJson(response, 200, { hosts: result });
            return;
          }
          if (request.method === "POST" && url === "/v1/prepare") {
            const body = await readJson(request);
            const ip = await tunnel.exclusive(() => tunnel.prepare(hostFromBody(body)));
            sendJson(response, 200, { ip });
            return;
          }
          if (request.method === "POST" && url === "/v1/tcp-check") {
            const body = await readJson(request);
            const ip = await tunnel.exclusive(() => tunnel.tcpCheck(hostFromBody(body), portFromBody(body)));
            sendJson(response, 200, { ip });
            return;
          }
          if (request.method === "POST" && url === "/v1/icmp") {
            const body = await readJson(request);
            const rttMs = await tunnel.exclusive(() => tunnel.icmp(hostFromBody(body)));
            sendJson(response, 200, { rttMs });
            return;
          }
          sendJson(response, 404, { error: "not_found" });
        } catch (error) {
          const text = message(error, "Ошибка AmneziaWG");
          const status = text === "too_large" ? 413 : 422;
          sendJson(response, status, { error: text === "too_large" ? "Файл конфига больше 16 КБ" : text });
        }
      })();
    });

    server.on("connect", (request, socket, head) => {
      handleConnect(request, socket, head, tunnel, token);
    });
    server.listen(PORT, "0.0.0.0", () => {
      console.info(`[awg] listening on ${PORT}`);
    });
  });
}

main();
