import { assertReadOnlyCommand } from "@/lib/amnezia/commands";

export const LOCAL_AWG_CONTAINER = "amnezia-awg2";
export const AWG_EXEC_TIMEOUT_MS = 45_000;
const MAX_STDOUT_BYTES = 1_048_576;

export function normalizeContainerName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}

export function isExactLocalAwgName(name: string): boolean {
  return normalizeContainerName(name) === LOCAL_AWG_CONTAINER;
}

export type ListedContainer = {
  id: string;
  names: string[];
  state: string;
};

export type InspectedContainer = {
  name: string;
  running: boolean;
  status: string | null;
  startedAt: string | null;
  restartCount: number | null;
  hostListenPort: number | null;
};

export type ExecOutput = {
  exitCode: number;
  stdout: string;
};

export class AwgExecTimeoutError extends Error {
  constructor() {
    super("awg exec timeout");
    this.name = "AwgExecTimeoutError";
  }
}

export type AwgDocker = {
  list(): Promise<ListedContainer[]>;
  inspect(id: string): Promise<InspectedContainer>;
  exec(id: string, script: string, signal: AbortSignal): Promise<ExecOutput>;
};

export type AwgAgentError = "awg_not_found" | "awg_stopped" | "awg_read_failed" | "awg_timeout";

export type AwgAgentRead =
  | {
      ok: true;
      containerName: typeof LOCAL_AWG_CONTAINER;
      running: true;
      status: string | null;
      startedAt: string | null;
      restartCount: number | null;
      hostListenPort: number | null;
      exitCode: number;
      pollStdout: string;
    }
  | { ok: false; error: AwgAgentError };

export function hostListenPortFromDockerPorts(
  ports: Record<string, Array<{ HostPort?: string }> | null> | null | undefined,
): number | null {
  if (!ports) {
    return null;
  }
  for (const [key, bindings] of Object.entries(ports)) {
    if (!key.endsWith("/udp") || !bindings?.length) {
      continue;
    }
    const host = Number(bindings[0]?.HostPort);
    if (Number.isInteger(host) && host > 0 && host <= 65535) {
      return host;
    }
  }
  return null;
}

export function findLocalAwgContainer(containers: ListedContainer[]): ListedContainer | null {
  return (
    containers.find((container) => container.names.some((name) => isExactLocalAwgName(name))) ?? null
  );
}

export async function readLocalAwgContainer(
  docker: AwgDocker,
  script: string,
  signal: AbortSignal,
): Promise<AwgAgentRead> {
  assertReadOnlyCommand(script);
  const listed = await docker.list();
  const found = findLocalAwgContainer(listed);
  if (!found) {
    return { ok: false, error: "awg_not_found" };
  }
  if (found.state.toLowerCase() !== "running") {
    return { ok: false, error: "awg_stopped" };
  }

  const inspected = await docker.inspect(found.id);
  if (!isExactLocalAwgName(inspected.name)) {
    return { ok: false, error: "awg_read_failed" };
  }
  if (!inspected.running) {
    return { ok: false, error: "awg_stopped" };
  }

  let output: ExecOutput;
  try {
    output = await docker.exec(found.id, script, signal);
  } catch (error) {
    if (error instanceof AwgExecTimeoutError || signal.aborted) {
      return { ok: false, error: "awg_timeout" };
    }
    return { ok: false, error: "awg_read_failed" };
  }

  return {
    ok: true,
    containerName: LOCAL_AWG_CONTAINER,
    running: true,
    status: inspected.status,
    startedAt: inspected.startedAt,
    restartCount: inspected.restartCount,
    hostListenPort: inspected.hostListenPort,
    exitCode: Number.isInteger(output.exitCode) ? output.exitCode : 1,
    pollStdout: output.stdout.slice(0, MAX_STDOUT_BYTES),
  };
}
