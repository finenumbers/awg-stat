export const AWG_CONTAINER_NAME = /^amnezia-awg[0-9a-z-]*$/;
export const CLIENTS_TABLE_PATH = "/opt/amnezia/awg/clientsTable";

const FORBIDDEN = [
  "awg set",
  "awg syncconf",
  "awg-quick",
  "wg set",
  "wg syncconf",
  "wg-quick",
  " dump",
  "private-key",
  "preshared-keys",
  "header-protection-key",
  "awg0.conf",
  "wg0.conf",
  "docker cp",
  "docker restart",
  "docker stop",
  "docker rm",
  "docker rename",
  "docker run",
  "docker start",
  "iptables",
  "sysctl",
  "visudo",
  "apt-get",
  "apt install",
];

export type DockerPrefix = "docker" | "sudo -n docker";

export function isAllowedContainerName(name: string): boolean {
  return AWG_CONTAINER_NAME.test(name);
}

export function assertAllowedContainerName(name: string): string {
  if (!isAllowedContainerName(name)) {
    throw new Error("Недопустимое имя контейнера");
  }
  return name;
}

export function assertReadOnlyCommand(command: string): void {
  const lower = command.toLowerCase();
  for (const token of FORBIDDEN) {
    if (lower.includes(token)) {
      throw new Error(`Запрещённая команда: ${token.trim()}`);
    }
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function withDocker(prefix: DockerPrefix, rest: string): string {
  const command = `${prefix} ${rest}`;
  assertReadOnlyCommand(command);
  return command;
}

export function dockerPsCommand(prefix: DockerPrefix): string {
  return withDocker(
    prefix,
    "ps --filter name=amnezia-awg --format '{{.Names}}\t{{.State}}'",
  );
}

export function dockerPsAllCommand(prefix: DockerPrefix): string {
  return withDocker(
    prefix,
    "ps -a --filter name=amnezia-awg --format '{{.Names}}\t{{.State}}'",
  );
}

export function dockerInspectCommand(prefix: DockerPrefix, container: string): string {
  const name = assertAllowedContainerName(container);
  const format =
    "{{.State.Running}}\t{{.State.Status}}\t{{.State.StartedAt}}\t{{.RestartCount}}\t" +
    "{{range $p, $b := .NetworkSettings.Ports}}{{$p}}={{if $b}}{{(index $b 0).HostPort}}{{end}} {{end}}";
  return withDocker(prefix, `inspect --format '${format}' ${shellSingleQuote(name)}`);
}

const REQUIRED_SELECTORS = [
  "public-key",
  "listen-port",
  "peers",
  "allowed-ips",
  "latest-handshakes",
  "transfer",
  "endpoints",
] as const;

const OPTIONAL_SELECTORS = ["random-trailers", "disable-cookies", "content-padding-addition"] as const;

function pollInnerScript(): string {
  const lines: string[] = ["set +e"];

  for (const selector of REQUIRED_SELECTORS) {
    lines.push(`printf '%s\\n' '---GATE:${selector}---'`);
    lines.push(`awg show all ${selector}`);
    lines.push("printf '\\n'");
  }

  for (const selector of OPTIONAL_SELECTORS) {
    lines.push(`printf '%s\\n' '---GATE:${selector}---'`);
    lines.push(`awg show all ${selector} || true`);
    lines.push("printf '\\n'");
  }

  lines.push(`printf '%s\\n' '---GATE:clients-table---'`);
  lines.push(`cat ${CLIENTS_TABLE_PATH} || true`);
  lines.push("printf '\\n'");
  lines.push(`printf '%s\\n' '---GATE:end---'`);

  return lines.join("\n");
}

export function awgPollCommand(prefix: DockerPrefix, container: string): string {
  const name = assertAllowedContainerName(container);
  const inner = pollInnerScript();
  const command = `${prefix} exec ${shellSingleQuote(name)} sh -c ${shellSingleQuote(inner)}`;
  assertReadOnlyCommand(command);
  return command;
}

export function isForbiddenCommand(command: string): boolean {
  try {
    assertReadOnlyCommand(command);
    return false;
  } catch {
    return true;
  }
}
