import { z } from "zod";

import { isSafeProbeHost } from "@/lib/net/probe-host";

export const serverSchema = z.object({
  name: z.string().min(1, "Укажите название").max(80),
  host: z
    .string()
    .trim()
    .min(1, "Укажите хост")
    .max(253)
    .refine(isSafeProbeHost, "Укажите hostname или IP, без флагов и спецсимволов"),
  port: z.coerce.number().int().min(1).max(65535),
});

export type ServerInput = z.infer<typeof serverSchema>;
