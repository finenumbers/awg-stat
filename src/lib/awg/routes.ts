import { isIP } from "node:net";

import { addressFamilies, ipInCidr, isPrivateIp, sameIp, type ParsedAwgConf } from "@/lib/awg/conf";
import { isSafeProbeHost } from "@/lib/net/probe-host";

export type RouteChoice = { ok: true; ip: string; prefix: 32 | 128 } | { ok: false; error: string };

export function chooseRouteIp(input: {
  resolved: string[];
  endpointIps: string[];
  allowedIps: string[];
  families: Array<4 | 6>;
  previousIp?: string | null;
}): RouteChoice {
  const ips = input.resolved.filter((ip) => isIP(ip) !== 0);
  if (ips.length === 0) {
    return { ok: false, error: "Имя не резолвится" };
  }
  const endpoints = new Set(input.endpointIps);
  const usable = ips.filter((ip) => {
    const family = isIP(ip) as 4 | 6;
    return input.families.includes(family) && !endpoints.has(ip) && input.allowedIps.some((cidr) => ipInCidr(ip, cidr));
  });
  if (input.previousIp && isIP(input.previousIp) !== 0 && usable.some((ip) => sameIp(ip, input.previousIp!))) {
    return { ok: true, ip: input.previousIp, prefix: isIP(input.previousIp) === 4 ? 32 : 128 };
  }
  const chosen = usable.find((ip) => isIP(ip) === 4) ?? usable[0];
  if (chosen) {
    return { ok: true, ip: chosen, prefix: isIP(chosen) === 4 ? 32 : 128 };
  }
  if (ips.some((ip) => endpoints.has(ip))) {
    return { ok: false, error: "Адрес узла совпадает с endpoint туннеля" };
  }
  if (ips.every((ip) => !input.families.includes(isIP(ip) as 4 | 6))) {
    return { ok: false, error: "У клиента AmneziaWG нет адреса этого семейства" };
  }
  return { ok: false, error: "Адрес не входит в AllowedIPs клиента AmneziaWG" };
}

export function privateDnsRoute(parsed: Pick<ParsedAwgConf, "dnsHost" | "allowedIps">, endpointIps: string[]): string | null {
  const dns = parsed.dnsHost;
  if (!dns || !isPrivateIp(dns) || endpointIps.includes(dns)) {
    return null;
  }
  if (!parsed.allowedIps.some((cidr) => ipInCidr(dns, cidr))) {
    return null;
  }
  return dns;
}

export function routePolicy(parsed: Pick<ParsedAwgConf, "addresses" | "allowedIps" | "dnsHost">) {
  return {
    allowedIps: parsed.allowedIps,
    families: addressFamilies(parsed.addresses),
    dnsHost: parsed.dnsHost,
  };
}

export type ShownRoute = {
  ip: string | null;
  prefix: number | null;
  hostRoute: boolean;
  protoKernel: boolean;
  via: boolean;
};

export type HostKeepDecision = { keepIp: string | null; sweepUnsafe: boolean; error: string | null };

export type AwgListedRoute = { host: string | null; ip: string; dns: boolean };

export type AwgRouteRow = AwgListedRoute & { label: string };

const HOST_PREFIX: Record<4 | 6, 32 | 128> = { 4: 32, 6: 128 };

export function parseIfaceRoutes(stdout: string): ShownRoute[] {
  const routes: ShownRoute[] = [];
  for (const raw of stdout.split("\n")) {
    const parsed = parseIfaceRouteLine(raw);
    if (parsed) {
      routes.push(parsed);
    }
  }
  return routes;
}

export function kernelSnapshotUsable(input: { code: number; truncated: boolean }): boolean {
  return input.code === 0 && !input.truncated;
}

export function hostKeepDecision(input: {
  previousIp: string | null;
  havePreviousRoute: boolean;
  resolved: string[];
  allowedChoice: RouteChoice | null;
  installed: boolean;
}): HostKeepDecision {
  if (input.resolved.length === 0) {
    if (input.havePreviousRoute && input.previousIp) {
      return { keepIp: input.previousIp, sweepUnsafe: true, error: "Имя не резолвится" };
    }
    return { keepIp: null, sweepUnsafe: true, error: "Имя не резолвится" };
  }
  if (!input.allowedChoice?.ok) {
    return {
      keepIp: null,
      sweepUnsafe: false,
      error: input.allowedChoice?.error ?? "Нет маршрута до узла через AmneziaWG",
    };
  }
  if (input.installed) {
    return { keepIp: input.allowedChoice.ip, sweepUnsafe: false, error: null };
  }
  if (input.havePreviousRoute && input.previousIp) {
    return { keepIp: input.previousIp, sweepUnsafe: true, error: "Не удалось добавить маршрут через AmneziaWG" };
  }
  return { keepIp: null, sweepUnsafe: true, error: "Не удалось добавить маршрут через AmneziaWG" };
}

export function deletionPlan(input: {
  keep: string[];
  tracked: string[];
  shown: ShownRoute[] | null;
  ownAddresses: string[];
  sweep: boolean;
}): { tracked: string[]; kernel: Array<{ ip: string; prefix: 32 | 128 }> } {
  const tracked = input.tracked.filter((ip) => !containsIp(input.keep, ip));
  if (!input.sweep || !input.shown) {
    return { tracked, kernel: [] };
  }
  const kernel: Array<{ ip: string; prefix: 32 | 128 }> = [];
  for (const route of input.shown) {
    if (!route.hostRoute || route.protoKernel || !route.ip || route.via) {
      continue;
    }
    if (isOwnAddress(route.ip, input.ownAddresses) || containsIp(input.keep, route.ip) || containsIp(input.tracked, route.ip)) {
      continue;
    }
    const kind = isIP(route.ip);
    if (kind !== 4 && kind !== 6) {
      continue;
    }
    kernel.push({ ip: route.ip, prefix: HOST_PREFIX[kind] });
  }
  return { tracked, kernel };
}

export function visibleAwgRoutes(input: {
  shown: ShownRoute[];
  ownAddresses: string[];
  bindings: AwgListedRoute[];
}): AwgRouteRow[] {
  const kernel = input.shown.filter(
    (route) => route.hostRoute && route.ip && !route.protoKernel && !route.via && !isOwnAddress(route.ip, input.ownAddresses),
  );
  const rows: AwgRouteRow[] = [];
  for (const binding of input.bindings) {
    if (!kernel.some((route) => route.ip && sameIp(route.ip, binding.ip))) {
      continue;
    }
    rows.push({ ...binding, label: routeLabel(binding) });
  }
  for (const route of kernel) {
    if (!route.ip || input.bindings.some((binding) => sameIp(binding.ip, route.ip!))) {
      continue;
    }
    rows.push({ host: null, ip: route.ip, dns: false, label: route.ip });
  }
  rows.sort((a, b) => {
    if (a.dns !== b.dns) {
      return a.dns ? -1 : 1;
    }
    const byHost = (a.host ?? a.ip).localeCompare(b.host ?? b.ip);
    return byHost || a.ip.localeCompare(b.ip);
  });
  return rows;
}

export function routeLabel(route: AwgListedRoute): string {
  if (route.dns) {
    return `DNS ${route.ip}`;
  }
  if (route.host && isIP(route.host) === 0) {
    return `${route.host} → ${route.ip}`;
  }
  return route.ip;
}

export function parseAwgRoutePayload(body: unknown): { up: boolean; routes: AwgListedRoute[] } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const up = (body as { up?: unknown }).up;
  const routes = (body as { routes?: unknown }).routes;
  if (typeof up !== "boolean" || !Array.isArray(routes)) {
    return null;
  }
  if (!up) {
    return { up: false, routes: [] };
  }
  const parsed: AwgListedRoute[] = [];
  for (const item of routes) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const host = (item as { host?: unknown }).host;
    const ip = (item as { ip?: unknown }).ip;
    const dns = (item as { dns?: unknown }).dns;
    if (!(host === null || (typeof host === "string" && isSafeProbeHost(host)))) {
      return null;
    }
    if (typeof ip !== "string" || isIP(ip) === 0 || typeof dns !== "boolean") {
      return null;
    }
    parsed.push({ host, ip, dns });
  }
  return { up: true, routes: parsed };
}

export type AwgRouteListState =
  | { status: "unavailable" }
  | { status: "down" }
  | { status: "empty" }
  | { status: "list"; rows: AwgRouteRow[] };

export function presentAwgRoutes(payload: { up: boolean; routes: AwgListedRoute[] } | null): AwgRouteListState {
  if (!payload) {
    return { status: "unavailable" };
  }
  if (!payload.up) {
    return { status: "down" };
  }
  if (payload.routes.length === 0) {
    return { status: "empty" };
  }
  return {
    status: "list",
    rows: payload.routes.map((route) => ({ ...route, label: routeLabel(route) })),
  };
}

function parseIfaceRouteLine(line: string): ShownRoute | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const dest = tokens[0];
  if (!dest) {
    return null;
  }
  const via = tokens.includes("via");
  const protoAt = tokens.indexOf("proto");
  const protoKernel = protoAt >= 0 && tokens[protoAt + 1] === "kernel";
  const slash = dest.indexOf("/");
  const ip = slash >= 0 ? dest.slice(0, slash) : dest;
  const prefix = slash >= 0 ? Number(dest.slice(slash + 1)) : null;
  const kind = isIP(ip);
  if ((kind !== 4 && kind !== 6) || (prefix !== null && !Number.isInteger(prefix))) {
    return { ip: null, prefix: null, hostRoute: false, protoKernel, via };
  }
  const hostPrefix = HOST_PREFIX[kind];
  return {
    ip,
    prefix,
    hostRoute: !via && (prefix === null || prefix === hostPrefix),
    protoKernel,
    via,
  };
}

function containsIp(list: string[], ip: string): boolean {
  return list.some((item) => sameIp(item, ip));
}

function isOwnAddress(ip: string, ownAddresses: string[]): boolean {
  return ownAddresses.some((address) => {
    const own = address.split("/")[0] ?? "";
    return own !== "" && sameIp(own, ip);
  });
}
