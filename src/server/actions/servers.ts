"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/session";
import { parseSshAuthFromFormData } from "@/lib/validations/identity";
import { serverSchema } from "@/lib/validations/server";
import { updateServerSsh } from "@/server/services/identity.service";
import { createAndOnboardServer, deleteServer } from "@/server/services/server.service";
import type { ActionResult } from "@/types/action-result";

function isDuplicateServerHostPort(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("host") && target.includes("port");
  }
  return typeof target === "string" && target.includes("host") && target.includes("port");
}

export async function createServerAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = serverSchema.safeParse({
    name: formData.get("name"),
    host: formData.get("host"),
    port: formData.get("port"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }
  const ssh = parseSshAuthFromFormData(formData, "create");
  if (!ssh.success) {
    return { ok: false, error: ssh.error.issues[0]?.message ?? "Проверьте SSH-доступ" };
  }
  try {
    const server = await createAndOnboardServer(parsed.data, ssh.data, session.user.id);
    revalidatePath("/");
    revalidatePath("/", "layout");
    revalidatePath("/peers");
    return { ok: true, data: { id: server.id } };
  } catch (error) {
    if (isDuplicateServerHostPort(error)) {
      return { ok: false, error: "Сервер с таким хостом и портом уже добавлен" };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось подключить сервер" };
  }
}

export async function updateServerSshAction(id: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const ssh = parseSshAuthFromFormData(formData, "update");
  if (!ssh.success) {
    return { ok: false, error: ssh.error.issues[0]?.message ?? "Проверьте SSH-доступ" };
  }
  try {
    await updateServerSsh(id, ssh.data, session.user.id);
    revalidatePath(`/servers/${id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить доступ" };
  }
}

export async function deleteServerAction(id: string): Promise<ActionResult<{ name: string }>> {
  const session = await requireSession();
  try {
    const result = await deleteServer(id, session.user.id);
    revalidatePath("/");
    revalidatePath("/", "layout");
    revalidatePath(`/servers/${id}`);
    revalidatePath("/peers");
    return { ok: true, data: { name: result.name } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось удалить" };
  }
}
