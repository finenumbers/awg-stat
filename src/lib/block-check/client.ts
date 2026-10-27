import {
  buildCheckUrl,
  buildProbeUrl,
  consumeSseBuffer,
  dedupeProbeVotes,
  votesFromSseEvents,
  type SseProbeVote,
} from "./probe-stream";
import { BLOCK_CHECK_PROBE_TIMEOUT_MS } from "./schedule";
import {
  finishedProbeTotal,
  formatDisplayedVoteSummary,
  resolveBadgeStatus,
  tspuVoteSample,
  type ProbeVote,
} from "./verdict";

const CHECK_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;
const USER_AGENT = "awg-stat";

export type CheckOutcome = {
  kind: "verdict" | "keep";
  status: "unrestricted" | "blocked" | null;
  statusCode: number | null;
  durationMs: number;
  summary: string;
  tspuVotes: number | null;
  probeVotes: number | null;
};

type CheckBody = {
  registryBlocked: boolean;
  isStaticCdn: boolean;
  id: string | null;
};

function parseCheckBody(body: string): CheckBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as { blocked?: unknown; id?: unknown; cdn_providers?: unknown };
  if (typeof record.blocked !== "boolean") {
    return null;
  }

  const providers = record.cdn_providers;
  const isStaticCdn =
    providers != null &&
    typeof providers === "object" &&
    !Array.isArray(providers) &&
    Object.keys(providers).length > 0;

  return {
    registryBlocked: record.blocked,
    isStaticCdn,
    id: typeof record.id === "string" ? record.id : null,
  };
}

function requestSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) {
    return timeout;
  }
  return AbortSignal.any([timeout, external]);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  text += decoder.decode();
  return text;
}

async function readProbeVotes(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  votes: SseProbeVote[];
  failed: boolean;
  done: boolean;
  statusCode: number | null;
  responseCount: number | null;
}> {
  const votes: SseProbeVote[] = [];
  let statusCode: number | null = null;
  const unfinished = (failed: boolean) => ({
    votes,
    failed,
    done: false,
    statusCode,
    responseCount: null,
  });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: requestSignal(BLOCK_CHECK_PROBE_TIMEOUT_MS, signal),
      headers: {
        Accept: "text/event-stream",
        "User-Agent": USER_AGENT,
      },
    });
    statusCode = response.status;
    if (response.status !== 200 || !response.body) {
      return unfinished(true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let received = 0;
    try {
      while (true) {
        if (signal?.aborted) {
          return unfinished(votes.length === 0);
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.byteLength;
        if (received > MAX_BODY_BYTES) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const consumed = consumeSseBuffer(buffer);
        buffer = consumed.rest;
        const parsed = votesFromSseEvents(consumed.events);
        votes.push(...parsed.votes);
        if (parsed.done) {
          return { votes, failed: false, done: true, statusCode, responseCount: parsed.responseCount };
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    return unfinished(votes.length === 0);
  } catch {
    return unfinished(true);
  }
}

export async function queryCheburcheck(
  host: string,
  options: { fetchImpl?: typeof fetch; beforeProbe?: () => Promise<void>; signal?: AbortSignal } = {},
): Promise<CheckOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();
  let statusCode: number | null = null;

  const finish = (
    kind: CheckOutcome["kind"],
    status: CheckOutcome["status"],
    sample: { summary?: string; tspuVotes?: number | null; probeVotes?: number | null } = {},
  ): CheckOutcome => ({
    kind,
    status,
    statusCode,
    durationMs: Date.now() - started,
    summary: sample.summary ?? "",
    tspuVotes: sample.tspuVotes ?? null,
    probeVotes: sample.probeVotes ?? null,
  });

  if (options.signal?.aborted) {
    return finish("keep", null);
  }

  try {
    const checkResponse = await fetchImpl(buildCheckUrl(host), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: requestSignal(CHECK_TIMEOUT_MS, options.signal),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    statusCode = checkResponse.status;
    if (checkResponse.status !== 200) {
      return finish("keep", null);
    }

    const body = await readLimitedText(checkResponse, MAX_BODY_BYTES);
    if (body == null) {
      return finish("keep", null);
    }
    const parsed = parseCheckBody(body);
    if (!parsed) {
      return finish("keep", null);
    }

    let votes: ProbeVote[] = [];
    let responseCount: number | null = null;
    const probeUrl = parsed.id ? buildProbeUrl(parsed.id) : null;
    if (parsed.id && !probeUrl) {
      return finish("keep", null, { summary: "probe-id-rejected" });
    }
    if (probeUrl) {
      if (options.signal?.aborted) {
        return finish("keep", null);
      }
      await options.beforeProbe?.();
      if (options.signal?.aborted) {
        return finish("keep", null);
      }
      const probe = await readProbeVotes(probeUrl, fetchImpl, options.signal);
      statusCode = probe.statusCode ?? statusCode;
      if (!probe.done && probe.votes.length > 0) {
        return finish("keep", null);
      }
      if (probe.failed && probe.votes.length === 0 && !parsed.registryBlocked) {
        return finish("keep", null);
      }
      votes = probe.done ? dedupeProbeVotes(probe.votes) : probe.votes;
      responseCount = probe.done ? probe.responseCount : null;
    }

    const status = resolveBadgeStatus({
      registryBlocked: parsed.registryBlocked,
      isStaticCdn: parsed.isStaticCdn,
      votes,
    });
    if (status === "unknown") {
      return finish("keep", null);
    }
    const sample = tspuVoteSample(votes, parsed.isStaticCdn);
    return finish("verdict", status, {
      summary: formatDisplayedVoteSummary(votes, parsed.isStaticCdn),
      tspuVotes: sample?.tspuVotes ?? null,
      probeVotes: sample ? finishedProbeTotal(sample.probeVotes, responseCount) : null,
    });
  } catch {
    return finish("keep", null);
  }
}
