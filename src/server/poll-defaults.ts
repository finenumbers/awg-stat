export const POLL_INTERVAL_SEC = 15;
export const ONLINE_THRESHOLD_SEC = 180;
export const SAMPLE_FRESH_SEC = 120;
/** UI-only: bytes in one 15s poll that we treat as keepalive/handshake, not user activity. */
export const PROTOCOL_TRAFFIC_MAX_BYTES = 4096;
export const POLL_DEADLINE_MS = 120_000;
export const RAW_RETENTION_DAYS = 30;
export const SPARKLINE_SAMPLES = 192;
export const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
export const POLLER_LEASE_TTL_SEC = 45;
export const SSH_RTT_TIMEOUT_MS = 3_000;
export const SSH_RTT_COMMAND = "true";
export const ICMP_PING_DEADLINE_SEC = 2;
export const ICMP_PROCESS_TIMEOUT_MS = 3_000;
export const ICMP_FAILURES_BEFORE_BACKOFF = 3;
export const ICMP_BACKOFF_MS = 5 * 60 * 1000;
export const ICMP_DNS_CACHE_TTL_MS = 90_000;
