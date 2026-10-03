-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AWG_CONFIG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'AWG_CONFIG_DELETED';

-- AlterTable
ALTER TABLE "server" ADD COLUMN "accessViaAwg" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "awg_client_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "configHash" TEXT NOT NULL,
    "endpointHost" TEXT NOT NULL,
    "endpointPort" INTEGER NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "peerPublicKey" TEXT NOT NULL,
    "allowedIps" TEXT NOT NULL,
    "dnsHost" TEXT,
    "applyError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "awg_client_config_pkey" PRIMARY KEY ("id")
);
