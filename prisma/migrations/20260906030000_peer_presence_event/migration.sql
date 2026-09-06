-- CreateEnum
CREATE TYPE "PeerPresenceEventKind" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "peer_presence_event" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "kind" "PeerPresenceEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "endpoint" TEXT,

    CONSTRAINT "peer_presence_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "peer_presence_event_peerId_occurredAt_key" ON "peer_presence_event"("peerId", "occurredAt");
CREATE INDEX "peer_presence_event_occurredAt_idx" ON "peer_presence_event"("occurredAt");

ALTER TABLE "peer_presence_event" ADD CONSTRAINT "peer_presence_event_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "peer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "peer_presence_event" ("id", "peerId", "kind", "occurredAt", "endpoint")
SELECT
  'bf_' || "peerId" || '_' || to_char("capturedAt", 'YYYYMMDDHH24MISSMS'),
  "peerId",
  CASE WHEN "online" THEN 'ONLINE'::"PeerPresenceEventKind" ELSE 'OFFLINE'::"PeerPresenceEventKind" END,
  "capturedAt",
  NULL
FROM (
  SELECT
    "peerId",
    "capturedAt",
    "online",
    LAG("online") OVER (PARTITION BY "peerId" ORDER BY "capturedAt") AS prev
  FROM "peer_sample"
) s
WHERE prev IS NOT NULL AND prev IS DISTINCT FROM "online"
ON CONFLICT ("peerId", "occurredAt") DO NOTHING;
