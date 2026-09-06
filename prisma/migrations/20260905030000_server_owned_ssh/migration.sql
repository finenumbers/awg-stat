-- AlterTable
ALTER TABLE "server" ADD COLUMN "sshUsername" TEXT;
ALTER TABLE "server" ADD COLUMN "sshAuthMethod" "AuthMethod";

UPDATE "server" AS s
SET
  "sshUsername" = i."username",
  "sshAuthMethod" = i."authMethod"
FROM "ssh_identity" AS i
WHERE i."id" = s."identityId";

UPDATE "server"
SET
  "sshUsername" = COALESCE("sshUsername", 'root'),
  "sshAuthMethod" = COALESCE("sshAuthMethod", 'PASSWORD');

ALTER TABLE "server" ALTER COLUMN "sshUsername" SET NOT NULL;
ALTER TABLE "server" ALTER COLUMN "sshAuthMethod" SET NOT NULL;

-- CreateTable
CREATE TABLE "server_credential" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "server_credential_pkey" PRIMARY KEY ("id")
);

INSERT INTO "server_credential" (
  "id",
  "serverId",
  "encryptedData",
  "iv",
  "authTag",
  "keyVersion",
  "createdAt",
  "updatedAt"
)
SELECT
  'sc_' || s."id",
  s."id",
  c."encryptedData",
  c."iv",
  c."authTag",
  c."keyVersion",
  c."createdAt",
  c."updatedAt"
FROM "server" AS s
JOIN "ssh_identity_credential" AS c ON c."identityId" = s."identityId";

CREATE UNIQUE INDEX "server_credential_serverId_key" ON "server_credential"("serverId");

ALTER TABLE "server_credential"
  ADD CONSTRAINT "server_credential_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "server" DROP CONSTRAINT "server_identityId_fkey";
DROP INDEX "server_host_port_identityId_key";
ALTER TABLE "server" DROP COLUMN "identityId";
CREATE UNIQUE INDEX "server_host_port_key" ON "server"("host", "port");

ALTER TABLE "ssh_identity_credential" DROP CONSTRAINT "ssh_identity_credential_identityId_fkey";
DROP TABLE "ssh_identity_credential";
DROP TABLE "ssh_identity";
