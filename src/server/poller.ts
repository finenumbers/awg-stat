import PQueue from "p-queue";

import { db } from "@/lib/db";
import { getSshSessionRegistry } from "@/lib/ssh/session-registry";
import { POLL_DEADLINE_MS, POLL_INTERVAL_SEC, POLLER_LEASE_TTL_SEC } from "@/server/poll-defaults";
import { getPollerEpoch, getPollerState, isPollerStopping, pollerRuntime } from "@/server/poller-runtime";
import { pollServer, pruneOldSamples } from "@/server/services/collector.service";
import { ensureAppSettings } from "@/server/services/setup.service";

export { getPollerEpoch, getPollerState, isPollerStopping };

const queues = new Map<string, PQueue>();

function queueFor(serverId: string): PQueue {
  const existing = queues.get(serverId);
  if (existing) return existing;
  const queue = new PQueue({ concurrency: 1 });
  queues.set(serverId, queue);
  return queue;
}

function pruneQueues(keepIds: Iterable<string>): void {
  const keep = new Set(keepIds);
  for (const serverId of [...queues.keys()]) {
    if (!keep.has(serverId)) {
      queues.get(serverId)?.clear();
      queues.delete(serverId);
    }
  }
}

async function ensureLeaseRow(): Promise<void> {
  await db.pollerLease.upsert({
    where: { id: "default" },
    create: { id: "default", ownerId: null, expiresAt: new Date(0), epoch: 0 },
    update: {},
  });
}

async function ensureLease(): Promise<boolean> {
  if (pollerRuntime.stopping) {
    return false;
  }

  await ensureLeaseRow();

  const renewed = await db.$executeRaw`
    UPDATE "poller_lease"
    SET "expires_at" = now() + (${POLLER_LEASE_TTL_SEC} * interval '1 second')
    WHERE id = 'default' AND "owner_id" = ${pollerRuntime.ownerId}
  `;
  if (renewed === 1) {
    pollerRuntime.ownsLock = true;
    return true;
  }

  const acquired = await db.$queryRaw<Array<{ epoch: number }>>`
    UPDATE "poller_lease"
    SET "owner_id" = ${pollerRuntime.ownerId},
        "expires_at" = now() + (${POLLER_LEASE_TTL_SEC} * interval '1 second'),
        epoch = epoch + 1
    WHERE id = 'default' AND "expires_at" < now()
    RETURNING epoch
  `;

  if (acquired[0]) {
    const nextEpoch = acquired[0].epoch;
    if (pollerRuntime.ownsLock && pollerRuntime.epoch !== nextEpoch) {
      getSshSessionRegistry().closeAll();
    }
    if (!pollerRuntime.ownsLock) {
      console.info("[poller] lease acquired");
    }
    pollerRuntime.ownsLock = true;
    pollerRuntime.epoch = nextEpoch;
    return true;
  }

  if (pollerRuntime.ownsLock) {
    console.warn("[poller] lease lost, close SSH sessions");
    getSshSessionRegistry().closeAll();
  }
  pollerRuntime.ownsLock = false;
  pollerRuntime.epoch = null;
  return false;
}

async function tick() {
  if (pollerRuntime.stopping) {
    return;
  }
  if (!(await ensureLease())) {
    console.warn("[poller] lease not acquired, skip tick");
    return;
  }

  await ensureAppSettings();
  const servers = await db.server.findMany({ select: { id: true, lastPollAt: true } });
  const liveIds = servers.map((server) => server.id);
  getSshSessionRegistry().prune(liveIds);
  pruneQueues(liveIds);

  const now = Date.now();
  const intervalMs = POLL_INTERVAL_SEC * 1000;
  const epoch = getPollerEpoch();

  for (const server of servers) {
    const due = !server.lastPollAt || now - server.lastPollAt.getTime() >= intervalMs;
    if (!due) continue;
    void queueFor(server.id).add(async () => {
      if (pollerRuntime.stopping || getPollerEpoch() !== epoch) {
        return;
      }
      try {
        await pollServer(server.id, { deadlineMs: POLL_DEADLINE_MS, epoch });
      } catch (error) {
        const message = error instanceof Error ? error.message : "ошибка опроса";
        console.error(`[poller] poll failed server=${server.id}: ${message}`);
      }
    });
  }

  if (Math.floor(now / 1000) % 3600 < POLL_INTERVAL_SEC + 5) {
    await pruneOldSamples();
  }
}

export async function startPoller() {
  if (pollerRuntime.started) return;
  pollerRuntime.started = true;
  pollerRuntime.stopping = false;

  try {
    pollerRuntime.timer = setInterval(() => {
      void tick().catch((error) => {
        console.error("[poller] tick failed", error);
      });
    }, POLL_INTERVAL_SEC * 1000);
    console.info("[poller] interval started");
    await tick();
  } catch (error) {
    if (!pollerRuntime.timer) {
      pollerRuntime.started = false;
    }
    console.error("[poller] failed to start", error);
  }
}

export async function stopPoller() {
  pollerRuntime.stopping = true;
  if (pollerRuntime.timer) {
    clearInterval(pollerRuntime.timer);
    pollerRuntime.timer = null;
  }
  getSshSessionRegistry().closeAll();
  for (const queue of queues.values()) {
    queue.clear();
  }
  queues.clear();
  pollerRuntime.started = false;
  pollerRuntime.ownsLock = false;
  pollerRuntime.epoch = null;
}
