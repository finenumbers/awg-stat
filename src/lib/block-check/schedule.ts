export const BLOCK_CHECK_INTERVAL_MS = 10 * 60 * 1000;
export const BLOCK_CHECK_BACKOFF_MS = 60_000;
export const BLOCK_CHECK_PROBE_GAP_MS = 12_000;
export const BLOCK_CHECK_PROBE_TIMEOUT_MS = 20_000;
export const BLOCK_CHECK_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
export const BLOCK_CHECK_OUTBOUND_FAIL_LIMIT = 3;

export type HostBlockState = {
  status: "unrestricted" | "blocked" | null;
  checkedAt: number | null;
  backoffUntil: number;
};

export function isBlockCheckEnabled(value = process.env.GATE_BLOCK_CHECK): boolean {
  return value !== "0";
}

export function isHostDue(state: HostBlockState | undefined, now: number): boolean {
  if (!state) {
    return true;
  }

  if (now < state.backoffUntil) {
    return false;
  }

  if (state.checkedAt == null) {
    return true;
  }

  return now - state.checkedAt >= BLOCK_CHECK_INTERVAL_MS;
}

export function probeDelayMs(
  lastProbeStartedAt: number,
  now: number,
  gapMs = BLOCK_CHECK_PROBE_GAP_MS,
): number {
  if (lastProbeStartedAt <= 0) {
    return 0;
  }

  return Math.max(0, gapMs - (now - lastProbeStartedAt));
}

export function applyObservation(
  previous: HostBlockState | undefined,
  outcome: { kind: "status"; status: "unrestricted" | "blocked" } | { kind: "keep" },
  now: number,
  backoffMs = BLOCK_CHECK_BACKOFF_MS,
): HostBlockState {
  if (outcome.kind === "status") {
    return {
      status: outcome.status,
      checkedAt: now,
      backoffUntil: 0,
    };
  }

  return {
    status: previous?.status ?? null,
    checkedAt: previous?.checkedAt ?? null,
    backoffUntil: now + backoffMs,
  };
}

export function shouldStartBlockCheckRefresh(input: {
  now: number;
  inflight: boolean;
  backoffUntil: number;
}): boolean {
  if (input.inflight) {
    return false;
  }

  return input.now >= input.backoffUntil;
}

export function isOutboundKeep(statusCode: number | null): boolean {
  return statusCode == null || statusCode >= 500 || statusCode === 429;
}

export function globalBackoffAfterOutcome(input: {
  statusCode: number | null;
  consecutiveOutboundKeeps: number;
}): number | null {
  if (input.statusCode === 429) {
    return BLOCK_CHECK_RATE_LIMIT_BACKOFF_MS;
  }
  if (input.consecutiveOutboundKeeps >= BLOCK_CHECK_OUTBOUND_FAIL_LIMIT) {
    return BLOCK_CHECK_BACKOFF_MS;
  }
  return null;
}
