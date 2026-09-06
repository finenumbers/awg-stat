import { Prisma, type AuthMethod } from "@prisma/client";

import { db } from "@/lib/db";
import type { SshAuthInput } from "@/lib/validations/identity";
import type { ServerInput } from "@/lib/validations/server";
import { filterPointsSince } from "@/lib/traffic-points";
import { RAW_RETENTION_DAYS, SPARKLINE_SAMPLES } from "@/server/poll-defaults";
import { createAuditEvent } from "@/server/services/audit.service";
import { CollectorError, onboardExistingServer } from "@/server/services/collector.service";
import { writeServerCredential } from "@/server/services/identity.service";

export type TrafficWindowId = "30m" | "24h" | "30d";

export type TrafficWindowView = {
  totals: { rx: number; tx: number };
  points: { t: number; rx: number; tx: number }[];
};

export type TrafficWindowsView = Record<TrafficWindowId, TrafficWindowView>;

const MS_30M = 30 * 60 * 1000;
const MS_24H = 24 * 60 * 60 * 1000;
const MS_30D = 30 * 24 * 60 * 60 * 1000;
const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;

function sumPoints(points: { rx: number; tx: number }[]) {
  return points.reduce(
    (acc, point) => ({ rx: acc.rx + point.rx, tx: acc.tx + point.tx }),
    { rx: 0, tx: 0 },
  );
}

function utcHour(ts: number) {
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
}

function bucketMinutes(
  points: { t: number; rx: number; tx: number }[],
  sinceMs: number,
  untilMs: number,
) {
  const buckets = new Map<number, { rx: number; tx: number }>();
  for (const point of points) {
    const t = Math.floor(point.t / MS_MINUTE) * MS_MINUTE;
    const current = buckets.get(t) ?? { rx: 0, tx: 0 };
    current.rx += point.rx;
    current.tx += point.tx;
    buckets.set(t, current);
  }
  const start = Math.floor(sinceMs / MS_MINUTE) * MS_MINUTE;
  const end = Math.floor(untilMs / MS_MINUTE) * MS_MINUTE;
  const out: { t: number; rx: number; tx: number }[] = [];
  for (let t = start; t <= end; t += MS_MINUTE) {
    const value = buckets.get(t) ?? { rx: 0, tx: 0 };
    out.push({ t, rx: value.rx, tx: value.tx });
  }
  return out;
}

function fillHours(
  rows: { t: number; rx: number; tx: number }[],
  sinceMs: number,
  untilMs: number,
) {
  const buckets = new Map(rows.map((row) => [row.t, row]));
  const out: { t: number; rx: number; tx: number }[] = [];
  for (let t = utcHour(sinceMs); t <= untilMs; t += MS_HOUR) {
    const value = buckets.get(t);
    out.push({ t, rx: value?.rx ?? 0, tx: value?.tx ?? 0 });
  }
  return out;
}

function toPoint(capturedAt: Date, rxDelta: bigint, txDelta: bigint) {
  return { t: capturedAt.getTime(), rx: Number(rxDelta), tx: Number(txDelta) };
}

export async function listServers() {
  return db.server.findMany({
    orderBy: { name: "asc" },
    include: {
      vpnInstance: {
        include: {
          peers: {
            where: { status: "ACTIVE" },
            select: { id: true, status: true },
          },
        },
      },
      serverSamples: {
        where: { capturedAt: { gte: new Date(Date.now() - MS_30M) } },
        orderBy: { capturedAt: "desc" },
      },
    },
  });
}

export async function getServerDetail(id: string) {
  return db.server.findUnique({
    where: { id },
    include: {
      vpnInstance: {
        include: {
          peers: {
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            include: { samples: { orderBy: { capturedAt: "desc" }, take: SPARKLINE_SAMPLES } },
          },
        },
      },
      serverSamples: {
        orderBy: { capturedAt: "desc" },
        take: 1,
      },
    },
  });
}

const PRESENCE_EVENTS_TAKE = 100;

export async function listPeerPresenceEvents(peerId: string) {
  const since = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const where = { peerId, occurredAt: { gte: since } };
  const [items, total] = await Promise.all([
    db.peerPresenceEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: PRESENCE_EVENTS_TAKE,
    }),
    db.peerPresenceEvent.count({ where }),
  ]);
  return { items, total };
}

export async function getPeerDetail(serverId: string, peerId: string) {
  const peer = await db.peer.findFirst({
    where: { id: peerId, vpnInstance: { serverId } },
    include: {
      vpnInstance: { include: { server: true } },
      samples: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });
  return peer;
}

export async function createAndOnboardServer(input: ServerInput, ssh: SshAuthInput, userId: string) {
  const server = await db.server.create({
    data: {
      name: input.name,
      host: input.host.trim(),
      port: input.port,
      sshUsername: ssh.username,
      sshAuthMethod: ssh.authMethod as AuthMethod,
      pollIntervalSec: input.pollIntervalSec,
    },
  });

  await writeServerCredential(server.id, ssh);

  try {
    await onboardExistingServer(server.id, userId);
  } catch (error) {
    await db.server.delete({ where: { id: server.id } });
    const message = error instanceof CollectorError ? error.message : "Не удалось подключиться к существующему AmneziaVPN";
    throw new Error(message);
  }

  await createAuditEvent({
    userId,
    action: "SERVER_CREATED",
    entityType: "server",
    entityId: server.id,
  });

  return server;
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function deleteServer(id: string, userId: string) {
  try {
    await db.server.delete({ where: { id } });
  } catch (error) {
    if (!isPrismaNotFound(error)) {
      throw error;
    }
  }
  await db.auditEvent.deleteMany({
    where: { entityType: "server", entityId: id },
  });
  await createAuditEvent({
    userId,
    action: "SERVER_DELETED",
    entityType: "server",
    entityId: id,
  });
}

export async function peerTraffic24h(peerId: string) {
  const since = new Date(Date.now() - MS_24H);
  const agg = await db.peerSample.aggregate({
    where: { peerId, capturedAt: { gte: since } },
    _sum: { rxDelta: true, txDelta: true },
  });
  return {
    rx: agg._sum.rxDelta ?? 0n,
    tx: agg._sum.txDelta ?? 0n,
  };
}

export async function peerTrafficWindows(peerId: string): Promise<TrafficWindowsView> {
  const now = Date.now();
  const since30m = now - MS_30M;
  const since24 = new Date(now - MS_24H);
  const since30 = new Date(now - MS_30D);

  const [raw24, hourly, hourlyTotals] = await Promise.all([
    db.peerSample.findMany({
      where: { peerId, capturedAt: { gte: since24 } },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, rxDelta: true, txDelta: true },
    }),
    db.peerHourlySample.findMany({
      where: { peerId, hourStart: { gte: since30 } },
      orderBy: { hourStart: "asc" },
      select: { hourStart: true, rxDelta: true, txDelta: true },
    }),
    db.peerHourlySample.aggregate({
      where: { peerId, hourStart: { gte: since30 } },
      _sum: { rxDelta: true, txDelta: true },
    }),
  ]);

  const points24raw = raw24.map((sample) => toPoint(sample.capturedAt, sample.rxDelta, sample.txDelta));
  const points30m = filterPointsSince(points24raw, since30m);
  const hourlyPoints = hourly.map((row) => ({
    t: row.hourStart.getTime(),
    rx: Number(row.rxDelta),
    tx: Number(row.txDelta),
  }));

  return {
    "30m": { totals: sumPoints(points30m), points: points30m },
    "24h": { totals: sumPoints(points24raw), points: bucketMinutes(points24raw, now - MS_24H, now) },
    "30d": {
      totals: {
        rx: Number(hourlyTotals._sum.rxDelta ?? 0n),
        tx: Number(hourlyTotals._sum.txDelta ?? 0n),
      },
      points: fillHours(hourlyPoints, now - MS_30D, now),
    },
  };
}

export async function serverTrafficWindows(serverId: string): Promise<TrafficWindowsView> {
  const now = Date.now();
  const since30m = now - MS_30M;
  const since24 = new Date(now - MS_24H);
  const since30 = new Date(now - MS_30D);

  const [raw24, hourly, hourlyTotals] = await Promise.all([
    db.serverSample.findMany({
      where: { serverId, capturedAt: { gte: since24 } },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, rxDelta: true, txDelta: true },
    }),
    db.peerHourlySample.groupBy({
      by: ["hourStart"],
      where: {
        hourStart: { gte: since30 },
        peer: { vpnInstance: { serverId } },
      },
      _sum: { rxDelta: true, txDelta: true },
      orderBy: { hourStart: "asc" },
    }),
    db.peerHourlySample.aggregate({
      where: {
        hourStart: { gte: since30 },
        peer: { vpnInstance: { serverId } },
      },
      _sum: { rxDelta: true, txDelta: true },
    }),
  ]);

  const points24raw = raw24.map((sample) => toPoint(sample.capturedAt, sample.rxDelta, sample.txDelta));
  const points30m = filterPointsSince(points24raw, since30m);
  const hourlyPoints = hourly.map((row) => ({
    t: row.hourStart.getTime(),
    rx: Number(row._sum.rxDelta ?? 0n),
    tx: Number(row._sum.txDelta ?? 0n),
  }));

  return {
    "30m": { totals: sumPoints(points30m), points: points30m },
    "24h": { totals: sumPoints(points24raw), points: bucketMinutes(points24raw, now - MS_24H, now) },
    "30d": {
      totals: {
        rx: Number(hourlyTotals._sum.rxDelta ?? 0n),
        tx: Number(hourlyTotals._sum.txDelta ?? 0n),
      },
      points: fillHours(hourlyPoints, now - MS_30D, now),
    },
  };
}
