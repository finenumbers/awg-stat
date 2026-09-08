import { Prisma, type AwgVersion } from "@prisma/client";

import {
  awgPollCommand,
  dockerInspectCommand,
  dockerPsAllCommand,
  dockerPsCommand,
  type DockerPrefix,
} from "@/lib/amnezia/commands";
import {
  computeDelta,
  parseDockerInspect,
  parseDockerPs,
  parsePollOutput,
  selectTargetContainer,
  type ParsedDockerInspect,
  type ParsedPoll,
} from "@/lib/amnezia/parse";
import { db } from "@/lib/db";
import { getIcmpProbeController } from "@/lib/net/icmp-controller";
import { withDeadline, withSshConnection, type SshClient, type SshConnectionConfig, type SshSession } from "@/lib/ssh/client";
import { canCommitPoll, shouldRetrySshPoll } from "@/lib/ssh/errors";
import { getSshSessionRegistry } from "@/lib/ssh/session-registry";
import { isPeerOnline, presenceTransition, previousPresenceOnline } from "@/lib/presence";
import { POLL_DEADLINE_MS, POLL_INTERVAL_SEC, RAW_RETENTION_DAYS } from "@/server/poll-defaults";
import { getPollerEpoch, isPollerStopping } from "@/server/poller-runtime";
import { displayPeerEndpoint } from "@/lib/utils";
import { getServerSecret } from "@/server/services/identity.service";
import { enrichServerPeerEndpoints } from "@/server/services/geoip.service";
import { ensureAppSettings } from "@/server/services/setup.service";

export class CollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectorError";
  }
}

function isGoneAfterDelete(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2003");
}

function endpointHost(endpoint: string | null | undefined): string | null {
  return displayPeerEndpoint(endpoint)?.host ?? null;
}

function snapshotGeo(
  source:
    | {
        endpoint?: string | null;
        endpointCountryName?: string | null;
        endpointCityName?: string | null;
        endpointOrganization?: string | null;
      }
    | null
    | undefined,
  endpoint: string | null | undefined,
) {
  if (!source || endpointHost(source.endpoint) !== endpointHost(endpoint)) {
    return { countryName: null, cityName: null, organization: null };
  }
  return {
    countryName: source.endpointCountryName ?? null,
    cityName: source.endpointCityName ?? null,
    organization: source.endpointOrganization ?? null,
  };
}

async function sshConfigForServer(serverId: string): Promise<SshConnectionConfig & { expectedHostKeyFingerprint?: string | null }> {
  const server = await db.server.findUnique({
    where: { id: serverId },
  });
  if (!server) {
    throw new CollectorError("Сервер не найден");
  }
  const secret = await getServerSecret(server.id);
  return {
    host: server.host,
    port: server.port,
    username: server.sshUsername,
    password: secret.password,
    privateKey: secret.privateKey,
    passphrase: secret.passphrase,
    expectedHostKeyFingerprint: server.sshHostKeyVerified ? server.sshHostKeyFingerprint : null,
  };
}

async function detectDockerPrefix(client: SshClient): Promise<DockerPrefix> {
  const direct = await client.exec(dockerPsCommand("docker"));
  if (direct.code === 0) {
    return "docker";
  }

  const sudoPs = await client.exec(dockerPsCommand("sudo -n docker"));
  if (sudoPs.code === 0) {
    return "sudo -n docker";
  }

  const combined = `${direct.stderr}\n${sudoPs.stderr}`.toLowerCase();
  if (combined.includes("password is required") || combined.includes("a password is required")) {
    throw new CollectorError("Для docker нужен passwordless sudo (sudo -n). Пароль в sudo не передаём");
  }
  if (combined.includes("command not found") || combined.includes("not found")) {
    throw new CollectorError("На хосте не найден Docker. Gate подключается только к уже установленному AmneziaVPN");
  }
  throw new CollectorError("Нет доступа к docker. Нужен root или sudo -n docker");
}

function mapVersion(hint: ParsedPoll["awgVersion"]): AwgVersion {
  if (hint === "V31") return "V31";
  if (hint === "V30") return "V30";
  if (hint === "V2") return "V2";
  return "UNKNOWN";
}

export async function onboardExistingServer(serverId: string, userId: string | null) {
  const config = await sshConfigForServer(serverId);
  const { result, hostKeyFingerprint } = await withSshConnection(config, async (client) => {
    const prefix = await detectDockerPrefix(client);
    const listed = await client.exec(dockerPsAllCommand(prefix));
    if (listed.code !== 0) {
      throw new CollectorError("Не удалось получить список контейнеров Docker");
    }
    const rows = parseDockerPs(listed.stdout);
    const selected = selectTargetContainer(rows);
    if (!selected.target) {
      if (selected.stoppedTarget) {
        throw new CollectorError(
          "Контейнер amnezia-awg2 найден, но не запущен. Gate его не стартует — поднимите VPN в приложении AmneziaVPN",
        );
      }
      throw new CollectorError("На хосте не найдена работающая установка AmneziaWG (amnezia-awg2)");
    }

    const inspectRaw = await client.exec(dockerInspectCommand(prefix, selected.target.name));
    const inspect = parseDockerInspect(inspectRaw.stdout);
    if (!inspect.running) {
      throw new CollectorError("Контейнер amnezia-awg2 не запущен. Gate его не стартует");
    }

    const poll = await client.exec(awgPollCommand(prefix, selected.target.name));
    if (poll.code !== 0 && !poll.stdout.includes("---GATE:transfer---")) {
      throw new CollectorError("Не удалось прочитать состояние AmneziaWG (только чтение awg show)");
    }
    const parsed = parsePollOutput(poll.stdout);
    if (!parsed.transferOk || !parsed.handshakeOk) {
      throw new CollectorError("Контейнер не отдал селекторы transfer / latest-handshakes. Цифры не выдумываем");
    }

    return { prefix, parsed, inspect, containerName: selected.target.name };
  });

  await db.server.update({
    where: { id: serverId },
    data: {
      dockerAccess: result.prefix === "docker" ? "DOCKER" : "SUDO_N_DOCKER",
      sshHostKeyFingerprint: hostKeyFingerprint ?? undefined,
      sshHostKeyVerified: Boolean(hostKeyFingerprint),
      lastPollError: null,
    },
  });

  await persistPoll(serverId, result.containerName, result.parsed, result.inspect);
  await db.server.update({
    where: { id: serverId },
    data: { lastPollAt: new Date(), lastPollError: null },
  });
  await enrichServerPeerEndpoints(serverId);
  void userId;
}

function canWritePoll(startedEpoch: number | null): boolean {
  return canCommitPoll({
    stopping: isPollerStopping(),
    startedEpoch,
    currentEpoch: getPollerEpoch(),
  });
}

async function readVpnState(client: SshSession, prefix: DockerPrefix, containerName: string) {
  const inspectRaw = await client.exec(dockerInspectCommand(prefix, containerName));
  const inspect = parseDockerInspect(inspectRaw.stdout);
  if (!inspect.running) {
    throw new CollectorError("Контейнер amnezia-awg2 не запущен");
  }
  const poll = await client.exec(awgPollCommand(prefix, containerName));
  const parsed = parsePollOutput(poll.stdout);
  if (!parsed.transferOk || !parsed.handshakeOk) {
    throw new CollectorError("Нет сырых счётчиков transfer / latest-handshakes");
  }
  return { parsed, inspect, containerName };
}

function icmpWriteFields(result: { rttMs: number | null } | null): {
  lastIcmpRttMs?: number | null;
  lastIcmpAt?: Date;
} {
  if (result == null) {
    return {};
  }
  return { lastIcmpRttMs: result.rttMs, lastIcmpAt: new Date() };
}

async function pollRemote(
  serverId: string,
  config: SshConnectionConfig,
  prefix: DockerPrefix,
  containerName: string,
  deadlineMs: number,
): Promise<{
  parsed: ParsedPoll;
  inspect: ParsedDockerInspect;
  containerName: string;
  hostKeyFingerprint: string | null;
}> {
  const registry = getSshSessionRegistry();
  const startedAt = Date.now();
  const remaining = () => Math.max(0, deadlineMs - (Date.now() - startedAt));

  const attempt = async (alreadyRetried: boolean) => {
    try {
      const { client, hostKeyFingerprint } = await registry.acquire(serverId, config);
      const result = await withDeadline(readVpnState(client, prefix, containerName), remaining(), () => {
        registry.invalidate(serverId);
      });
      return { ...result, hostKeyFingerprint };
    } catch (error) {
      if (shouldRetrySshPoll(error, alreadyRetried)) {
        registry.invalidate(serverId);
        return attempt(true);
      }
      if (shouldRetrySshPoll(error, false)) {
        registry.invalidate(serverId);
      }
      throw error;
    }
  };

  return attempt(false);
}

export async function pollServer(serverId: string, options?: { deadlineMs?: number; epoch?: number | null }) {
  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { vpnInstance: true },
  });
  if (!server) {
    return;
  }
  const prefix: DockerPrefix = server.dockerAccess === "SUDO_N_DOCKER" ? "sudo -n docker" : "docker";
  const containerName = server.vpnInstance?.containerName ?? "amnezia-awg2";
  const deadlineMs = options?.deadlineMs ?? POLL_DEADLINE_MS;
  const startedEpoch = options?.epoch === undefined ? getPollerEpoch() : options.epoch;
  const icmpPromise = getIcmpProbeController()
    .probe(server.id, server.host)
    .catch(() => null);

  try {
    const config = await sshConfigForServer(serverId);
    const result = await pollRemote(serverId, config, prefix, containerName, deadlineMs);
    const icmpResult = await icmpPromise;
    if (!canWritePoll(startedEpoch)) {
      return;
    }

    if (result.hostKeyFingerprint && !server.sshHostKeyVerified) {
      await db.server.update({
        where: { id: serverId },
        data: { sshHostKeyFingerprint: result.hostKeyFingerprint, sshHostKeyVerified: true },
      });
    }

    await persistPoll(serverId, result.containerName, result.parsed, result.inspect);
    await db.server.update({
      where: { id: serverId },
      data: { lastPollAt: new Date(), lastPollError: null, ...icmpWriteFields(icmpResult) },
    });
    await enrichServerPeerEndpoints(serverId);
  } catch (error) {
    if (isGoneAfterDelete(error)) {
      return;
    }
    const stillThere = await db.server.findUnique({
      where: { id: serverId },
      select: { id: true },
    });
    if (!stillThere) {
      return;
    }
    const message = error instanceof Error ? error.message : "Ошибка опроса";
    console.error(`[collector] poll failed server=${serverId}: ${message}`);
    const icmpResult = await icmpPromise;
    if (canWritePoll(startedEpoch)) {
      await db.server.update({
        where: { id: serverId },
        data: { lastPollAt: new Date(), lastPollError: message, ...icmpWriteFields(icmpResult) },
      });
    }
    throw error;
  }
}

async function persistPoll(
  serverId: string,
  containerName: string,
  parsed: ParsedPoll,
  inspect: ParsedDockerInspect,
) {
  try {
    await persistPollUnlocked(serverId, containerName, parsed, inspect);
  } catch (error) {
    if (isGoneAfterDelete(error)) {
      return;
    }
    throw error;
  }
}

async function persistPollUnlocked(
  serverId: string,
  containerName: string,
  parsed: ParsedPoll,
  inspect: ParsedDockerInspect,
) {
  const now = new Date();
  const running = inspect.running;

  const instance = await db.vpnInstance.upsert({
    where: { serverId },
    update: {
      containerName,
      interfaceName: parsed.interfaceName ?? "awg0",
      awgVersion: mapVersion(parsed.awgVersion),
      listenPort: parsed.listenPort,
      serverPublicKey: parsed.serverPublicKey,
      hostListenPort: inspect.hostListenPort,
      containerStatus: inspect.status,
      containerStartedAt: inspect.startedAt,
      containerRestartCount: inspect.restartCount,
      running,
      lastSeenAt: now,
    },
    create: {
      serverId,
      containerName,
      interfaceName: parsed.interfaceName ?? "awg0",
      awgVersion: mapVersion(parsed.awgVersion),
      listenPort: parsed.listenPort,
      serverPublicKey: parsed.serverPublicKey,
      hostListenPort: inspect.hostListenPort,
      containerStatus: inspect.status,
      containerStartedAt: inspect.startedAt,
      containerRestartCount: inspect.restartCount,
      running,
      lastSeenAt: now,
    },
  });

  const existing = await db.peer.findMany({
    where: { vpnInstanceId: instance.id },
    select: {
      id: true,
      publicKey: true,
      status: true,
      endpoint: true,
      endpointCountryName: true,
      endpointCityName: true,
      endpointOrganization: true,
    },
  });
  const existingByKey = new Map(existing.map((peer) => [peer.publicKey, peer]));
  const peerIds = existing.map((peer) => peer.id);
  const lastSamples = existing.length
    ? await db.peerSample.findMany({
        where: { peerId: { in: peerIds } },
        orderBy: { capturedAt: "desc" },
        distinct: ["peerId"],
        select: { peerId: true, rxBytes: true, txBytes: true, online: true },
      })
    : [];
  const lastEvents = existing.length
    ? await db.peerPresenceEvent.findMany({
        where: { peerId: { in: peerIds } },
        orderBy: { occurredAt: "desc" },
        distinct: ["peerId"],
        select: { id: true, peerId: true, kind: true, endpoint: true },
      })
    : [];
  const lastByPeerId = new Map(lastSamples.map((sample) => [sample.peerId, sample]));
  const lastEventByPeerId = new Map(lastEvents.map((event) => [event.peerId, event]));
  const seen = new Set<string>();

  let rxDeltaSum = 0n;
  let txDeltaSum = 0n;
  let onlineCount = 0;

  for (const remote of parsed.peers) {
    seen.add(remote.publicKey);
    const prev = existingByKey.get(remote.publicKey);
    const lastSample = prev ? lastByPeerId.get(prev.id) ?? null : null;
    const lastEvent = prev ? lastEventByPeerId.get(prev.id) ?? null : null;

    const rxDelta = computeDelta(remote.rxBytes, lastSample?.rxBytes ?? null);
    const txDelta = computeDelta(remote.txBytes, lastSample?.txBytes ?? null);
    const online = isPeerOnline({
      capturedAt: now,
      handshakeUnix: remote.handshakeUnix,
      rxDelta,
      txDelta,
    });
    const kind = presenceTransition({
      online,
      previousOnline: previousPresenceOnline({
        lastEventKind: lastEvent?.kind,
        lastSampleOnline: lastSample?.online,
      }),
    });

    rxDeltaSum += rxDelta;
    txDeltaSum += txDelta;
    if (online) onlineCount += 1;

    const hostChanged = endpointHost(prev?.endpoint) !== endpointHost(remote.endpoint);
    const eventGeo = snapshotGeo(prev, remote.endpoint);
    const peer = await db.peer.upsert({
      where: {
        vpnInstanceId_publicKey: { vpnInstanceId: instance.id, publicKey: remote.publicKey },
      },
      update: {
        vpnName: remote.vpnName,
        allowedIps: remote.allowedIps,
        endpoint: remote.endpoint,
        ...(hostChanged
          ? { endpointCountryName: null, endpointCityName: null, endpointOrganization: null }
          : {}),
        status: "ACTIVE",
        lastSeenAt: now,
        removedAt: null,
      },
      create: {
        vpnInstanceId: instance.id,
        publicKey: remote.publicKey,
        vpnName: remote.vpnName,
        allowedIps: remote.allowedIps,
        endpoint: remote.endpoint,
        status: "ACTIVE",
        lastSeenAt: now,
      },
    });

    const hourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
    await db.$transaction([
      db.peerSample.create({
        data: {
          peerId: peer.id,
          capturedAt: now,
          rxBytes: remote.rxBytes,
          txBytes: remote.txBytes,
          rxDelta,
          txDelta,
          handshakeUnix: remote.handshakeUnix,
          online,
        },
      }),
      ...(kind
        ? [
            db.peerPresenceEvent.create({
              data: {
                peerId: peer.id,
                kind,
                occurredAt: now,
                endpoint: remote.endpoint,
                ...eventGeo,
              },
            }),
          ]
        : []),
      db.peerHourlySample.upsert({
        where: { peerId_hourStart: { peerId: peer.id, hourStart } },
        update: {
          rxDelta: { increment: rxDelta },
          txDelta: { increment: txDelta },
          onlineSecs: { increment: online ? POLL_INTERVAL_SEC : 0 },
          samples: { increment: 1 },
        },
        create: {
          peerId: peer.id,
          hourStart,
          rxDelta,
          txDelta,
          onlineSecs: online ? POLL_INTERVAL_SEC : 0,
          samples: 1,
        },
      }),
    ]);

    if (!kind && remote.endpoint && lastEvent && !lastEvent.endpoint) {
      const backfillGeo = snapshotGeo(peer, remote.endpoint);
      await db.peerPresenceEvent.update({
        where: { id: lastEvent.id },
        data: { endpoint: remote.endpoint, ...backfillGeo },
      });
      lastEvent.endpoint = remote.endpoint;
    }
  }

  const vanished = existing.filter((peer) => peer.status === "ACTIVE" && !seen.has(peer.publicKey));
  for (const peer of vanished) {
    const lastSample = lastByPeerId.get(peer.id) ?? null;
    const lastEvent = lastEventByPeerId.get(peer.id) ?? null;
    const kind = presenceTransition({
      online: false,
      previousOnline: previousPresenceOnline({
        lastEventKind: lastEvent?.kind,
        lastSampleOnline: lastSample?.online,
      }),
    });
    await db.$transaction([
      db.peer.update({
        where: { id: peer.id },
        data: { status: "REMOVED", removedAt: now },
      }),
      ...(kind
        ? [
            db.peerPresenceEvent.create({
              data: {
                peerId: peer.id,
                kind,
                occurredAt: now,
                endpoint: peer.endpoint,
                countryName: peer.endpointCountryName,
                cityName: peer.endpointCityName,
                organization: peer.endpointOrganization,
              },
            }),
          ]
        : []),
    ]);
  }

  await db.serverSample.create({
    data: {
      serverId,
      capturedAt: now,
      running,
      peerCount: parsed.peers.length,
      onlineCount,
      rxDelta: rxDeltaSum,
      txDelta: txDeltaSum,
    },
  });
}

export async function pruneOldSamples() {
  const settings = await ensureAppSettings();
  const rawCutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const hourlyCutoff = new Date(Date.now() - settings.hourlyRetentionDays * 24 * 60 * 60 * 1000);
  await db.peerSample.deleteMany({ where: { capturedAt: { lt: rawCutoff } } });
  await db.serverSample.deleteMany({ where: { capturedAt: { lt: rawCutoff } } });
  await db.peerPresenceEvent.deleteMany({ where: { occurredAt: { lt: rawCutoff } } });
  await db.peerHourlySample.deleteMany({ where: { hourStart: { lt: hourlyCutoff } } });
  await db.ipGeoCache.deleteMany({ where: { lookedUpAt: { lt: rawCutoff } } });
}

