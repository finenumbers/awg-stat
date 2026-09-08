import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDbSizeGb(value: bigint | number): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  const gb = !Number.isFinite(n) || n < 0 ? 0 : n / 1024 ** 3;
  return `${gb.toFixed(2).replace(".", ",")} Gb`;
}

export function formatBytes(value: bigint | number): string {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

export function formatRelativeHandshake(unixSec: bigint, nowSec = Math.floor(Date.now() / 1000)): string {
  if (unixSec <= 0n) {
    return "никогда";
  }
  const age = nowSec - Number(unixSec);
  if (age < 0) {
    return "только что";
  }
  if (age < 60) {
    return `${age} с назад`;
  }
  if (age < 3600) {
    return `${Math.floor(age / 60)} мин назад`;
  }
  if (age < 86400) {
    return `${Math.floor(age / 3600)} ч назад`;
  }
  return `${Math.floor(age / 86400)} дн назад`;
}

export function displayPeerName(vpnName: string | null | undefined, publicKey: string): string {
  if (vpnName?.trim()) {
    return vpnName.trim();
  }
  return `${publicKey.slice(0, 8)}…`;
}

const IPV4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/;
const IPV6 = /^([0-9a-f:]+)(?:\/(\d{1,3}))?$/i;

function stripHostPrefix(address: string, prefix: string | undefined, hostPrefix: string): string {
  return prefix === hostPrefix ? address : prefix ? `${address}/${prefix}` : address;
}

export function displayPeerInternalIp(allowedIps: string | null | undefined): string | null {
  if (!allowedIps?.trim()) {
    return null;
  }

  const tokens = allowedIps
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  let ipv6: string | null = null;
  for (const token of tokens) {
    const v4 = token.match(IPV4);
    if (v4) {
      return stripHostPrefix(v4[1], v4[2], "32");
    }
    const v6 = token.match(IPV6);
    if (v6 && !ipv6) {
      ipv6 = stripHostPrefix(v6[1], v6[2], "128");
    }
  }
  return ipv6;
}

const NAME_COLLATOR = new Intl.Collator("ru", { sensitivity: "base", numeric: true });
const IPV4_ADDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/\d+)?$/;

export function compareServerName(a: string, b: string): number {
  return NAME_COLLATOR.compare(a, b);
}

function ipv4Rank(ip: string): number | null {
  const match = ip.match(IPV4_ADDR);
  if (!match) {
    return null;
  }
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function comparePeerInternalIp(
  a: { allowedIps?: string | null; publicKey?: string },
  b: { allowedIps?: string | null; publicKey?: string },
): number {
  const aIp = displayPeerInternalIp(a.allowedIps);
  const bIp = displayPeerInternalIp(b.allowedIps);
  if (!aIp && !bIp) {
    return (a.publicKey ?? "").localeCompare(b.publicKey ?? "");
  }
  if (!aIp) {
    return 1;
  }
  if (!bIp) {
    return -1;
  }

  const aV4 = ipv4Rank(aIp);
  const bV4 = ipv4Rank(bIp);
  if (aV4 != null && bV4 != null && aV4 !== bV4) {
    return aV4 - bV4;
  }
  if (aV4 != null && bV4 == null) {
    return -1;
  }
  if (aV4 == null && bV4 != null) {
    return 1;
  }
  if (aV4 == null && bV4 == null) {
    const byIp = aIp.localeCompare(bIp);
    if (byIp !== 0) {
      return byIp;
    }
  }
  return (a.publicKey ?? "").localeCompare(b.publicKey ?? "");
}

export type AwgVersionValue = "V31" | "V30" | "V2" | "UNKNOWN" | null | undefined;

export function activeAwgVersionLabel(version: AwgVersionValue): string | null {
  if (version === "V31") {
    return "AmneziaWG 3.1";
  }
  if (version === "V30") {
    return "AmneziaWG 3.0";
  }
  if (version === "V2") {
    return "AmneziaWG 2";
  }
  return null;
}

export function formatUptime(startedAt: Date, now = new Date()): string {
  const sec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  if (sec < 60) {
    return `${sec} с`;
  }
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours} ч ${remMin} мин` : `${hours} ч`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} дн ${remHours} ч` : `${days} дн`;
}

export type DisplayedEndpoint = {
  host: string;
  port: string | null;
};

export function displayPeerEndpoint(endpoint: string | null | undefined): DisplayedEndpoint | null {
  const raw = endpoint?.trim();
  if (!raw || raw === "(none)") {
    return null;
  }

  const bracket = raw.match(/^\[([0-9a-f:]+)\]:(\d+)$/i);
  if (bracket) {
    return { host: bracket[1], port: bracket[2] };
  }

  const ipv4 = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
  if (ipv4) {
    return { host: ipv4[1], port: ipv4[2] };
  }

  const hostPort = raw.match(/^([^[\]:]+):(\d+)$/);
  if (hostPort) {
    return { host: hostPort[1], port: hostPort[2] };
  }

  return { host: raw, port: null };
}

export type EndpointGeoLabel = {
  countryName?: string | null;
  cityName?: string | null;
  organization?: string | null;
};

export function formatEndpointGeo(geo: EndpointGeoLabel | null | undefined): string | null {
  const parts = [geo?.countryName, geo?.cityName, geo?.organization]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function formatDateTime(date: Date): string {
  return `${date.toLocaleString("ru", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
  })} UTC`;
}

export function formatChartTime(ts: number, spanMs: number): string {
  const date = new Date(ts);
  if (spanMs >= 36 * 60 * 60 * 1000) {
    return date.toLocaleString("ru", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  return date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
