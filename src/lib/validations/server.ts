import { z } from "zod";

export const serverSchema = z.object({
  name: z.string().min(1, "Укажите название").max(80),
  host: z.string().min(1, "Укажите хост").max(253),
  port: z.coerce.number().int().min(1).max(65535),
  pollIntervalSec: z.coerce.number().int().min(15).max(300).optional(),
});

export type ServerInput = z.infer<typeof serverSchema>;
