import {
  ONLINE_THRESHOLD_SEC,
  PROTOCOL_TRAFFIC_MAX_BYTES,
  SAMPLE_FRESH_SEC,
} from "@/server/poll-defaults";

export type PresenceKind = "online" | "offline" | "stale" | "unknown" | "removed";
export type PresenceTone = "ok" | "warn" | "off";
export type PresenceActivity = "active" | "session";

export type Presence = {
  kind: PresenceKind;
  label: string;
  tone: PresenceTone;
};

export type PeerPresenceView = Presence & {
  activity: PresenceActivity | null;
  handshakeAgeSec: number | null;
  sessionLeftSec: number | null;
  pollBytes: bigint;
};

export function isProtocolTraffic(bytes: bigint | number): boolean {
  const value = typeof bytes === "bigint" ? bytes : BigInt(Math.max(0, Math.floor(bytes)));
  return value <= BigInt(PROTOCOL_TRAFFIC_MAX_BYTES);
}

export function isPollFresh(at: Date | null | undefined, nowMs = Date.now()): boolean {
  if (!at) {
    return false;
  }
  return nowMs - at.getTime() <= SAMPLE_FRESH_SEC * 1000;
}

export function isPeerOnline(input: {
  capturedAt: Date;
  handshakeUnix?: bigint | null;
  rxDelta?: bigint | null;
  txDelta?: bigint | null;
}): boolean {
  const capturedSec = Math.floor(input.capturedAt.getTime() / 1000);
  const handshakeUnix = input.handshakeUnix ?? 0n;
  return handshakeUnix > 0n && capturedSec - Number(handshakeUnix) <= ONLINE_THRESHOLD_SEC;
}

function pollBytesOf(input: { rxDelta?: bigint | null; txDelta?: bigint | null }): bigint {
  return (input.rxDelta ?? 0n) + (input.txDelta ?? 0n);
}

function handshakeSnapshot(
  capturedAt: Date | null | undefined,
  handshakeUnix?: bigint | null,
): { handshakeAgeSec: number | null; sessionLeftSec: number | null } {
  const handshake = handshakeUnix ?? 0n;
  if (!capturedAt || handshake <= 0n) {
    return { handshakeAgeSec: null, sessionLeftSec: null };
  }
  const capturedSec = Math.floor(capturedAt.getTime() / 1000);
  const handshakeAgeSec = capturedSec - Number(handshake);
  const sessionAlive = handshakeAgeSec <= ONLINE_THRESHOLD_SEC;
  return {
    handshakeAgeSec,
    sessionLeftSec: sessionAlive ? ONLINE_THRESHOLD_SEC - handshakeAgeSec : null,
  };
}

function withPeerMeta(
  presence: Presence,
  input: {
    capturedAt?: Date | null;
    handshakeUnix?: bigint | null;
    rxDelta?: bigint | null;
    txDelta?: bigint | null;
    activity?: PresenceActivity | null;
  },
): PeerPresenceView {
  return {
    ...presence,
    activity: input.activity ?? null,
    pollBytes: pollBytesOf(input),
    ...handshakeSnapshot(input.capturedAt, input.handshakeUnix),
  };
}

export function peerPresence(input: {
  status?: "ACTIVE" | "REMOVED";
  capturedAt?: Date | null;
  handshakeUnix?: bigint | null;
  rxDelta?: bigint | null;
  txDelta?: bigint | null;
  nowMs?: number;
}): PeerPresenceView {
  if (input.status === "REMOVED") {
    return withPeerMeta({ kind: "removed", label: "удалён в VPN", tone: "off" }, input);
  }
  if (!input.capturedAt) {
    return withPeerMeta({ kind: "unknown", label: "ещё нет сэмплов", tone: "off" }, input);
  }

  const nowMs = input.nowMs ?? Date.now();
  if (!isPollFresh(input.capturedAt, nowMs)) {
    return withPeerMeta({ kind: "stale", label: "данные устарели", tone: "warn" }, input);
  }

  if (
    isPeerOnline({
      capturedAt: input.capturedAt,
      handshakeUnix: input.handshakeUnix,
      rxDelta: input.rxDelta,
      txDelta: input.txDelta,
    })
  ) {
    const activity: PresenceActivity = isProtocolTraffic(pollBytesOf(input)) ? "session" : "active";
    return withPeerMeta(
      {
        kind: "online",
        label: activity === "session" ? "онлайн · сессия" : "онлайн",
        tone: "ok",
      },
      { ...input, activity },
    );
  }
  return withPeerMeta({ kind: "offline", label: "офлайн", tone: "warn" }, input);
}

export type PresenceEventKind = "ONLINE" | "OFFLINE";

export function previousPresenceOnline(input: {
  lastEventKind?: PresenceEventKind | null;
  lastSampleOnline?: boolean | null;
}): boolean | null {
  if (input.lastEventKind === "ONLINE") {
    return true;
  }
  if (input.lastEventKind === "OFFLINE") {
    return false;
  }
  if (typeof input.lastSampleOnline === "boolean") {
    return input.lastSampleOnline;
  }
  return null;
}

export function presenceTransition(input: {
  online: boolean;
  previousOnline: boolean | null;
}): PresenceEventKind | null {
  if (input.previousOnline === null) {
    return input.online ? "ONLINE" : null;
  }
  if (input.previousOnline === input.online) {
    return null;
  }
  return input.online ? "ONLINE" : "OFFLINE";
}

export function presenceEventView(kind: PresenceEventKind): Presence {
  if (kind === "ONLINE") {
    return { kind: "online", label: "онлайн", tone: "ok" };
  }
  return { kind: "offline", label: "офлайн", tone: "warn" };
}

export const POLL_ERROR_LABEL = "Ошибка опроса";

export function serverPollBadge(input: {
  lastPollAt?: Date | null;
  lastSampleAt?: Date | null;
  lastPollError?: string | null;
  running?: boolean;
  versionLabel?: string | null;
  nowMs?: number;
}): Presence {
  const at = input.lastPollAt ?? input.lastSampleAt ?? null;
  if (at && !isPollFresh(at, input.nowMs)) {
    return { kind: "stale", label: "данные устарели", tone: "warn" };
  }
  if (input.lastPollError) {
    return { kind: "offline", label: POLL_ERROR_LABEL, tone: "warn" };
  }
  if (input.running) {
    return { kind: "online", label: input.versionLabel ?? "контейнер запущен", tone: "ok" };
  }
  return { kind: "unknown", label: "нет снимка", tone: "off" };
}
