-- AlterEnum
ALTER TYPE "AwgVersion" ADD VALUE 'V30';

-- AlterTable
ALTER TABLE "vpn_instance" ADD COLUMN "hostListenPort" INTEGER;
ALTER TABLE "vpn_instance" ADD COLUMN "containerStatus" TEXT;
ALTER TABLE "vpn_instance" ADD COLUMN "containerStartedAt" TIMESTAMP(3);
ALTER TABLE "vpn_instance" ADD COLUMN "containerRestartCount" INTEGER;
