import { displayPeerEndpoint } from "@/lib/utils";
import {
  cacheIsFresh,
  classifyParsedGeo,
  GEOIP_ENRICH_DEADLINE_MS,
  GEOIP_LOOKUP_CONCURRENCY,
  GEOIP_LOOKUP_TIMEOUT_MS,
  GEOIP_MAX_API_PER_TICK,
  geoipLookupUrl,
  hasUsefulGeo,
  isGeoipConfigured,
  isLookupableIp,
  parseLookupResponse,
  tryConsumeGeoipApiSlot,
  type EndpointGeo,
  type GeoipLookupResult,
} from "@/lib/geoip";
import { RAW_RETENTION_DAYS } from "@/server/poll-defaults";
import { db } from "@/lib/db";

const inflight = new Map<string, Promise<EndpointGeo | null>>();
let startupLogged = false;

export function warnIfGeoipDisabled(): void {
  if (startupLogged) {
    return;
  }
  startupLogged = true;
  const url = process.env["GEOIP_API_URL"]?.trim() ?? "";
  const key = process.env["GEOIP_API_KEY"]?.trim() ?? "";
  if (!isGeoipConfigured(url, key)) {
    console.warn("[geoip] disabled: GEOIP_API_URL / GEOIP_API_KEY are empty");
    return;
  }
  console.info(`[geoip] configured host=${url}`);
}

export function endpointMatchFilter(ip: string) {
  return {
    OR: [{ endpoint: { startsWith: `${ip}:` } }, { endpoint: ip }, { endpoint: { startsWith: `[${ip}]:` } }],
  };
}

export async function fetchGeoipLookup(
  ip: string,
  options?: {
    url?: string;
    key?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<GeoipLookupResult> {
  const url = options?.url ?? process.env["GEOIP_API_URL"];
  const key = options?.key ?? process.env["GEOIP_API_KEY"];
  if (!isGeoipConfigured(url, key) || !url || !key) {
    return { kind: "disabled" };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOIP_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(geoipLookupUrl(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify({ ip, include: ["city", "country", "asn"] }),
      signal: controller.signal,
    });
    if (response.status === 401) {
      return { kind: "auth" };
    }
    if (response.status === 429) {
      return { kind: "ratelimit" };
    }
    if (!response.ok) {
      return { kind: "unavailable", reason: `HTTP ${response.status}` };
    }
    return classifyParsedGeo(parseLookupResponse(await response.json()));
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
    return { kind: "unavailable", reason };
  } finally {
    clearTimeout(timer);
  }
}

async function writeCache(ip: string, geo: EndpointGeo | null, ok: boolean): Promise<void> {
  const now = new Date();
  await db.ipGeoCache.upsert({
    where: { ip },
    create: {
      ip,
      countryName: geo?.countryName ?? null,
      cityName: geo?.cityName ?? null,
      organization: geo?.organization ?? null,
      ok,
      lookedUpAt: now,
    },
    update: {
      countryName: geo?.countryName ?? null,
      cityName: geo?.cityName ?? null,
      organization: geo?.organization ?? null,
      ok,
      lookedUpAt: now,
    },
  });
}

async function lookupAndCache(ip: string): Promise<EndpointGeo | null> {
  const pending = inflight.get(ip);
  if (pending) {
    return pending;
  }

  const work = (async () => {
    const result = await fetchGeoipLookup(ip);
    if (result.kind === "ok") {
      await writeCache(ip, result.geo, true);
      return result.geo;
    }
    if (result.kind === "empty" || result.kind === "auth" || result.kind === "unavailable") {
      await writeCache(ip, null, false);
      return null;
    }
    if (result.kind === "ratelimit") {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    }
    return null;
  })();

  inflight.set(ip, work);
  try {
    return await work;
  } finally {
    inflight.delete(ip);
  }
}

async function resolveIp(
  ip: string,
  allowApi: () => boolean,
): Promise<{ geo: EndpointGeo | null; source: "cache" | "api" | "skip" }> {
  const cached = await db.ipGeoCache.findUnique({ where: { ip } });
  if (cached && cacheIsFresh(cached)) {
    return {
      geo: cached.ok ? { countryName: cached.countryName, cityName: cached.cityName, organization: cached.organization } : null,
      source: "cache",
    };
  }
  if (!allowApi()) {
    return {
      geo: cached?.ok
        ? { countryName: cached.countryName, cityName: cached.cityName, organization: cached.organization }
        : null,
      source: "skip",
    };
  }
  return { geo: await lookupAndCache(ip), source: "api" };
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await fn(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

export async function resolveEndpointGeos(
  endpoints: Array<string | null | undefined>,
  options?: { deadlineAt?: number },
): Promise<Map<string, EndpointGeo>> {
  const resolved = new Map<string, EndpointGeo>();
  if (!isGeoipConfigured()) {
    return resolved;
  }

  const ips = [
    ...new Set(
      endpoints
        .map((endpoint) => displayPeerEndpoint(endpoint)?.host ?? null)
        .filter((ip): ip is string => ip !== null && isLookupableIp(ip)),
    ),
  ];
  if (ips.length === 0) {
    return resolved;
  }

  const deadlineAt = options?.deadlineAt ?? Date.now() + GEOIP_ENRICH_DEADLINE_MS;
  let tickCalls = 0;
  let stopApi = false;
  let lookedUp = 0;
  let cached = 0;
  let failed = 0;
  let skipped = 0;

  const allowApi = () => {
    if (stopApi || Date.now() >= deadlineAt || tickCalls >= GEOIP_MAX_API_PER_TICK) {
      return false;
    }
    if (!tryConsumeGeoipApiSlot()) {
      return false;
    }
    tickCalls += 1;
    return true;
  };

  await mapPool(ips, GEOIP_LOOKUP_CONCURRENCY, async (ip) => {
    try {
      const resolvedIp = await resolveIp(ip, allowApi);
      if (resolvedIp.source === "cache") {
        cached += 1;
      } else if (resolvedIp.source === "skip") {
        skipped += 1;
      } else if (hasUsefulGeo(resolvedIp.geo)) {
        lookedUp += 1;
      } else {
        failed += 1;
      }
      if (hasUsefulGeo(resolvedIp.geo)) {
        resolved.set(ip, resolvedIp.geo);
      }
    } catch (error) {
      failed += 1;
      if (error && typeof error === "object" && "status" in error && error.status === 429) {
        stopApi = true;
      }
    }
  });

  console.info(
    `[geoip] tick lookedUp=${lookedUp} cached=${cached} failed=${failed} skipped=${skipped}`,
  );
  return resolved;
}

export async function applyResolvedGeos(geos: Map<string, EndpointGeo>): Promise<void> {
  for (const [ip, geo] of geos) {
    if (!hasUsefulGeo(geo)) {
      continue;
    }
    const match = endpointMatchFilter(ip);
    await db.peer.updateMany({
      where: match,
      data: {
        endpointCountryName: geo.countryName,
        endpointCityName: geo.cityName,
        endpointOrganization: geo.organization,
      },
    });
    await db.peerPresenceEvent.updateMany({
      where: {
        AND: [match, { countryName: null, cityName: null, organization: null }],
      },
      data: {
        countryName: geo.countryName,
        cityName: geo.cityName,
        organization: geo.organization,
      },
    });
  }
}

export async function enrichServerPeerEndpoints(serverId: string): Promise<void> {
  warnIfGeoipDisabled();
  if (!isGeoipConfigured()) {
    return;
  }

  try {
    const since = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [peers, events] = await Promise.all([
      db.peer.findMany({
        where: { vpnInstance: { serverId } },
        select: { endpoint: true },
      }),
      db.peerPresenceEvent.findMany({
        where: { peer: { vpnInstance: { serverId } }, occurredAt: { gte: since } },
        select: { endpoint: true },
        distinct: ["endpoint"],
      }),
    ]);
    const geos = await resolveEndpointGeos(
      [...peers.map((peer) => peer.endpoint), ...events.map((event) => event.endpoint)],
      { deadlineAt: Date.now() + GEOIP_ENRICH_DEADLINE_MS },
    );
    await applyResolvedGeos(geos);
  } catch (error) {
    const message = error instanceof Error ? error.message : "enrich failed";
    console.error(`[geoip] enrich failed server=${serverId}: ${message}`);
  }
}
