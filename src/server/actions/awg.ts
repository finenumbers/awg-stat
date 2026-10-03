"use server";

import { revalidatePath } from "next/cache";

import { AWG_CONF_MAX_BYTES } from "@/lib/awg/conf";
import { requireSession } from "@/lib/session";
import { deleteAwgClientConf, saveAwgClientConf } from "@/server/services/awg-client.service";
import type { ActionResult } from "@/types/action-result";

export async function saveAwgConfAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const conf = formData.get("conf");
  if (typeof conf !== "string" || !conf.trim()) {
    return { ok: false, error: "Вставьте конфиг из приложения AmneziaVPN" };
  }
  if (Buffer.byteLength(conf) > AWG_CONF_MAX_BYTES) {
    return { ok: false, error: "Файл конфига больше 16 КБ" };
  }
  try {
    await saveAwgClientConf(conf, session.user.id);
    revalidatePath("/awg");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить AmneziaWG" };
  }
}

export async function deleteAwgConfAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteAwgClientConf(session.user.id);
    revalidatePath("/awg");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось отключить AmneziaWG" };
  }
}
