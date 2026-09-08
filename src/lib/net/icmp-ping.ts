import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isSafeProbeHost } from "@/lib/net/probe-host";
import { ICMP_PING_DEADLINE_SEC, ICMP_PROCESS_TIMEOUT_MS } from "@/server/poll-defaults";

export type IcmpFailKind = "permission" | "missing" | "timeout" | "loss" | "dns" | "invalid-host" | "error";

export type IcmpAttempt =
  | { ok: true; rttMs: number }
  | { ok: false; kind: IcmpFailKind };

export function parsePingRttMs(stdout: string): number | null {
  const match = stdout.match(/time[=<]([\d.]+)\s*ms/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

export function pingArgsFor(platform: NodeJS.Platform, ip: string): string[] {
  if (platform === "darwin") {
    return ["-n", "-c", "1", "-W", String(ICMP_PING_DEADLINE_SEC * 1000), ip];
  }
  return ["-n", "-c", "1", "-W", String(ICMP_PING_DEADLINE_SEC), ip];
}

export async function resolveProbeAddress(host: string): Promise<string> {
  if (!isSafeProbeHost(host)) {
    throw Object.assign(new Error("invalid-host"), { kind: "invalid-host" as const });
  }
  if (isIP(host.trim())) {
    return host.trim();
  }
  const { address } = await lookup(host.trim());
  return address;
}

export function classifyIcmpFailure(input: {
  spawnCode?: string;
  stderr: string;
  timedOut: boolean;
  rttMs: number | null;
}): IcmpFailKind {
  if (input.spawnCode === "ENOENT") {
    return "missing";
  }
  if (input.spawnCode === "EPERM" || input.spawnCode === "EACCES") {
    return "permission";
  }
  const stderr = input.stderr.toLowerCase();
  if (/not permitted|operation not permitted|permission denied|cannot.*socket/.test(stderr)) {
    return "permission";
  }
  if (input.timedOut) {
    return "timeout";
  }
  if (input.rttMs == null) {
    return "loss";
  }
  return "error";
}

export function isIcmpPermanentlyUnavailable(kind: IcmpFailKind): boolean {
  return kind === "permission" || kind === "missing";
}

export function pingAddress(ip: string, options?: { platform?: NodeJS.Platform; timeoutMs?: number }): Promise<IcmpAttempt> {
  if (!isIP(ip)) {
    return Promise.resolve({ ok: false, kind: "invalid-host" });
  }

  const platform = options?.platform ?? process.platform;
  const timeoutMs = options?.timeoutMs ?? ICMP_PROCESS_TIMEOUT_MS;
  const args = pingArgsFor(platform, ip);

  return new Promise((resolve) => {
    const child = spawn("ping", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const maxBytes = 8_192;

    const finish = (result: IcmpAttempt) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < maxBytes) {
        stdout += chunk.toString();
        if (stdout.length > maxBytes) {
          stdout = stdout.slice(0, maxBytes);
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxBytes) {
        stderr += chunk.toString();
        if (stderr.length > maxBytes) {
          stderr = stderr.slice(0, maxBytes);
        }
      }
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ ok: false, kind: classifyIcmpFailure({ spawnCode: error.code, stderr, timedOut, rttMs: null }) });
    });

    child.on("close", () => {
      const rttMs = parsePingRttMs(stdout);
      if (rttMs != null && !timedOut) {
        finish({ ok: true, rttMs });
        return;
      }
      finish({
        ok: false,
        kind: classifyIcmpFailure({ stderr, timedOut, rttMs }),
      });
    });
  });
}
