-- CreateTable
CREATE TABLE "server_latency_sample" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "icmpRttMs" INTEGER,
    "sshRttMs" INTEGER,

    CONSTRAINT "server_latency_sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_latency_sample_serverId_capturedAt_idx" ON "server_latency_sample"("serverId", "capturedAt" DESC);

-- AddForeignKey
ALTER TABLE "server_latency_sample" ADD CONSTRAINT "server_latency_sample_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
