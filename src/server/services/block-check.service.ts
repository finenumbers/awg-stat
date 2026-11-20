import { queryCheburcheck } from "@/lib/block-check/client";
import {
  applyObservation,
  dueHostOrder,
  globalBackoffAfterOutcome,
  isBlockCheckEnabled,
  isHostDue,
  isOutboundKeep,
  probeDelayMs,
  shouldStartBlockCheckRefresh,
  type HostBlockState,
} from "@/lib/block-check/schedule";
import { blockCheckHostKey, canQueryBlockCheckHost } from "@/lib/block-check/target";
import { readBlockCheckToken } from "@/lib/block-check/token";
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

const noted = new Set<string>();
const skippedHosts = new Set<string>();

function noteOnce(key: string, message: string): void {
  if (noted.has(key)) {
    return;
  }
  noted.add(key);
  console.warn(message);
}

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
  sample: { tspuVotes: number | null; probeVotes: number | null },
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await db.server.updateMany({
    where: { id: { in: ids } },
    data: {
      lastBlockStatus: status,
      lastBlockCheckedAt: at,
      lastBlockTspuVotes: sample.tspuVotes,
      lastBlockProbeVotes: sample.probeVotes,
    },
  });
}

async function checkHost(
  host: string,
  servers: ServerBlockRow[],
  startedEpoch: number | null,
  signal: AbortSignal,
  token: string,
): Promise<{ statusCode: number | null; kind: "verdict" | "keep"; summary: string }> {
  const outcome = await queryCheburcheck(host, {
    signal,
    token,
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
    return { statusCode: outcome.statusCode, kind: "keep", summary: outcome.summary };
  }

  const next = applyObservation(
    state.hosts.get(host),
    outcome.kind === "verdict" && outcome.status
      ? { kind: "status", status: outcome.status }
      : { kind: "keep" },
    Date.now(),
  );

  if (outcome.kind === "verdict" && outcome.status) {
    await persistVerdict(idsForHost(servers, host), outcome.status, new Date(next.checkedAt ?? Date.now()), {
      tspuVotes: outcome.tspuVotes,
      probeVotes: outcome.probeVotes,
    });
    state.hosts.set(host, next);
    const votes = outcome.summary ? ` votes=${outcome.summary}` : "";
    const sample =
      outcome.tspuVotes != null && outcome.probeVotes != null
        ? ` sample=${outcome.tspuVotes}/${outcome.probeVotes}`
        : "";
    console.info(
      `[block-check] host=${host} verdict=${outcome.status} status=${outcome.statusCode} durationMs=${outcome.durationMs}${votes}${sample}`,
    );
    return { statusCode: outcome.statusCode, kind: "verdict", summary: outcome.summary };
  }

  state.hosts.set(host, next);
  const reason = outcome.summary ? ` reason=${outcome.summary}` : "";
  if (outcome.summary.startsWith("probe-")) {
    console.warn(
      `[block-check] host=${host} kept previous verdict status=${outcome.statusCode} durationMs=${outcome.durationMs}${reason}`,
    );
  } else if (outcome.statusCode != null && outcome.statusCode < 400) {
    console.info(
      `[block-check] host=${host} no scanner verdict status=${outcome.statusCode} durationMs=${outcome.durationMs}${reason}`,
    );
  } else {
    console.warn(
      `[block-check] host=${host} kept previous verdict status=${outcome.statusCode} durationMs=${outcome.durationMs}${reason}`,
    );
  }
  return { statusCode: outcome.statusCode, kind: "keep", summary: outcome.summary };
}

async function refresh(startedEpoch: number | null, signal: AbortSignal, token: string): Promise<void> {
  try {
    const servers = await db.server.findMany({
      select: { id: true, host: true, lastBlockStatus: true, lastBlockCheckedAt: true },
      orderBy: { name: "asc" },
    });
    for (const server of servers) {
      if (canQueryBlockCheckHost(server.host)) {
        continue;
      }
      const key = blockCheckHostKey(server.host);
      if (skippedHosts.has(key)) {
        continue;
      }
      skippedHosts.add(key);
      console.info(`[block-check] host skipped reason=not-public host=${key}`);
    }
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
    const due = dueHostOrder(
      hosts.filter((host) => isHostDue(state.hosts.get(host), now)),
      (host) => state.hosts.get(host)?.checkedAt,
    );
    let consecutiveOutboundKeeps = 0;

    for (const host of due) {
      if (signal.aborted || !canWrite(startedEpoch)) {
        break;
      }
      const result = await checkHost(host, servers, startedEpoch, signal, token);
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
        summary: result.summary,
      });
      if (backoff != null) {
        state.backoffUntil = Date.now() + backoff;
        if (result.summary === "probe-unauthorized") {
          console.warn(
            `[block-check] probe unauthorized; global backoff ${backoff}ms; https://cheburcheck.ru/kb/api#authorization`,
          );
        } else {
          console.warn(`[block-check] global backoff ${backoff}ms after status=${result.statusCode}`);
        }
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
  const token = readBlockCheckToken(process.env.GATE_CHEBURCHECK_TOKEN);
  if (token.kind === "missing") {
    noteOnce(
      "token-missing",
      "[block-check] GATE_CHEBURCHECK_TOKEN is empty, scanner probes are not started",
    );
    return;
  }
  if (token.kind === "invalid") {
    noteOnce(
      "token-invalid",
      "[block-check] GATE_CHEBURCHECK_TOKEN is unusable, scanner probes are not started",
    );
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
  const flight = refresh(startedEpoch, abort.signal, token.value).finally(() => {
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
