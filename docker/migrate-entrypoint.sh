#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[migrate] DATABASE_URL is required" >&2
  exit 1
fi

echo "[migrate] prisma migrate deploy"
npx prisma migrate deploy

PSQL_URL="${DATABASE_URL%%\?*}"

echo "[migrate] prune raw samples older than 48h (per peer/server, indexed)"
psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r RECORD;
  cutoff TIMESTAMP := NOW() - INTERVAL '48 hours';
BEGIN
  FOR r IN SELECT id FROM peer LOOP
    DELETE FROM peer_sample WHERE "peerId" = r.id AND "capturedAt" < cutoff;
  END LOOP;
  FOR r IN SELECT id FROM server LOOP
    DELETE FROM server_sample WHERE "serverId" = r.id AND "capturedAt" < cutoff;
  END LOOP;
END $$;
SQL

echo "[migrate] vacuum raw sample tables"
if ! psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c 'VACUUM (FULL, ANALYZE) peer_sample;' \
  || ! psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c 'VACUUM (FULL, ANALYZE) server_sample;'; then
  echo "[migrate] VACUUM FULL failed (often low disk); falling back to VACUUM ANALYZE" >&2
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c 'VACUUM (ANALYZE) peer_sample;'
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c 'VACUUM (ANALYZE) server_sample;'
fi

echo "[migrate] backfill last sample and sparkline when empty"
psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE peer AS p
SET
  "lastCapturedAt" = s."capturedAt",
  "lastRxBytes" = s."rxBytes",
  "lastTxBytes" = s."txBytes",
  "lastRxDelta" = s."rxDelta",
  "lastTxDelta" = s."txDelta",
  "lastHandshakeUnix" = s."handshakeUnix",
  "lastOnline" = s.online
FROM (
  SELECT DISTINCT ON ("peerId")
    "peerId",
    "capturedAt",
    "rxBytes",
    "txBytes",
    "rxDelta",
    "txDelta",
    "handshakeUnix",
    online
  FROM peer_sample
  ORDER BY "peerId", "capturedAt" DESC
) s
WHERE p.id = s."peerId"
  AND p."lastCapturedAt" IS NULL;

UPDATE peer AS p
SET sparkline = sub.spark
FROM (
  SELECT
    t."peerId",
    jsonb_agg(t.val ORDER BY t.rn DESC) AS spark
  FROM (
    SELECT
      "peerId",
      (("rxDelta" + "txDelta")::double precision) AS val,
      row_number() OVER (PARTITION BY "peerId" ORDER BY "capturedAt" DESC) AS rn
    FROM peer_sample
  ) t
  WHERE t.rn <= 192
  GROUP BY t."peerId"
) sub
WHERE p.id = sub."peerId"
  AND p.sparkline IS NULL;
SQL

echo "[migrate] done"
