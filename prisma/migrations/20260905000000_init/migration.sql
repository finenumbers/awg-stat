-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'PRIVATE_KEY', 'PRIVATE_KEY_WITH_PASSPHRASE');

-- CreateEnum
CREATE TYPE "DockerAccess" AS ENUM ('DOCKER', 'SUDO_N_DOCKER');

-- CreateEnum
CREATE TYPE "AwgVersion" AS ENUM ('V2', 'V31', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PeerStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'SETUP_COMPLETED',
  'LOGIN',
  'LOGOUT',
  'IDENTITY_CREATED',
  'IDENTITY_UPDATED',
  'IDENTITY_DELETED',
  'SERVER_CREATED',
  'SERVER_UPDATED',
  'SERVER_DELETED',
  'SETTINGS_UPDATED',
  'PEER_ALIAS_UPDATED',
  'POLL_FAILED'
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 60,
    "onlineThresholdSec" INTEGER NOT NULL DEFAULT 180,
    "rawRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "hourlyRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssh_identity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "authMethod" "AuthMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ssh_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssh_identity_credential" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ssh_identity_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "identityId" TEXT NOT NULL,
    "sshHostKeyFingerprint" TEXT,
    "sshHostKeyVerified" BOOLEAN NOT NULL DEFAULT false,
    "dockerAccess" "DockerAccess" NOT NULL DEFAULT 'DOCKER',
    "pollIntervalSec" INTEGER,
    "lastPollAt" TIMESTAMP(3),
    "lastPollError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_instance" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL DEFAULT 'awg0',
    "awgVersion" "AwgVersion" NOT NULL DEFAULT 'UNKNOWN',
    "listenPort" INTEGER,
    "serverPublicKey" TEXT,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vpn_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer" (
    "id" TEXT NOT NULL,
    "vpnInstanceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "vpnName" TEXT,
    "localAlias" TEXT,
    "allowedIps" TEXT,
    "endpoint" TEXT,
    "status" "PeerStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "peer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_sample" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rxBytes" BIGINT NOT NULL,
    "txBytes" BIGINT NOT NULL,
    "rxDelta" BIGINT NOT NULL,
    "txDelta" BIGINT NOT NULL,
    "handshakeUnix" BIGINT NOT NULL,
    "online" BOOLEAN NOT NULL,
    CONSTRAINT "peer_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_hourly_sample" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "rxDelta" BIGINT NOT NULL DEFAULT 0,
    "txDelta" BIGINT NOT NULL DEFAULT 0,
    "onlineSecs" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "peer_hourly_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_sample" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "running" BOOLEAN NOT NULL,
    "peerCount" INTEGER NOT NULL,
    "onlineCount" INTEGER NOT NULL,
    "rxDelta" BIGINT NOT NULL,
    "txDelta" BIGINT NOT NULL,
    CONSTRAINT "server_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE UNIQUE INDEX "ssh_identity_name_key" ON "ssh_identity"("name");
CREATE UNIQUE INDEX "ssh_identity_credential_identityId_key" ON "ssh_identity_credential"("identityId");
CREATE UNIQUE INDEX "server_host_port_identityId_key" ON "server"("host", "port", "identityId");
CREATE UNIQUE INDEX "vpn_instance_serverId_key" ON "vpn_instance"("serverId");
CREATE UNIQUE INDEX "peer_vpnInstanceId_publicKey_key" ON "peer"("vpnInstanceId", "publicKey");
CREATE INDEX "peer_vpnInstanceId_status_idx" ON "peer"("vpnInstanceId", "status");
CREATE INDEX "peer_sample_peerId_capturedAt_idx" ON "peer_sample"("peerId", "capturedAt" DESC);
CREATE UNIQUE INDEX "peer_hourly_sample_peerId_hourStart_key" ON "peer_hourly_sample"("peerId", "hourStart");
CREATE INDEX "peer_hourly_sample_peerId_hourStart_idx" ON "peer_hourly_sample"("peerId", "hourStart" DESC);
CREATE INDEX "server_sample_serverId_capturedAt_idx" ON "server_sample"("serverId", "capturedAt" DESC);
CREATE INDEX "audit_event_createdAt_idx" ON "audit_event"("createdAt" DESC);

ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ssh_identity_credential" ADD CONSTRAINT "ssh_identity_credential_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ssh_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "server" ADD CONSTRAINT "server_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ssh_identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vpn_instance" ADD CONSTRAINT "vpn_instance_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peer" ADD CONSTRAINT "peer_vpnInstanceId_fkey" FOREIGN KEY ("vpnInstanceId") REFERENCES "vpn_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peer_sample" ADD CONSTRAINT "peer_sample_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "peer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peer_hourly_sample" ADD CONSTRAINT "peer_hourly_sample_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "peer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "server_sample" ADD CONSTRAINT "server_sample_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
