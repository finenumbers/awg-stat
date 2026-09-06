import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Укажите корректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
});

export const setupSchema = loginSchema.extend({
  name: z.string().min(1, "Укажите имя").max(80),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
