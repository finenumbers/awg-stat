import { isIP } from "node:net";

import { z } from "zod";

import { isSafeProbeHost } from "@/lib/net/probe-host";

const serverName = z.string().min(1, "Укажите название").max(80);
const serverHost = z
  .string()
  .trim()
  .min(1, "Укажите хост")
  .max(253)
  .refine(isSafeProbeHost, "Укажите hostname или IP, без флагов и спецсимволов");

const accessViaAwg = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
);

export const serverSchema = z.object({
  name: serverName,
  host: serverHost,
  port: z.coerce.number().int().min(1).max(65535),
  accessViaAwg,
});

export const serverAccessSchema = z.object({
  host: serverHost,
  port: z.coerce.number().int().min(1).max(65535),
  accessViaAwg,
});

export function isLoopbackProbeHost(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value === "localhost.localdomain") {
    return true;
  }
  const kind = isIP(value);
  if (kind === 4) {
    return Number(value.split(".")[0]) === 127;
  }
  if (kind === 6) {
    return value === "::1" || value === "0:0:0:0:0:0:0:1" || value.startsWith("::ffff:127.");
  }
  return false;
}

export const localServerSchema = z.object({
  name: serverName,
  host: serverHost.refine((host) => !isLoopbackProbeHost(host), "Укажите публичный адрес сервера, не localhost"),
});

export type ServerInput = z.infer<typeof serverSchema>;
export type ServerAccessInput = z.infer<typeof serverAccessSchema>;
export type LocalServerInput = z.infer<typeof localServerSchema>;
