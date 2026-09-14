export const POLL_INTERVAL_SEC = 15;
export const ONLINE_THRESHOLD_SEC = 180;
export const SAMPLE_FRESH_SEC = 120;
/** UI-only: bytes in one 15s poll that we treat as keepalive/handshake, not user activity. */
export const PROTOCOL_TRAFFIC_MAX_BYTES = 4096;
export const POLL_DEADLINE_MS = 120_000;
/** Raw 15s samples kept for 24h charts plus clock-skew margin. */
export const RAW_SAMPLE_RETENTION_HOURS = 48;
/** Presence journal, geo enrich window, and ip geo cache. */
export const PRESENCE_RETENTION_DAYS = 30;
export const SPARKLINE_SAMPLES = 192;

export function rawSampleCutoff(nowMs = Date.now()): Date {
  return new Date(nowMs - RAW_SAMPLE_RETENTION_HOURS * 60 * 60 * 1000);
}

export function presenceCutoff(nowMs = Date.now()): Date {
  return new Date(nowMs - PRESENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
export const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
export const POLLER_LEASE_TTL_SEC = 45;
/** Poller may pick a server with no lastPollAt only after persist left lastSeenAt this old. */
export const UNCLAIMED_PERSIST_SEC = 180;
export const ICMP_PING_DEADLINE_SEC = 2;
export const ICMP_PROCESS_TIMEOUT_MS = 3_000;
export const ICMP_DNS_CACHE_TTL_MS = 90_000;
