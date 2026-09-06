import { ONLINE_THRESHOLD_SEC, SAMPLE_FRESH_SEC } from "@/server/poll-defaults";

export type PresenceKind = "online" | "offline" | "stale" | "unknown" | "removed";
export type PresenceTone = "ok" | "warn" | "off";

export type Presence = {
  kind: PresenceKind;
  label: string;
  tone: PresenceTone;
};

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
  const sessionAlive =
    handshakeUnix > 0n && capturedSec - Number(handshakeUnix) <= ONLINE_THRESHOLD_SEC;
  const hasTraffic = (input.rxDelta ?? 0n) + (input.txDelta ?? 0n) > 0n;
  return sessionAlive || hasTraffic;
}

export function peerPresence(input: {
  status?: "ACTIVE" | "REMOVED";
  capturedAt?: Date | null;
  handshakeUnix?: bigint | null;
  rxDelta?: bigint | null;
  txDelta?: bigint | null;
  nowMs?: number;
}): Presence {
  if (input.status === "REMOVED") {
    return { kind: "removed", label: "удалён в VPN", tone: "off" };
  }
  if (!input.capturedAt) {
    return { kind: "unknown", label: "ещё нет сэмплов", tone: "off" };
  }

  const nowMs = input.nowMs ?? Date.now();
  if (!isPollFresh(input.capturedAt, nowMs)) {
    return { kind: "stale", label: "данные устарели", tone: "warn" };
  }

  if (
    isPeerOnline({
      capturedAt: input.capturedAt,
      handshakeUnix: input.handshakeUnix,
      rxDelta: input.rxDelta,
      txDelta: input.txDelta,
    })
  ) {
    return { kind: "online", label: "онлайн", tone: "ok" };
  }
  return { kind: "offline", label: "офлайн", tone: "warn" };
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
    return { kind: "offline", label: "ошибка опроса", tone: "warn" };
  }
  if (input.running) {
    return { kind: "online", label: input.versionLabel ?? "контейнер запущен", tone: "ok" };
  }
  return { kind: "unknown", label: "нет снимка", tone: "off" };
}
