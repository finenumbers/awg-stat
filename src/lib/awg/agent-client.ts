import { connect, type Socket } from "node:net";

import { isSafeProbeHost } from "@/lib/net/probe-host";

export type AwgStatus = {
  up: boolean;
  handshakeAt: number | null;
  endpoint: string | null;
  rx: number;
  tx: number;
  version: string;
  configHash: string | null;
  applyError: string | null;
};

export type AwgHostResult = { host: string; ip?: string; error?: string };

type AgentConfig = { url: string; token: string };

function agentConfig(): AgentConfig | null {
  const url = process.env.GATE_AWG_URL?.trim().replace(/\/$/, "");
  const token = process.env.GATE_AWG_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

export function awgAgentConfigured(): boolean {
  return agentConfig() !== null;
}

async function agentFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const config = agentConfig();
  if (!config) {
    throw new Error("Клиент AmneziaWG не настроен в окружении");
  }
  const timeoutMs = init.timeoutMs ?? 10_000;
  const { timeoutMs: _timeout, ...request } = init;
  void _timeout;
  try {
    return await fetch(`${config.url}${path}`, {
      ...request,
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(request.body ? { "content-type": "application/json" } : {}),
        ...request.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("Контейнер AmneziaWG недоступен");
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function fetchAwgStatus(timeoutMs = 10_000): Promise<AwgStatus | null> {
  if (!awgAgentConfigured()) {
    return null;
  }
  try {
    const response = await agentFetch("/v1/status", { timeoutMs });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Partial<AwgStatus>;
    if (typeof body.up !== "boolean" || typeof body.version !== "string") {
      return null;
    }
    return {
      up: body.up,
      handshakeAt: typeof body.handshakeAt === "number" ? body.handshakeAt : null,
      endpoint: typeof body.endpoint === "string" ? body.endpoint : null,
      rx: typeof body.rx === "number" ? body.rx : 0,
      tx: typeof body.tx === "number" ? body.tx : 0,
      version: body.version,
      configHash: typeof body.configHash === "string" ? body.configHash : null,
      applyError: typeof body.applyError === "string" ? body.applyError : null,
    };
  } catch {
    return null;
  }
}

export async function applyAwgAgentConf(conf: string): Promise<void> {
  const response = await agentFetch("/v1/config", {
    method: "POST",
    body: JSON.stringify({ conf }),
    timeoutMs: 20_000,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Не удалось применить конфиг AmneziaWG"));
  }
}

export async function clearAwgAgent(): Promise<void> {
  if (!awgAgentConfigured()) {
    return;
  }
  const response = await agentFetch("/v1/config", { method: "DELETE", timeoutMs: 10_000 });
  if (!response.ok && response.status !== 404) {
    throw new Error(await readError(response, "Не удалось отключить AmneziaWG"));
  }
}

export async function replaceAwgRoutes(hosts: string[]): Promise<AwgHostResult[]> {
  const response = await agentFetch("/v1/routes", {
    method: "PUT",
    body: JSON.stringify({ hosts }),
    timeoutMs: 15_000,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Не удалось обновить маршруты AmneziaWG"));
  }
  const body = (await response.json()) as { hosts?: AwgHostResult[] };
  return Array.isArray(body.hosts) ? body.hosts : [];
}

export async function checkAwgTcp(host: string, port: number): Promise<string> {
  const response = await agentFetch("/v1/tcp-check", {
    method: "POST",
    body: JSON.stringify({ host, port }),
    timeoutMs: 15_000,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Узел недоступен через AmneziaWG"));
  }
  const body = (await response.json()) as { ip?: unknown };
  if (typeof body.ip !== "string") {
    throw new Error("Узел недоступен через AmneziaWG");
  }
  return body.ip;
}

export async function probeAwgIcmp(host: string): Promise<{ rttMs: number | null }> {
  const response = await agentFetch("/v1/icmp", {
    method: "POST",
    body: JSON.stringify({ host }),
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    return { rttMs: null };
  }
  const body = (await response.json()) as { rttMs?: unknown };
  return { rttMs: typeof body.rttMs === "number" ? body.rttMs : null };
}

export async function prepareAwgHost(host: string): Promise<string> {
  const response = await agentFetch("/v1/prepare", {
    method: "POST",
    body: JSON.stringify({ host }),
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Нет маршрута до узла через AmneziaWG"));
  }
  const body = (await response.json()) as { ip?: unknown };
  if (typeof body.ip !== "string") {
    throw new Error("Нет маршрута до узла через AmneziaWG");
  }
  return body.ip;
}

export function openAwgTunnelSocket(ip: string, port: number): Promise<Socket> {
  const config = agentConfig();
  if (!config) {
    return Promise.reject(new Error("Клиент AmneziaWG не настроен в окружении"));
  }
  if (!isSafeProbeHost(ip)) {
    return Promise.reject(new Error("Некорректный адрес узла"));
  }
  const proxy = new URL(config.url);
  const proxyPort = Number(proxy.port || 80);
  return new Promise((resolve, reject) => {
    const socket = connect(proxyPort, proxy.hostname);
    let buffer = "";
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Контейнер AmneziaWG недоступен")), 10_000);
    socket.on("error", (error) => {
      clearTimeout(timer);
      fail(error instanceof Error ? error : new Error("Контейнер AmneziaWG недоступен"));
    });
    socket.on("connect", () => {
      socket.write(
        `CONNECT ${ip}:${port} HTTP/1.1\r\nHost: ${ip}:${port}\r\nAuthorization: Bearer ${config.token}\r\n\r\n`,
      );
    });
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const split = buffer.indexOf("\r\n\r\n");
      if (split < 0) {
        return;
      }
      clearTimeout(timer);
      const header = buffer.slice(0, split);
      const rest = buffer.slice(split + 4);
      socket.removeAllListeners("data");
      if (!header.startsWith("HTTP/1.1 200")) {
        fail(new Error("Туннель AmneziaWG не принял соединение"));
        return;
      }
      if (rest.length > 0) {
        socket.unshift(Buffer.from(rest));
      }
      resolve(socket);
    });
  });
}

