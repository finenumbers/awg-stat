-- CreateEnum
CREATE TYPE "ServerConnection" AS ENUM ('SSH', 'LOCAL_DOCKER');

-- AlterTable
ALTER TABLE "server" ADD COLUMN "connection" "ServerConnection" NOT NULL DEFAULT 'SSH';
ALTER TABLE "server" ALTER COLUMN "sshUsername" DROP NOT NULL;
ALTER TABLE "server" ALTER COLUMN "sshAuthMethod" DROP NOT NULL;

-- One local AmneziaWG per Gate install. Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "server_one_local_docker" ON "server" ((true)) WHERE "connection" = 'LOCAL_DOCKER';
