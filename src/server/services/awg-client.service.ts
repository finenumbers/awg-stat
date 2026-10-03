import { AWG_HANDSHAKE_FRESH_SEC, hashAwgConf, normalizeAwgConf, parseAwgConf } from "@/lib/awg/conf";
import type { AwgNavState } from "@/lib/awg/nav-state";
import {
  applyAwgAgentConf,
  awgAgentConfigured,
  checkAwgTcp,
  clearAwgAgent,
  fetchAwgStatus,
  replaceAwgRoutes,
  type AwgStatus,
} from "@/lib/awg/agent-client";
import { decryptUtf8, encryptUtf8 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createAuditEvent } from "@/server/services/audit.service";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function getAwgNavState(): Promise<AwgNavState> {
  const row = await db.awgClientConfig.findUnique({
    where: { id: "default" },
    select: { applyError: true },
  });
  if (!row) {
    return "off";
  }
  const status = await fetchAwgStatus(500);
  if (!status) {
    return "unreachable";
  }
  if (row.applyError || status.applyError || !status.up) {
    return "down";
  }
  if (!status.handshakeAt || Date.now() / 1000 - status.handshakeAt > AWG_HANDSHAKE_FRESH_SEC) {
    return "idle";
  }
  return "up";
}

export async function getAwgClientView(): Promise<{
  configured: boolean;
  endpointHost: string | null;
  endpointPort: number | null;
  clientAddress: string | null;
  peerPublicKey: string | null;
  applyError: string | null;
  updatedAt: Date | null;
  status: AwgStatus | null;
}> {
  const row = await db.awgClientConfig.findUnique({ where: { id: "default" } });
  const status = row ? await fetchAwgStatus(1500) : null;
  if (!row) {
    return {
      configured: false,
      endpointHost: null,
      endpointPort: null,
      clientAddress: null,
      peerPublicKey: null,
      applyError: null,
      updatedAt: null,
      status,
    };
  }
  return {
    configured: true,
    endpointHost: row.endpointHost,
    endpointPort: row.endpointPort,
    clientAddress: row.clientAddress,
    peerPublicKey: row.peerPublicKey,
    applyError: row.applyError,
    updatedAt: row.updatedAt,
    status,
  };
}

export async function saveAwgClientConf(text: string, userId: string): Promise<void> {
  const normalized = normalizeAwgConf(text);
  const parsed = parseAwgConf(normalized);
  const configHash = hashAwgConf(normalized);
  const blob = encryptUtf8(normalized);
  const data = {
    ...blob,
    configHash,
    endpointHost: parsed.endpointHost,
    endpointPort: parsed.endpointPort,
    clientAddress: parsed.clientAddress,
    peerPublicKey: parsed.peerPublicKey,
    allowedIps: parsed.allowedIps.join(", "),
    dnsHost: parsed.dnsHost,
    applyError: null,
  };
  await db.awgClientConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  try {
    await applyAwgAgentConf(normalized);
  } catch (error) {
    const message = errorText(error, "Не удалось применить конфиг AmneziaWG");
    await db.awgClientConfig.update({ where: { id: "default" }, data: { applyError: message } });
    throw new Error(message);
  }
  await createAuditEvent({
    userId,
    action: "AWG_CONFIG_UPDATED",
    entityType: "awg",
    entityId: "default",
    metadata: { endpointHost: parsed.endpointHost, endpointPort: parsed.endpointPort, configHash },
  });
  await syncAwgRoutes();
}

export async function deleteAwgClientConf(userId: string): Promise<void> {
  const row = await db.awgClientConfig.findUnique({ where: { id: "default" }, select: { configHash: true } });
  if (!row) {
    return;
  }
  await db.awgClientConfig.delete({ where: { id: "default" } });
  await clearAwgAgent();
  await createAuditEvent({
    userId,
    action: "AWG_CONFIG_DELETED",
    entityType: "awg",
    entityId: "default",
    metadata: { configHash: row.configHash },
  });
}

export async function syncAwgRoutes(): Promise<void> {
  const row = await db.awgClientConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    await clearAwgAgent();
    return;
  }
  if (!awgAgentConfigured()) {
    throw new Error("Клиент AmneziaWG не настроен в окружении");
  }
  const current = await fetchAwgStatus(3_000);
  const alreadyApplied = current?.up === true && current.configHash === row.configHash && !current.applyError;
  try {
    if (!alreadyApplied) {
      await applyAwgAgentConf(decryptUtf8(row));
    }
  } catch (error) {
    const message = errorText(error, "Не удалось применить конфиг AmneziaWG");
    if (row.applyError !== message) {
      await db.awgClientConfig.update({ where: { id: "default" }, data: { applyError: message } });
    }
    throw new Error(message);
  }
  if (row.applyError) {
    await db.awgClientConfig.update({ where: { id: "default" }, data: { applyError: null } });
  }
  const servers = await db.server.findMany({
    where: { accessViaAwg: true, connection: "SSH" },
    select: { host: true },
  });
  await replaceAwgRoutes([...new Set(servers.map((server) => server.host))]);
}

export async function assertAwgTcp(host: string, port: number): Promise<void> {
  const row = await db.awgClientConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    throw new Error("Клиент AmneziaWG не настроен. Добавьте конфиг в разделе AmneziaWG");
  }
  const conf = decryptUtf8(row);
  try {
    await applyAwgAgentConf(conf);
  } catch (error) {
    throw new Error(errorText(error, "Туннель AmneziaWG не поднят"));
  }
  if (row.applyError) {
    await db.awgClientConfig.update({ where: { id: "default" }, data: { applyError: null } });
  }
  const status = await fetchAwgStatus(5_000);
  const fresh =
    status?.up === true &&
    status.handshakeAt !== null &&
    Date.now() / 1000 - status.handshakeAt <= AWG_HANDSHAKE_FRESH_SEC;
  if (!fresh) {
    throw new Error("Нет рукопожатия AmneziaWG. Дождитесь зелёного индикатора в разделе AmneziaWG");
  }
  await checkAwgTcp(host, port);
}
