import type { SshSession } from "@/lib/ssh/client";
import { SSH_RTT_COMMAND, SSH_RTT_TIMEOUT_MS } from "@/server/poll-defaults";

export async function measureSshRttMs(client: SshSession): Promise<number | null> {
  try {
    const started = Date.now();
    const result = await client.exec(SSH_RTT_COMMAND, SSH_RTT_TIMEOUT_MS);
    if (result.code !== 0) {
      return null;
    }
    return Math.round(Date.now() - started);
  } catch {
    return null;
  }
}
