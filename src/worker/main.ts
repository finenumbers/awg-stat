import { startPoller, stopPoller } from "@/server/poller";

let exiting = false;

async function shutdown(signal: string) {
  if (exiting) {
    return;
  }
  exiting = true;
  console.info(`[poller] shutting down (${signal})`);
  const failsafe = setTimeout(() => {
    process.exit(1);
  }, 15_000);
  failsafe.unref();
  try {
    await stopPoller();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

startPoller().catch((error) => {
  console.error("[poller] fatal", error);
  process.exit(1);
});
