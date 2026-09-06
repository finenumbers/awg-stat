import { db } from "@/lib/db";

export async function isSetupRequired(): Promise<boolean> {
  const count = await db.user.count();
  return count === 0;
}

export async function ensureAppSettings() {
  return db.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}
