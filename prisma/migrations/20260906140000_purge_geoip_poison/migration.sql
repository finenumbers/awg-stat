DELETE FROM "ip_geo_cache"
WHERE ok = false
   OR (
     ok = true
     AND "countryName" IS NULL
     AND "cityName" IS NULL
     AND "organization" IS NULL
   );
