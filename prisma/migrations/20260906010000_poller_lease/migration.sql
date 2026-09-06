-- CreateTable
CREATE TABLE "poller_lease" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poller_lease_pkey" PRIMARY KEY ("id")
);

INSERT INTO "poller_lease" ("id", "owner_id", "expires_at", "epoch")
VALUES ('default', NULL, TIMESTAMP '1970-01-01', 0);
