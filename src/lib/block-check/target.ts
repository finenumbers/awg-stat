const BLOCKED_NAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);
const METADATA_IPV4 = "169.254.169.254";

const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3})$/;

function isLiteralIpv4(host: string): boolean {
  return IPV4_PATTERN.test(host);
}

function ipv4ToInt(ip: string): number | null {
  if (!isLiteralIpv4(ip)) {
    return null;
  }
  const parts = ip.split(".");
  let value = 0;
  for (const part of parts) {
    value = (value << 8) + Number(part);
  }
  return value >>> 0;
}

function extractIpv4FromMappedIpv6(ip: string): string | null {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const suffix = normalized.slice("::ffff:".length);
    if (isLiteralIpv4(suffix)) {
      return suffix;
    }
  }
  const mappedMatch = normalized.match(/^0:0:0:0:0:ffff:([0-9.]+)$/);
  if (mappedMatch?.[1] && isLiteralIpv4(mappedMatch[1])) {
    return mappedMatch[1];
  }
  return null;
}

function isBlockedIpv4(ip: string): boolean {
  if (ip === METADATA_IPV4) {
    return true;
  }
  const ipInt = ipv4ToInt(ip);
  if (ipInt == null) {
    return true;
  }
  const blockedRanges: Array<[number, number]> = [
    [ipv4ToInt("0.0.0.0")!, ipv4ToInt("0.255.255.255")!],
    [ipv4ToInt("10.0.0.0")!, ipv4ToInt("10.255.255.255")!],
    [ipv4ToInt("127.0.0.0")!, ipv4ToInt("127.255.255.255")!],
    [ipv4ToInt("169.254.0.0")!, ipv4ToInt("169.254.255.255")!],
    [ipv4ToInt("172.16.0.0")!, ipv4ToInt("172.31.255.255")!],
    [ipv4ToInt("192.168.0.0")!, ipv4ToInt("192.168.255.255")!],
    [ipv4ToInt("100.64.0.0")!, ipv4ToInt("100.127.255.255")!],
  ];
  return blockedRanges.some(([start, end]) => ipInt >= start && ipInt <= end);
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  if (normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  return false;
}

function isDisallowedExternalAddress(host: string): boolean {
  const trimmed = host.trim();
  if (isLiteralIpv4(trimmed)) {
    return isBlockedIpv4(trimmed);
  }
  if (trimmed.includes(":")) {
    const mappedIpv4 = extractIpv4FromMappedIpv6(trimmed);
    if (mappedIpv4) {
      return isBlockedIpv4(mappedIpv4);
    }
    return isBlockedIpv6(trimmed);
  }
  return false;
}

/** Public hostnames and public IPs only. Private and CGNAT literals stay inside the app. */
export function canQueryBlockCheckHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed) || trimmed.includes("%")) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  if (BLOCKED_NAMES.has(normalized)) {
    return false;
  }

  if (trimmed.includes(":")) {
    if (!/^[0-9a-f:.]+$/i.test(trimmed)) {
      return false;
    }
    return !isDisallowedExternalAddress(trimmed);
  }

  if (isLiteralIpv4(trimmed)) {
    return !isDisallowedExternalAddress(trimmed);
  }

  if (!/^[a-z0-9.-]+$/i.test(trimmed) || trimmed.startsWith("-") || trimmed.endsWith(".")) {
    return false;
  }

  if (normalized.endsWith(".local") || normalized.endsWith(".internal") || normalized.includes("..")) {
    return false;
  }

  return true;
}

export function blockCheckHostKey(host: string): string {
  return host.trim().toLowerCase();
}
