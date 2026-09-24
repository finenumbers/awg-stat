import { queryCheburcheck } from "@/lib/block-check/client";
import {
  applyObservation,
  globalBackoffAfterOutcome,
  isBlockCheckEnabled,
  isHostDue,
  isOutboundKeep,
  probeDelayMs,
  shouldStartBlockCheckRefresh,
  type HostBlockState,
} from "@/lib/block-check/schedule";
import { blockCheckHostKey, canQueryBlockCheckHost } from "@/lib/block-check/target";
import { db } from "@/lib/db";
import { canCommitPoll } from "@/lib/ssh/errors";
import { getPollerEpoch, isPollerStopping } from "@/server/poller-runtime";

const REFRESH_BACKOFF_MS = 60_000;

type ServerBlockRow = {
  id: string;
  host: string;
  lastBlockStatus: "unrestricted" | "blocked" | null;
  lastBlockCheckedAt: Date | null;
};

type BlockCheckState = {
  hosts: Map<string, HostBlockState>;
  inflight: Promise<void> | null;
  abort: AbortController | null;
  backoffUntil: number;
  lastProbeStartedAt: number;
};

const state: BlockCheckState = {
  hosts: new Map(),
  inflight: null,
  abort: null,
  backoffUntil: 0,
  lastProbeStartedAt: 0,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function canWrite(startedEpoch: number | null): boolean {
  return canCommitPoll({
    stopping: isPollerStopping(),
    startedEpoch,
    currentEpoch: getPollerEpoch(),
  });
}

function hydrateHost(server: ServerBlockRow): void {
  const key = blockCheckHostKey(server.host);
  if (state.hosts.has(key)) {
    return;
  }
  const status =
    server.lastBlockStatus === "unrestricted" || server.lastBlockStatus === "blocked"
      ? server.lastBlockStatus
      : null;
  state.hosts.set(key, {
    status,
    checkedAt: server.lastBlockCheckedAt?.getTime() ?? null,
    backoffUntil: 0,
  });
}

function idsForHost(servers: ServerBlockRow[], host: string): string[] {
  const key = blockCheckHostKey(host);
  return servers.filter((server) => blockCheckHostKey(server.host) === key).map((server) => server.id);
}

async function persistVerdict(
  ids: string[],
  status: "unrestricted" | "blocked",
  at: Date,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await db.server.updateMany({
    where: { id: { in: ids } },
    data: { lastBlockStatus: status, lastBlockCheckedAt: at },
  });
}

async function checkHost(
  host: string,
  servers: ServerBlockRow[],
  startedEpoch: number | null,
  signal: AbortSignal,
): Promise<{ statusCode: number | null; kind: "verdict" | "keep" }> {
  const outcome = await queryCheburcheck(host, {
    signal,
    beforeProbe: async () => {
      const delay = probeDelayMs(state.lastProbeStartedAt, Date.now());
      if (delay > 0) {
        await sleep(delay, signal);
      }
      if (signal.aborted) {
        return;
      }
      state.lastProbeStartedAt = Date.now();
    },
  });

  if (signal.aborted || !canWrite(startedEpoch)) {
    return { statusCode: outcome.statusCode, kind: "keep" };
  }

  const next = applyObservation(
    state.hosts.get(host),
    outcome.kind === "verdict" && outcome.status
      ? { kind: "status", status: outcome.status }
      : { kind: "keep" },
    Date.now(),
  );
  state.hosts.set(host, next);

  if (outcome.kind === "verdict" && outcome.status) {
    await persistVerdict(idsForHost(servers, host), outcome.status, new Date(next.checkedAt ?? Date.now()));
    console.info(
      `[block-check] host=${host} verdict=${outcome.status} status=${outcome.statusCode} durationMs=${outcome.durationMs}`,
    );
    return { statusCode: outcome.statusCode, kind: "verdict" };
  }

  if (outcome.statusCode != null && outcome.statusCode < 400) {
    console.info(
      `[block-check] host=${host} no scanner verdict status=${outcome.statusCode} durationMs=${outcome.durationMs}`,
    );
  } else {
    console.warn(
      `[block-check] host=${host} kept previous verdict status=${outcome.statusCode} durationMs=${outcome.durationMs}`,
    );
  }
  return { statusCode: outcome.statusCode, kind: "keep" };
}

async function refresh(startedEpoch: number | null, signal: AbortSignal): Promise<void> {
  try {
    const servers = await db.server.findMany({
      select: { id: true, host: true, lastBlockStatus: true, lastBlockCheckedAt: true },
      orderBy: { name: "asc" },
    });
    const hosts = [
      ...new Set(
        servers
          .filter((server) => canQueryBlockCheckHost(server.host))
          .map((server) => {
            hydrateHost(server);
            return blockCheckHostKey(server.host);
          }),
      ),
    ].sort();

    for (const key of [...state.hosts.keys()]) {
      if (!hosts.includes(key)) {
        state.hosts.delete(key);
      }
    }

    const now = Date.now();
    const due = hosts.filter((host) => isHostDue(state.hosts.get(host), now));
    let consecutiveOutboundKeeps = 0;

    for (const host of due) {
      if (signal.aborted || !canWrite(startedEpoch)) {
        break;
      }
      const result = await checkHost(host, servers, startedEpoch, signal);
      if (signal.aborted || !canWrite(startedEpoch)) {
        break;
      }
      if (result.kind === "verdict") {
        consecutiveOutboundKeeps = 0;
        continue;
      }
      if (isOutboundKeep(result.statusCode)) {
        consecutiveOutboundKeeps += 1;
      } else {
        consecutiveOutboundKeeps = 0;
      }
      const backoff = globalBackoffAfterOutcome({
        statusCode: result.statusCode,
        consecutiveOutboundKeeps,
      });
      if (backoff != null) {
        state.backoffUntil = Date.now() + backoff;
        console.warn(`[block-check] global backoff ${backoff}ms after status=${result.statusCode}`);
        break;
      }
    }
  } catch (error) {
    state.backoffUntil = Date.now() + REFRESH_BACKOFF_MS;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[block-check] refresh failed: ${message}`);
  }
}

export function ensureBlockCheckRefresh(now = Date.now()): void {
  if (!isBlockCheckEnabled()) {
    return;
  }
  if (isPollerStopping() || getPollerEpoch() == null) {
    return;
  }
  if (
    !shouldStartBlockCheckRefresh({
      now,
      inflight: state.inflight != null,
      backoffUntil: state.backoffUntil,
    })
  ) {
    return;
  }

  const startedEpoch = getPollerEpoch();
  const abort = new AbortController();
  state.abort = abort;
  const flight = refresh(startedEpoch, abort.signal).finally(() => {
    if (state.inflight === flight) {
      state.inflight = null;
    }
    if (state.abort === abort) {
      state.abort = null;
    }
  });
  state.inflight = flight;
}

export async function stopBlockCheckRefresh(): Promise<void> {
  state.abort?.abort();
  const flight = state.inflight;
  if (flight) {
    await flight.catch(() => undefined);
  }
}
