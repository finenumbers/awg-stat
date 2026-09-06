-- AlterTable
ALTER TABLE "peer" ADD COLUMN "endpointCountryName" TEXT;
ALTER TABLE "peer" ADD COLUMN "endpointCityName" TEXT;
ALTER TABLE "peer" ADD COLUMN "endpointOrganization" TEXT;

-- AlterTable
ALTER TABLE "peer_presence_event" ADD COLUMN "countryName" TEXT;
ALTER TABLE "peer_presence_event" ADD COLUMN "cityName" TEXT;
ALTER TABLE "peer_presence_event" ADD COLUMN "organization" TEXT;

-- CreateTable
CREATE TABLE "ip_geo_cache" (
    "ip" TEXT NOT NULL,
    "countryName" TEXT,
    "cityName" TEXT,
    "organization" TEXT,
    "ok" BOOLEAN NOT NULL,
    "lookedUpAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_geo_cache_pkey" PRIMARY KEY ("ip")
);
