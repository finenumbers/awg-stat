-- Detached hourly rows keep a removed peer's bytes on the server chart.
-- The unique (peerId, hourStart) index stays NULLS DISTINCT so two detached peers can share an hour.

ALTER TABLE "peer_hourly_sample" ADD COLUMN "serverId" TEXT;

UPDATE "peer_hourly_sample" AS h
SET "serverId" = v."serverId"
FROM "peer" AS p
JOIN "vpn_instance" AS v ON v.id = p."vpnInstanceId"
WHERE h."peerId" = p.id
  AND h."serverId" IS NULL;

ALTER TABLE "peer_hourly_sample" ALTER COLUMN "serverId" SET NOT NULL;

ALTER TABLE "peer_hourly_sample" DROP CONSTRAINT "peer_hourly_sample_peerId_fkey";

ALTER TABLE "peer_hourly_sample" ALTER COLUMN "peerId" DROP NOT NULL;

ALTER TABLE "peer_hourly_sample"
  ADD CONSTRAINT "peer_hourly_sample_peerId_fkey"
  FOREIGN KEY ("peerId") REFERENCES "peer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "peer_hourly_sample"
  ADD CONSTRAINT "peer_hourly_sample_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "server"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "peer_hourly_sample_serverId_hourStart_idx"
  ON "peer_hourly_sample"("serverId", "hourStart" DESC);
