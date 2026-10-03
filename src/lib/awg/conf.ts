import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { isSafeProbeHost } from "@/lib/net/probe-host";

export const AWG_CONF_MAX_BYTES = 16 * 1024;
export const AWG_HANDSHAKE_FRESH_SEC = 180;
export const AWG_DEFAULT_MTU = 1280;

const QUICK_ONLY = new Set([
  "address",
  "dns",
  "mtu",
  "table",
  "preup",
  "postup",
  "predown",
  "postdown",
  "saveconfig",
]);

const REQUIRED_INTERFACE = ["privatekey", "address", "jc", "jmin", "jmax", "s1", "s2", "h1", "h2", "h3", "h4"];
const REQUIRED_PEER = ["publickey", "endpoint", "allowedips"];
const PRESERVE_VALUE_KEYS = new Set(["i1", "i2", "i3", "i4", "i5"]);

export type AwgField = { key: string; value: string };

export type ParsedAwgConf = {
  interfaceFields: AwgField[];
  peerFields: AwgField[];
  addresses: string[];
  mtu: number;
  dnsHost: string | null;
  endpointHost: string;
  endpointPort: number;
  allowedIps: string[];
  peerPublicKey: string;
  clientAddress: string;
};

export function normalizeAwgConf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() + "\n";
}

export function hashAwgConf(text: string): string {
  return createHash("sha256").update(normalizeAwgConf(text), "utf8").digest("hex");
}

export function parseAwgConf(text: string): ParsedAwgConf {
  const normalized = normalizeAwgConf(text);
  if (Buffer.byteLength(normalized) > AWG_CONF_MAX_BYTES) {
    throw new Error("Файл конфига больше 16 КБ");
  }

  const interfaceFields: AwgField[] = [];
  const peerFields: AwgField[] = [];
  let section: "interface" | "peer" | null = null;
  let interfaceCount = 0;
  let peerCount = 0;

  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const header = line.match(/^\[(Interface|Peer)\]$/i);
    if (header) {
      const name = header[1].toLowerCase();
      if (name === "interface") {
        interfaceCount += 1;
        section = "interface";
      } else {
        peerCount += 1;
        section = "peer";
      }
      if (interfaceCount > 1 || peerCount > 1) {
        throw new Error("Нужен ровно один [Interface] и один [Peer]");
      }
      continue;
    }
    if (!section) {
      throw new Error("В конфиге нет секции [Interface]");
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      throw new Error("Некорректная строка в конфиге AmneziaWG");
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      throw new Error(`Неизвестное поле ${key}`);
    }
    let value = line.slice(eq + 1).trim();
    if (!PRESERVE_VALUE_KEYS.has(key.toLowerCase())) {
      const comment = value.search(/\s+#/);
      if (comment >= 0) {
        value = value.slice(0, comment).trim();
      }
    }
    if (!value) {
      throw new Error(`Пустое поле ${key}`);
    }
    const bucket = section === "interface" ? interfaceFields : peerFields;
    if (bucket.some((field) => field.key.toLowerCase() === key.toLowerCase())) {
      throw new Error(`Поле ${key} указано дважды`);
    }
    bucket.push({ key, value });
  }

  if (interfaceCount !== 1 || peerCount !== 1) {
    throw new Error("Нужен ровно один [Interface] и один [Peer]");
  }

  const interfaceMap = fieldMap(interfaceFields);
  const peerMap = fieldMap(peerFields);
  for (const key of REQUIRED_INTERFACE) {
    if (!interfaceMap.has(key)) {
      throw new Error("Это не конфиг клиента AmneziaWG: не хватает параметров обфускации");
    }
  }
  for (const key of REQUIRED_PEER) {
    if (!peerMap.has(key)) {
      throw new Error("В [Peer] нет PublicKey, Endpoint или AllowedIPs");
    }
  }

  const addresses = parseAddresses(interfaceMap.get("address") ?? "");
  const endpoint = parseEndpoint(peerMap.get("endpoint") ?? "");
  if (!endpoint) {
    throw new Error("Endpoint должен быть host:port");
  }
  const allowedIps = splitList(peerMap.get("allowedips") ?? "");
  if (allowedIps.length === 0 || allowedIps.some((cidr) => !isCidr(cidr))) {
    throw new Error("AllowedIPs должен быть списком сетей");
  }

  return {
    interfaceFields,
    peerFields,
    addresses,
    mtu: parseMtu(interfaceMap.get("mtu")),
    dnsHost: privateDnsHost(interfaceMap.get("dns")),
    endpointHost: endpoint.host,
    endpointPort: endpoint.port,
    allowedIps,
    peerPublicKey: peerMap.get("publickey") ?? "",
    clientAddress: addresses.join(", "),
  };
}

export function renderSetconf(parsed: ParsedAwgConf): string {
  const lines = ["[Interface]"];
  for (const field of parsed.interfaceFields) {
    if (QUICK_ONLY.has(field.key.toLowerCase())) {
      continue;
    }
    lines.push(`${field.key} = ${field.value}`);
  }
  lines.push("", "[Peer]");
  for (const field of parsed.peerFields) {
    if (QUICK_ONLY.has(field.key.toLowerCase())) {
      continue;
    }
    lines.push(`${field.key} = ${field.value}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseEndpoint(value: string): { host: string; port: number } | null {
  const trimmed = value.trim();
  const bracket = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracket) {
    return endpointParts(bracket[1], Number(bracket[2]));
  }
  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) {
    return null;
  }
  const host = trimmed.slice(0, idx);
  if (host.includes(":")) {
    return null;
  }
  return endpointParts(host, Number(trimmed.slice(idx + 1)));
}

export function addressFamilies(addresses: string[]): Array<4 | 6> {
  const families = new Set<4 | 6>();
  for (const address of addresses) {
    const kind = isIP(address.split("/")[0] ?? "");
    if (kind === 4 || kind === 6) {
      families.add(kind);
    }
  }
  return [...families];
}

function endpointParts(host: string, port: number): { host: string; port: number } | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !isSafeProbeHost(host)) {
    return null;
  }
  return { host, port };
}

function fieldMap(fields: AwgField[]): Map<string, string> {
  return new Map(fields.map((field) => [field.key.toLowerCase(), field.value]));
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseAddresses(value: string): string[] {
  const parts = splitList(value);
  if (parts.length === 0 || parts.some((part) => !isCidr(part))) {
    throw new Error("Address должен быть IP/маска");
  }
  return parts;
}

function parseMtu(value: string | undefined): number {
  if (!value) {
    return AWG_DEFAULT_MTU;
  }
  const mtu = Number(value);
  if (!Number.isInteger(mtu) || mtu < 576 || mtu > 1500) {
    throw new Error("MTU должен быть от 576 до 1500");
  }
  return mtu;
}

function privateDnsHost(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  for (const part of splitList(value)) {
    if (isIP(part) !== 0 && isPrivateDnsAddress(part)) {
      return part;
    }
  }
  return null;
}

function isPrivateDnsAddress(ip: string): boolean {
  return isPrivateIp(ip);
}

export function isCidr(value: string): boolean {
  const [ip, prefixRaw] = value.split("/");
  if (!ip || prefixRaw === undefined || value.split("/").length !== 2) {
    return false;
  }
  const kind = isIP(ip);
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || kind === 0) {
    return false;
  }
  const max = kind === 4 ? 32 : 128;
  return prefix >= 0 && prefix <= max;
}

export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    return (
      ipInCidr(ip, "10.0.0.0/8") ||
      ipInCidr(ip, "172.16.0.0/12") ||
      ipInCidr(ip, "192.168.0.0/16") ||
      ipInCidr(ip, "127.0.0.0/8") ||
      ipInCidr(ip, "169.254.0.0/16") ||
      ipInCidr(ip, "100.64.0.0/10")
    );
  }
  if (kind === 6) {
    return ip === "::1" || ipInCidr(ip, "fc00::/7") || ipInCidr(ip, "fe80::/10");
  }
  return false;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (!isCidr(cidr)) {
    return false;
  }
  const [network, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const kind = isIP(ip);
  if (!network || kind === 0 || isIP(network) !== kind) {
    return false;
  }
  if (kind === 4) {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
  }
  if (prefix === 0) {
    return true;
  }
  const shift = 128n - BigInt(prefix);
  return (ipv6ToBigInt(ip) >> shift) === (ipv6ToBigInt(network) >> shift);
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function ipv6ToBigInt(ip: string): bigint {
  let value = ip.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const [a, b, c, d] = value
      .slice(lastColon + 1)
      .split(".")
      .map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    value = `${value.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = value.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  const parts = [...head, ...Array.from({ length: Math.max(missing, 0) }, () => "0"), ...tail];
  return parts.reduce((acc, part) => (acc << 16n) + BigInt(Number.parseInt(part || "0", 16)), 0n);
}
