-- CreateEnum
CREATE TYPE "BlockCheckStatus" AS ENUM ('unrestricted', 'blocked');

-- AlterTable
ALTER TABLE "server" ADD COLUMN "lastBlockStatus" "BlockCheckStatus",
ADD COLUMN "lastBlockCheckedAt" TIMESTAMP(3);
