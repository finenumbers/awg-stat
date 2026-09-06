import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPollerState } from "@/server/poller";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const { started, ownsLock } = getPollerState();
  const latest = await db.server.aggregate({
    _max: { lastPollAt: true },
  });
  const lastPollAt = latest._max.lastPollAt;

  return NextResponse.json({
    ok: true,
    pollerStarted: started,
    pollerOwnsLock: ownsLock,
    lastPollAt: lastPollAt?.toISOString() ?? null,
    lastPollAgeSec: lastPollAt ? Math.floor((Date.now() - lastPollAt.getTime()) / 1000) : null,
  });
}
