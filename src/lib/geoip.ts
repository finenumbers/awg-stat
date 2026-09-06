export const GEOIP_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GEOIP_FAILURE_TTL_MS = 60 * 60 * 1000;
export const GEOIP_LOOKUP_TIMEOUT_MS = 10_000;
export const GEOIP_MAX_API_PER_TICK = 20;
export const GEOIP_MAX_API_PER_MINUTE = 80;
export const GEOIP_LOOKUP_CONCURRENCY = 4;
export const GEOIP_ENRICH_DEADLINE_MS = 12_000;

export type EndpointGeo = {
  countryName: string | null;
  cityName: string | null;
  organization: string | null;
};

export type GeoipLookupResult =
  | { kind: "ok"; geo: EndpointGeo }
  | { kind: "empty" }
  | { kind: "auth" }
  | { kind: "ratelimit" }
  | { kind: "unavailable"; reason: string }
  | { kind: "disabled" };

export function isGeoipConfigured(
  url = process.env["GEOIP_API_URL"],
  key = process.env["GEOIP_API_KEY"],
): boolean {
  return Boolean(url?.trim() && key?.trim());
}

export function geoipLookupUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/v1/lookup")) {
    return base;
  }
  if (base.endsWith("/lookup")) {
    base = base.slice(0, -"/lookup".length).replace(/\/+$/, "");
  }
  if (base.endsWith("/api/v1")) {
    return `${base}/lookup`;
  }
  return `${base}/api/v1/lookup`;
}

export function cacheIsFresh(row: { ok: boolean; lookedUpAt: Date }, now = new Date()): boolean {
  const ttl = row.ok ? GEOIP_SUCCESS_TTL_MS : GEOIP_FAILURE_TTL_MS;
  return now.getTime() - row.lookedUpAt.getTime() < ttl;
}

export function hasUsefulGeo(geo: EndpointGeo | null | undefined): geo is EndpointGeo {
  return Boolean(geo?.countryName || geo?.cityName || geo?.organization);
}

export function parseLookupResponse(value: unknown): EndpointGeo | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as {
    country?: { countryName?: unknown } | null;
    city?: { countryName?: unknown; cityName?: unknown } | null;
    asn?: { organization?: unknown } | null;
  };
  const countryName = readName(body.country?.countryName) ?? readName(body.city?.countryName);
  const cityName = readName(body.city?.cityName);
  const organization = readName(body.asn?.organization);
  return { countryName, cityName, organization };
}

export function classifyParsedGeo(geo: EndpointGeo | null): Extract<GeoipLookupResult, { kind: "ok" | "empty" | "unavailable" }> {
  if (!geo) {
    return { kind: "unavailable", reason: "invalid response" };
  }
  if (hasUsefulGeo(geo)) {
    return { kind: "ok", geo };
  }
  return { kind: "empty" };
}

function readName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isLookupableIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return false;
    }
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) {
      return false;
    }
    if (a === 169 && b === 254) {
      return false;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return false;
    }
    if (a === 192 && b === 168) {
      return false;
    }
    return true;
  }

  if (!ip.includes(":")) {
    return false;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") {
    return false;
  }
  if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return false;
  }
  const first = parseIpv6FirstByte(lower);
  if (first !== null && (first & 0xfe) === 0xfc) {
    return false;
  }
  return true;
}

function parseIpv6FirstByte(ip: string): number | null {
  const head = ip.split(":")[0];
  if (!head) {
    return null;
  }
  const value = Number.parseInt(head, 16);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value > 0xff ? (value >> 8) & 0xff : value;
}

const apiWindow = { startedAt: 0, count: 0 };

export function tryConsumeGeoipApiSlot(now = Date.now()): boolean {
  if (now - apiWindow.startedAt >= 60_000) {
    apiWindow.startedAt = now;
    apiWindow.count = 0;
  }
  if (apiWindow.count >= GEOIP_MAX_API_PER_MINUTE) {
    return false;
  }
  apiWindow.count += 1;
  return true;
}
