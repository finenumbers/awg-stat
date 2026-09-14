-- AlterTable
ALTER TABLE "peer" ADD COLUMN "lastCapturedAt" TIMESTAMP(3);
ALTER TABLE "peer" ADD COLUMN "lastRxBytes" BIGINT;
ALTER TABLE "peer" ADD COLUMN "lastTxBytes" BIGINT;
ALTER TABLE "peer" ADD COLUMN "lastRxDelta" BIGINT;
ALTER TABLE "peer" ADD COLUMN "lastTxDelta" BIGINT;
ALTER TABLE "peer" ADD COLUMN "lastHandshakeUnix" BIGINT;
ALTER TABLE "peer" ADD COLUMN "lastOnline" BOOLEAN;
ALTER TABLE "peer" ADD COLUMN "sparkline" JSONB;
