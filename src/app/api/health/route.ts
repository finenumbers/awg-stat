import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const [lease, latest] = await Promise.all([
    db.pollerLease.findUnique({ where: { id: "default" } }),
    db.server.aggregate({
      _max: { lastPollAt: true },
    }),
  ]);
  const lastPollAt = latest._max.lastPollAt;
  const ownsLock = Boolean(lease?.ownerId && lease.expiresAt.getTime() > Date.now());

  return NextResponse.json({
    ok: true,
    pollerStarted: ownsLock,
    pollerOwnsLock: ownsLock,
    lastPollAt: lastPollAt?.toISOString() ?? null,
    lastPollAgeSec: lastPollAt ? Math.floor((Date.now() - lastPollAt.getTime()) / 1000) : null,
  });
}
