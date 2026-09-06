export function shouldRunInProcessPoller(): boolean {
  if (process.env.GATE_RUN_POLLER === "1") {
    return true;
  }
  if (process.env.GATE_RUN_POLLER === "0") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}
