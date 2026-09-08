-- AlterTable
ALTER TABLE "server" ADD COLUMN "lastIcmpRttMs" INTEGER;
ALTER TABLE "server" ADD COLUMN "lastIcmpAt" TIMESTAMP(3);

-- DropForeignKey
ALTER TABLE "server_latency_sample" DROP CONSTRAINT "server_latency_sample_serverId_fkey";

-- DropTable
DROP TABLE "server_latency_sample";
