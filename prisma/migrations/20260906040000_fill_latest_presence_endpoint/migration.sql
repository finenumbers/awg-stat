UPDATE "peer_presence_event" AS e
SET endpoint = p.endpoint
FROM "peer" AS p
WHERE e."peerId" = p.id
  AND e.endpoint IS NULL
  AND p.endpoint IS NOT NULL
  AND e.id IN (
    SELECT DISTINCT ON ("peerId") id
    FROM "peer_presence_event"
    ORDER BY "peerId", "occurredAt" DESC
  );
