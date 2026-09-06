import { db } from "@/lib/db";
import { ONLINE_THRESHOLD_SEC, POLL_INTERVAL_SEC, RAW_RETENTION_DAYS } from "@/server/poll-defaults";

export async function isSetupRequired(): Promise<boolean> {
  const count = await db.user.count();
  return count === 0;
}

export async function ensureAppSettings() {
  const settings = await db.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      pollIntervalSec: POLL_INTERVAL_SEC,
      onlineThresholdSec: ONLINE_THRESHOLD_SEC,
      rawRetentionDays: RAW_RETENTION_DAYS,
    },
  });

  if (
    settings.pollIntervalSec === POLL_INTERVAL_SEC &&
    settings.onlineThresholdSec === ONLINE_THRESHOLD_SEC &&
    settings.rawRetentionDays === RAW_RETENTION_DAYS
  ) {
    return settings;
  }

  return db.appSettings.update({
    where: { id: "default" },
    data: {
      pollIntervalSec: POLL_INTERVAL_SEC,
      onlineThresholdSec: ONLINE_THRESHOLD_SEC,
      rawRetentionDays: RAW_RETENTION_DAYS,
    },
  });
}
