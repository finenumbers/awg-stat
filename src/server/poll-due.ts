import { POLL_INTERVAL_SEC, UNCLAIMED_PERSIST_SEC } from "@/server/poll-defaults";

export function isServerPollDue(input: {
  lastPollAt?: Date | null;
  instanceLastSeenAt?: Date | null;
  nowMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  if (input.lastPollAt) {
    return now - input.lastPollAt.getTime() >= POLL_INTERVAL_SEC * 1000;
  }
  if (input.instanceLastSeenAt) {
    return now - input.instanceLastSeenAt.getTime() >= UNCLAIMED_PERSIST_SEC * 1000;
  }
  return false;
}
