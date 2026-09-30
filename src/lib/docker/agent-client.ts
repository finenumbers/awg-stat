import { LOCAL_AWG_CONTAINER, type AwgAgentRead } from "@/lib/docker/awg-target";

export type LocalDockerPhase = "onboard" | "poll";

export type LocalDockerFailure =
  | "unconfigured"
  | "unauthorized"
  | "unreachable"
  | "timeout"
  | "not_found"
  | "stopped"
  | "read_failed"
  | "bad_response";

export type AwgReadBody = Extract<AwgAgentRead, { ok: true }>;

export type FetchAwgReadResult = { ok: true; body: AwgReadBody } | { ok: false; code: LocalDockerFailure };

function agentConfig(): { url: string; token: string } | null {
  const url = process.env.GATE_DOCKER_AGENT_URL?.trim().replace(/\/$/, "");
  const token = process.env.GATE_DOCKER_AGENT_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

export function localDockerErrorMessage(code: LocalDockerFailure, phase: LocalDockerPhase): string {
  switch (code) {
    case "unconfigured":
      return "Локальный Docker не подключён";
    case "unauthorized":
      return "Локальный Docker-агент отклонил доступ";
    case "unreachable":
      return "Локальный Docker-агент недоступен";
    case "timeout":
      return "Опрос контейнера amnezia-awg2 превысил 45 с";
    case "not_found":
      return "На хосте не найдена работающая установка AmneziaWG (amnezia-awg2)";
    case "stopped":
      return phase === "onboard"
        ? "Контейнер amnezia-awg2 найден, но не запущен. Gate его не стартует — поднимите VPN в приложении AmneziaVPN"
        : "Контейнер amnezia-awg2 не запущен";
    case "read_failed":
      return "Не удалось прочитать состояние AmneziaWG (только чтение awg show)";
    case "bad_response":
      return "Локальный Docker-агент вернул непонятный ответ";
  }
}

function failureFromStatus(status: number, error: unknown): LocalDockerFailure {
  if (error === "awg_not_found" || status === 404) {
    return "not_found";
  }
  if (error === "awg_stopped" || status === 409) {
    return "stopped";
  }
  if (error === "awg_timeout" || status === 504) {
    return "timeout";
  }
  if (status === 401) {
    return "unauthorized";
  }
  return "read_failed";
}

function isAwgReadBody(value: unknown): value is AwgReadBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const body = value as Partial<AwgReadBody>;
  return (
    body.ok === true &&
    body.containerName === LOCAL_AWG_CONTAINER &&
    body.running === true &&
    typeof body.pollStdout === "string" &&
    typeof body.exitCode === "number"
  );
}

export async function fetchAwgRead(signal: AbortSignal): Promise<FetchAwgReadResult> {
  const config = agentConfig();
  if (!config) {
    return { ok: false, code: "unconfigured" };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/v1/awg/read`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}` },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return { ok: false, code: "unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    return { ok: false, code: failureFromStatus(response.status, error) };
  }
  if (!isAwgReadBody(payload)) {
    return { ok: false, code: "bad_response" };
  }
  return { ok: true, body: payload };
}
