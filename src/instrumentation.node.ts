import { shouldRunInProcessPoller } from "@/server/poller-mode";

export async function registerNode() {
  if (!shouldRunInProcessPoller()) {
    return;
  }
  const { startPoller } = await import("@/server/poller");
  await startPoller();
}
