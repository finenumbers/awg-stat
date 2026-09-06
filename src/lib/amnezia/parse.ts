export type AwgVersionHint = "V31" | "V30" | "V2" | "UNKNOWN";

export type ParsedPeer = {
  publicKey: string;
  rxBytes: bigint;
  txBytes: bigint;
  handshakeUnix: bigint;
  endpoint: string | null;
  allowedIps: string | null;
  vpnName: string | null;
};

export type ParsedPoll = {
  interfaceName: string | null;
  serverPublicKey: string | null;
  listenPort: number | null;
  awgVersion: AwgVersionHint;
  peers: ParsedPeer[];
  transferOk: boolean;
  handshakeOk: boolean;
};

const GATE_SECTION = /^---GATE:([a-z0-9-]+)---$/;
const IFACE = /^(awg|wg)\d+$/;

function isPublicKey(value: string): boolean {
  return /^[A-Za-z0-9+/]{42,44}={0,2}$/.test(value) && value.length >= 43;
}

function splitSections(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  let current: string | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (current) {
      map.set(current, buf.join("\n").trim());
    }
    buf.length = 0;
  };

  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(GATE_SECTION);
    if (match) {
      flush();
      current = match[1] === "end" ? null : match[1];
      continue;
    }
    if (current) {
      buf.push(line);
    }
  }
  flush();
  return map;
}

function parseIfaceKeyLines(text: string): { iface: string | null; value: string | null } {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) {
    return { iface: null, value: null };
  }
  const parts = line.split("\t");
  if (parts.length >= 2 && IFACE.test(parts[0])) {
    return { iface: parts[0], value: parts[1] };
  }
  if (parts.length === 1 && isPublicKey(parts[0])) {
    return { iface: null, value: parts[0] };
  }
  return { iface: null, value: null };
}

function parsePeerMap(
  text: string,
  consume: (parts: string[]) => void,
): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length >= 2 && IFACE.test(parts[0]) && isPublicKey(parts[1])) {
      consume(parts.slice(1));
      continue;
    }
    if (parts.length >= 1 && isPublicKey(parts[0])) {
      consume(parts);
    }
  }
}

export type ClientsTableName = { publicKey: string; name: string };

export function parseClientsTable(raw: string): ClientsTableName[] {
  const text = raw.trim();
  if (!text) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const names: ClientsTableName[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const clientId = typeof row.clientId === "string" ? row.clientId : "";
      const userData =
        row.userData && typeof row.userData === "object"
          ? (row.userData as Record<string, unknown>)
          : {};
      const name = typeof userData.clientName === "string" ? userData.clientName : "";
      if (clientId) {
        names.push({ publicKey: clientId, name });
      }
    }
    return names;
  }

  if (parsed && typeof parsed === "object") {
    for (const [clientId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!clientId) continue;
      const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const name = typeof obj.clientName === "string" ? obj.clientName : "";
      names.push({ publicKey: clientId, name });
    }
  }

  return names;
}

export function parsePollOutput(raw: string): ParsedPoll {
  const sections = splitSections(raw);
  const peers = new Map<string, ParsedPeer>();

  const ensure = (publicKey: string): ParsedPeer => {
    const existing = peers.get(publicKey);
    if (existing) return existing;
    const created: ParsedPeer = {
      publicKey,
      rxBytes: 0n,
      txBytes: 0n,
      handshakeUnix: 0n,
      endpoint: null,
      allowedIps: null,
      vpnName: null,
    };
    peers.set(publicKey, created);
    return created;
  };

  const publicKeySection = parseIfaceKeyLines(sections.get("public-key") ?? "");
  const listenSection = parseIfaceKeyLines(sections.get("listen-port") ?? "");

  parsePeerMap(sections.get("peers") ?? "", (parts) => {
    ensure(parts[0]);
  });

  parsePeerMap(sections.get("endpoints") ?? "", (parts) => {
    const peer = ensure(parts[0]);
    const endpoint = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
    peer.endpoint = endpoint;
  });

  parsePeerMap(sections.get("allowed-ips") ?? "", (parts) => {
    const peer = ensure(parts[0]);
    const rest = parts.slice(1).join(" ").trim();
    peer.allowedIps = rest && rest !== "(none)" ? rest : null;
  });

  let handshakeOk = false;
  parsePeerMap(sections.get("latest-handshakes") ?? "", (parts) => {
    if (parts.length < 2) return;
    const peer = ensure(parts[0]);
    const value = BigInt(parts[1] || "0");
    peer.handshakeUnix = value;
    handshakeOk = true;
  });

  let transferOk = false;
  parsePeerMap(sections.get("transfer") ?? "", (parts) => {
    if (parts.length < 3) return;
    const peer = ensure(parts[0]);
    peer.rxBytes = BigInt(parts[1] || "0");
    peer.txBytes = BigInt(parts[2] || "0");
    transferOk = true;
  });

  const names = parseClientsTable(sections.get("clients-table") ?? "");
  for (const item of names) {
    const peer = peers.get(item.publicKey);
    if (peer) {
      peer.vpnName = item.name || null;
    }
  }

  const trailers = (sections.get("random-trailers") ?? "").toLowerCase();
  const cookies = (sections.get("disable-cookies") ?? "").toLowerCase();
  const padding = sections.get("content-padding-addition") ?? "";
  let awgVersion: AwgVersionHint = "UNKNOWN";
  if (sectionHasOnOff(trailers) || sectionHasOnOff(cookies)) {
    awgVersion = "V31";
  } else if (sectionHasPadding(padding)) {
    awgVersion = "V30";
  } else if ((sections.get("listen-port") ?? "").trim()) {
    awgVersion = "V2";
  }

  const listenPortRaw = listenSection.value;
  const listenPort = listenPortRaw && /^\d+$/.test(listenPortRaw) ? Number(listenPortRaw) : null;

  return {
    interfaceName: publicKeySection.iface ?? listenSection.iface,
    serverPublicKey: publicKeySection.value && isPublicKey(publicKeySection.value) ? publicKeySection.value : null,
    listenPort,
    awgVersion,
    peers: [...peers.values()],
    transferOk,
    handshakeOk,
  };
}

export function computeDelta(current: bigint, previous: bigint | null): bigint {
  if (previous === null) {
    return 0n;
  }
  if (current < previous) {
    return current;
  }
  return current - previous;
}

export type DockerPsRow = {
  name: string;
  state: string;
  running: boolean;
};

export function parseDockerPs(raw: string): DockerPsRow[] {
  const rows: DockerPsRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, stateRaw = ""] = trimmed.split("\t");
    if (!isAllowedName(name)) continue;
    const state = stateRaw.trim().toLowerCase();
    rows.push({
      name,
      state,
      running: state === "running",
    });
  }
  return rows;
}

function isAllowedName(name: string): boolean {
  return /^amnezia-awg[0-9a-z-]*$/.test(name);
}

function sectionHasOnOff(text: string): boolean {
  return /\bon\b/.test(text) || /\boff\b/.test(text);
}

function sectionHasPadding(text: string): boolean {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line || /invalid parameter/i.test(line)) {
    return false;
  }
  const parts = line.split("\t");
  if (parts.length >= 2 && IFACE.test(parts[0]) && parts[1]) {
    return true;
  }
  return /^(off|\d+(-\d+)?)$/i.test(line);
}

export type ParsedDockerInspect = {
  running: boolean;
  status: string | null;
  startedAt: Date | null;
  restartCount: number | null;
  hostListenPort: number | null;
};

const UDP_HOST_PORT = /(\d+)\/udp=(\d+)/gi;

function parseInspectDate(value: string): Date | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const normalized = text.replace(/(\.\d{3})\d+/, "$1");
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    return null;
  }
  const date = new Date(ms);
  if (date.getUTCFullYear() < 1970) {
    return null;
  }
  return date;
}

export function parseDockerInspect(raw: string): ParsedDockerInspect {
  const line =
    raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean) ?? "";
  if (!line) {
    return { running: false, status: null, startedAt: null, restartCount: null, hostListenPort: null };
  }

  const parts = line.includes("\t") ? line.split("\t") : line.split(/\s+/);
  const running = (parts[0] ?? "").toLowerCase() === "true";
  const status = parts[1]?.trim() || null;
  const startedAt = parseInspectDate(parts[2] ?? "");
  const restartRaw = (parts[3] ?? "").trim();
  const restartCount = /^\d+$/.test(restartRaw) ? Number(restartRaw) : null;
  const portsField = parts.slice(4).join(" ");
  let hostListenPort: number | null = null;
  for (const match of portsField.matchAll(UDP_HOST_PORT)) {
    const host = Number(match[2]);
    if (Number.isInteger(host) && host > 0 && host <= 65535) {
      hostListenPort = host;
      break;
    }
  }

  return { running, status, startedAt, restartCount, hostListenPort };
}

export function selectTargetContainer(rows: DockerPsRow[]): {
  target: DockerPsRow | null;
  stoppedTarget: DockerPsRow | null;
  others: DockerPsRow[];
} {
  const awg2 = rows.filter((row) => row.name === "amnezia-awg2");
  const running = awg2.find((row) => row.running) ?? null;
  const stopped = awg2.find((row) => !row.running) ?? null;
  return {
    target: running,
    stoppedTarget: running ? null : stopped,
    others: rows.filter((row) => row.name !== "amnezia-awg2"),
  };
}
