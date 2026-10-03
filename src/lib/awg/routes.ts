import { isIP } from "node:net";

import { addressFamilies, ipInCidr, isPrivateIp, type ParsedAwgConf } from "@/lib/awg/conf";

export type RouteChoice = { ok: true; ip: string; prefix: 32 | 128 } | { ok: false; error: string };

export function chooseRouteIp(input: {
  resolved: string[];
  endpointIps: string[];
  allowedIps: string[];
  families: Array<4 | 6>;
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
