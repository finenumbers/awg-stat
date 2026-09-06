import { displayPeerEndpoint } from "@/lib/utils";
import {
  cacheIsFresh,
  GEOIP_LOOKUP_CONCURRENCY,
  GEOIP_LOOKUP_TIMEOUT_MS,
  GEOIP_MAX_API_PER_TICK,
  geoipLookupUrl,
  isGeoipConfigured,
  isLookupableIp,
  parseLookupResponse,
  type EndpointGeo,
} from "@/lib/geoip";
import { db } from "@/lib/db";

const inflight = new Map<string, Promise<EndpointGeo | null>>();
const logged = new Set<string>();
let disabledLogged = false;

export function warnIfGeoipDisabled(): void {
  if (isGeoipConfigured() || disabledLogged) {
    return;
  }
  disabledLogged = true;
  console.warn("[geoip] disabled: GEOIP_API_URL / GEOIP_API_KEY are empty");
}

function logOnce(key: string, message: string): void {
  if (logged.has(key)) {
    return;
  }
  logged.add(key);
  console.warn(message);
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
    now?: Date;
  },
): Promise<EndpointGeo | null> {
  const url = options?.url ?? process.env.GEOIP_API_URL;
  const key = options?.key ?? process.env.GEOIP_API_KEY;
  if (!isGeoipConfigured(url, key) || !url || !key) {
    return null;
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
      logOnce("401", "[geoip] 401 unauthorized");
      return null;
    }
    if (response.status === 429) {
      logOnce("429", "[geoip] 429 rate limited");
      throw Object.assign(new Error("rate limited"), { status: 429 });
    }
    if (response.status === 503) {
      logOnce("503", "[geoip] 503 unavailable");
      return null;
    }
    if (!response.ok) {
      logOnce(`http-${response.status}`, `[geoip] HTTP ${response.status}`);
      return null;
    }
    return parseLookupResponse(await response.json());
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 429) {
      throw error;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupAndCache(ip: string): Promise<EndpointGeo | null> {
  const pending = inflight.get(ip);
  if (pending) {
    return pending;
  }

  const work = (async () => {
    try {
      const geo = await fetchGeoipLookup(ip);
      const now = new Date();
      if (geo) {
        await db.ipGeoCache.upsert({
          where: { ip },
          create: { ip, ...geo, ok: true, lookedUpAt: now },
          update: { ...geo, ok: true, lookedUpAt: now },
        });
        return geo;
      }
      await db.ipGeoCache.upsert({
        where: { ip },
        create: { ip, countryName: null, cityName: null, organization: null, ok: false, lookedUpAt: now },
        update: { countryName: null, cityName: null, organization: null, ok: false, lookedUpAt: now },
      });
      return null;
    } catch (error) {
      const now = new Date();
      await db.ipGeoCache.upsert({
        where: { ip },
        create: { ip, countryName: null, cityName: null, organization: null, ok: false, lookedUpAt: now },
        update: { ok: false, lookedUpAt: now },
      });
      if (error && typeof error === "object" && "status" in error && error.status === 429) {
        throw error;
      }
      return null;
    }
  })();

  inflight.set(ip, work);
  try {
    return await work;
  } finally {
    inflight.delete(ip);
  }
}

async function resolveIp(ip: string, allowApi: () => boolean): Promise<EndpointGeo | null> {
  const cached = await db.ipGeoCache.findUnique({ where: { ip } });
  if (cached && cacheIsFresh(cached)) {
    return cached.ok ? { countryName: cached.countryName, cityName: cached.cityName, organization: cached.organization } : null;
  }
  if (!allowApi()) {
    return cached?.ok
      ? { countryName: cached.countryName, cityName: cached.cityName, organization: cached.organization }
      : null;
  }
  return lookupAndCache(ip);
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

export async function resolveEndpointGeos(endpoints: Array<string | null | undefined>): Promise<Map<string, EndpointGeo>> {
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

  let apiCalls = 0;
  let stopApi = false;
  const allowApi = () => {
    if (stopApi || apiCalls >= GEOIP_MAX_API_PER_TICK) {
      return false;
    }
    apiCalls += 1;
    return true;
  };

  await mapPool(ips, GEOIP_LOOKUP_CONCURRENCY, async (ip) => {
    try {
      const geo = await resolveIp(ip, allowApi);
      if (geo) {
        resolved.set(ip, geo);
      }
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 429) {
        stopApi = true;
      }
    }
  });

  return resolved;
}

export async function applyResolvedGeos(geos: Map<string, EndpointGeo>): Promise<void> {
  for (const [ip, geo] of geos) {
    const match = endpointMatchFilter(ip);
    await db.peer.updateMany({
      where: match,
      data: {
        endpointCountryName: geo.countryName,
        endpointCityName: geo.cityName,
        endpointOrganization: geo.organization,
      },
    });
    if (geo.countryName || geo.cityName || geo.organization) {
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
}

export async function enrichServerPeerEndpoints(serverId: string): Promise<void> {
  warnIfGeoipDisabled();
  if (!isGeoipConfigured()) {
    return;
  }

  try {
    const peers = await db.peer.findMany({
      where: { vpnInstance: { serverId } },
      select: { endpoint: true },
    });
    const geos = await resolveEndpointGeos(peers.map((peer) => peer.endpoint));
    await applyResolvedGeos(geos);
  } catch (error) {
    const message = error instanceof Error ? error.message : "enrich failed";
    console.error(`[geoip] enrich failed server=${serverId}: ${message}`);
  }
}
