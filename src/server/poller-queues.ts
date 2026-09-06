import PQueue from "p-queue";

import { getSshSessionRegistry } from "@/lib/ssh/session-registry";

const queues = new Map<string, PQueue>();

export function queueFor(serverId: string): PQueue {
  const existing = queues.get(serverId);
  if (existing) return existing;
  const queue = new PQueue({ concurrency: 1 });
  queues.set(serverId, queue);
  return queue;
}

export function pruneQueues(keepIds: Iterable<string>): void {
  const keep = new Set(keepIds);
  for (const serverId of [...queues.keys()]) {
    if (!keep.has(serverId)) {
      queues.get(serverId)?.clear();
      queues.delete(serverId);
    }
  }
}

export function releaseServerRuntime(serverId: string): void {
  getSshSessionRegistry().invalidate(serverId);
  queues.get(serverId)?.clear();
  queues.delete(serverId);
}

export function clearAllQueues(): void {
  for (const queue of queues.values()) {
    queue.clear();
  }
  queues.clear();
}
