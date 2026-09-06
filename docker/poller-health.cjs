const { PrismaClient } = require("@prisma/client");

const FRESH_SEC = 180;

async function main() {
  const db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    const servers = await db.server.count();
    if (servers === 0) {
      process.exit(0);
    }
    const latest = await db.server.aggregate({ _max: { lastPollAt: true } });
    const lastPollAt = latest._max.lastPollAt;
    if (!lastPollAt) {
      process.exit(0);
    }
    const ageSec = (Date.now() - lastPollAt.getTime()) / 1000;
    process.exit(ageSec <= FRESH_SEC ? 0 : 1);
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  process.exit(1);
});
