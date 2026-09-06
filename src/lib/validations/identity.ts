import { z } from "zod";

export const sshAuthSchema = z
  .object({
    username: z.string().min(1, "Укажите SSH-пользователя").max(64),
    authMethod: z.enum(["PASSWORD", "PRIVATE_KEY", "PRIVATE_KEY_WITH_PASSPHRASE"]),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.authMethod === "PASSWORD" && !value.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Укажите пароль" });
    }
    if (value.authMethod !== "PASSWORD" && !value.privateKey) {
      ctx.addIssue({ code: "custom", path: ["privateKey"], message: "Укажите закрытый ключ" });
    }
    if (value.authMethod === "PRIVATE_KEY_WITH_PASSPHRASE" && !value.passphrase) {
      ctx.addIssue({ code: "custom", path: ["passphrase"], message: "Укажите пароль ключа" });
    }
  });

export const sshAuthUpdateSchema = z
  .object({
    username: z.string().min(1, "Укажите SSH-пользователя").max(64),
    authMethod: z.enum(["PASSWORD", "PRIVATE_KEY", "PRIVATE_KEY_WITH_PASSPHRASE"]),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasSecret = Boolean(value.password || value.privateKey);
    if (!hasSecret) {
      return;
    }
    if (value.authMethod === "PASSWORD" && !value.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Укажите пароль" });
    }
    if (value.authMethod !== "PASSWORD" && !value.privateKey) {
      ctx.addIssue({ code: "custom", path: ["privateKey"], message: "Укажите закрытый ключ" });
    }
    if (value.authMethod === "PRIVATE_KEY_WITH_PASSPHRASE" && !value.passphrase) {
      ctx.addIssue({ code: "custom", path: ["passphrase"], message: "Укажите пароль ключа" });
    }
  });

export type SshAuthInput = z.infer<typeof sshAuthSchema>;
export type SshAuthUpdateInput = z.infer<typeof sshAuthUpdateSchema>;

export function sshUpdateRequiresSecret(
  storedMethod: string,
  nextMethod: string,
  hasNewSecret: boolean,
): boolean {
  return !hasNewSecret && storedMethod !== nextMethod;
}

export function parseSshAuthFromFormData(formData: FormData, mode: "create" | "update") {
  const payload = {
    username: formData.get("username"),
    authMethod: formData.get("authMethod"),
    password: formData.get("password") || undefined,
    privateKey: formData.get("privateKey") || undefined,
    passphrase: formData.get("passphrase") || undefined,
  };
  return mode === "create" ? sshAuthSchema.safeParse(payload) : sshAuthUpdateSchema.safeParse(payload);
}
