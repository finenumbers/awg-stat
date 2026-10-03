import { spawn, type ChildProcess } from "node:child_process";
import { lookup } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { isIP } from "node:net";

import {
  addressFamilies,
  hashAwgConf,
  parseAwgConf,
  renderSetconf,
  type ParsedAwgConf,
} from "@/lib/awg/conf";
import { isSafeProbeHost } from "@/lib/net/probe-host";
import { chooseRouteIp, privateDnsRoute } from "@/lib/awg/routes";

const IFACE = "awg0";
const CONF_PATH = "/run/gate-awg/awg0.conf";
const RESOLV_PATH = "/etc/resolv.conf";

export type HostRouteResult = { host: string; ip?: string; error?: string };

export type TunnelStatus = {
  up: boolean;
  handshakeAt: number | null;
  endpoint: string | null;
  rx: number;
  tx: number;
  version: string;
  configHash: string | null;
  applyError: string | null;
};

type CommandResult = { code: number; stdout: string };

function run(command: string, args: string[], timeoutMs = 8_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(0, 64_000);
    });
    child.stderr?.on("data", () => undefined);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, stdout });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout });
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAll(host: string): Promise<string[]> {
  if (!isSafeProbeHost(host)) {
    throw new Error("Некорректный адрес узла");
  }
  if (isIP(host) !== 0) {
    return [host];
  }
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

export class AwgTunnel {
  private go: ChildProcess | null = null;
  private stopping = false;
  private parsed: ParsedAwgConf | null = null;
  private configHash: string | null = null;
  private applyError: string | null = null;
  private endpointIps: string[] = [];
  private endpointResolvedAt = 0;
  private readonly routes = new Map<string, 32 | 128>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly version: string) {}

  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  hasRoute(ip: string): boolean {
    return this.routes.has(ip);
  }

  async apply(conf: string): Promise<void> {
    const parsed = parseAwgConf(conf);
    const configHash = hashAwgConf(conf);
    if (configHash === this.configHash && this.go && !this.applyError) {
      return;
    }
    await this.teardown();
    this.parsed = parsed;
    this.configHash = configHash;
    const resolvBefore = await readFile(RESOLV_PATH, "utf8").catch(() => "");
    await writeFile(CONF_PATH, renderSetconf(parsed), { mode: 0o600 });
    const child = spawn("amneziawg-go", ["-f", IFACE], {
      env: { ...process.env, LOG_LEVEL: "error", WG_PROCESS_FOREGROUND: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.go = child;
    child.stderr?.on("data", () => undefined);
    child.on("error", () => {
      if (this.go === child) {
        this.go = null;
        this.applyError = "В контейнере нет клиента AmneziaWG";
      }
    });
    child.on("exit", () => {
      if (this.go === child) {
        this.go = null;
        if (!this.stopping && !this.applyError) {
          this.applyError = "Процесс AmneziaWG остановился";
        }
      }
    });
    try {
      await this.waitForLink();
      const set = await run("awg", ["setconf", IFACE, CONF_PATH]);
      if (set.code !== 0) {
        throw new Error("Не удалось применить конфиг AmneziaWG");
      }
      for (const address of parsed.addresses) {
        const added = await run("ip", ["addr", "add", address, "dev", IFACE]);
        if (added.code !== 0) {
          throw new Error("Не удалось назначить адрес интерфейса AmneziaWG");
        }
      }
      const up = await run("ip", ["link", "set", "dev", IFACE, "mtu", String(parsed.mtu), "up"]);
      if (up.code !== 0) {
        throw new Error("Не удалось поднять интерфейс AmneziaWG");
      }
      await this.assertDirectPath(resolvBefore);
      this.applyError = null;
      await this.refreshEndpoint(true);
      await this.installDnsRoute();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось применить конфиг AmneziaWG";
      this.applyError = message;
      await this.teardown();
      throw new Error(message);
    }
  }

  async clear(): Promise<void> {
    await this.teardown();
    this.parsed = null;
    this.configHash = null;
    this.applyError = null;
    this.endpointIps = [];
  }

  async replaceRoutes(hosts: string[]): Promise<HostRouteResult[]> {
    this.requireUp();
    await this.refreshEndpoint(false);
    const keep = new Set<string>();
    const dns = privateDnsRoute(this.parsed!, this.endpointIps);
    if (dns) {
      await this.addRoute(dns, isIP(dns) === 6 ? 128 : 32);
      keep.add(dns);
    }
    const results: HostRouteResult[] = [];
    for (const host of hosts) {
      try {
        const ip = await this.prepareUnlocked(host);
        keep.add(ip);
        results.push({ host, ip });
      } catch (error) {
        results.push({ host, error: error instanceof Error ? error.message : "Нет маршрута до узла через AmneziaWG" });
      }
    }
    for (const ip of [...this.routes.keys()]) {
      if (!keep.has(ip)) {
        await this.deleteRoute(ip);
      }
    }
    return results;
  }

  async prepare(host: string): Promise<string> {
    this.requireUp();
    await this.refreshEndpoint(false);
    return this.prepareUnlocked(host);
  }

  async tcpCheck(host: string, port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Некорректный порт");
    }
    const ip = await this.prepare(host);
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: ip, port, timeout: 5_000 });
      const fail = () => {
        socket.destroy();
        reject(new Error("Узел не отвечает через AmneziaWG"));
      };
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("timeout", fail);
      socket.once("error", fail);
    });
    return ip;
  }

  async icmp(host: string): Promise<number | null> {
    const ip = await this.prepare(host);
    const family = isIP(ip) === 6 ? "-6" : "-4";
    const result = await run("ping", [family, "-c", "1", "-W", "2", "-n", ip]);
    const match = result.stdout.match(/time[=<]([0-9.]+)/);
    if (result.code !== 0 || !match) {
      return null;
    }
    return Math.round(Number(match[1]));
  }

  async status(): Promise<TunnelStatus> {
    const base: TunnelStatus = {
      up: false,
      handshakeAt: null,
      endpoint: null,
      rx: 0,
      tx: 0,
      version: this.version,
      configHash: this.configHash,
      applyError: this.applyError,
    };
    if (!this.go || !this.parsed) {
      return base;
    }
    const show = await run("awg", ["show", IFACE, "dump"]);
    if (show.code !== 0) {
      return { ...base, applyError: this.applyError ?? "Туннель AmneziaWG не поднят" };
    }
    const peer = show.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[1];
    if (!peer) {
      return { ...base, up: true };
    }
    const columns = peer.split("\t");
    const handshake = Number(columns[4]);
    const rx = Number(columns[5]);
    const tx = Number(columns[6]);
    const endpoint = columns[2] && columns[2] !== "(none)" ? columns[2] : null;
    return {
      ...base,
      up: true,
      handshakeAt: Number.isFinite(handshake) && handshake > 0 ? handshake : null,
      endpoint,
      rx: Number.isFinite(rx) ? rx : 0,
      tx: Number.isFinite(tx) ? tx : 0,
    };
  }

  private requireUp() {
    if (!this.parsed || !this.go || this.applyError) {
      throw new Error(this.applyError ?? "Туннель AmneziaWG не поднят");
    }
  }

  private async prepareUnlocked(host: string): Promise<string> {
    const choice = chooseRouteIp({
      resolved: await resolveAll(host),
      endpointIps: this.endpointIps,
      allowedIps: this.parsed!.allowedIps,
      families: addressFamilies(this.parsed!.addresses),
    });
    if (!choice.ok) {
      throw new Error(choice.error);
    }
    await this.addRoute(choice.ip, choice.prefix);
    return choice.ip;
  }

  private async installDnsRoute() {
    if (!this.parsed) {
      return;
    }
    await this.refreshEndpoint(true);
    const dns = privateDnsRoute(this.parsed, this.endpointIps);
    if (!dns) {
      return;
    }
    await this.addRoute(dns, isIP(dns) === 6 ? 128 : 32);
  }

  private async addRoute(ip: string, prefix: 32 | 128) {
    if (this.endpointIps.includes(ip)) {
      throw new Error("Адрес узла совпадает с endpoint туннеля");
    }
    const added = await run("ip", ["route", "replace", `${ip}/${prefix}`, "dev", IFACE]);
    if (added.code !== 0) {
      throw new Error("Не удалось добавить маршрут через AmneziaWG");
    }
    this.routes.set(ip, prefix);
  }

  private async deleteRoute(ip: string) {
    const prefix = this.routes.get(ip);
    if (!prefix) {
      return;
    }
    await run("ip", ["route", "del", `${ip}/${prefix}`, "dev", IFACE]);
    this.routes.delete(ip);
  }

  private async refreshEndpoint(force: boolean) {
    if (!this.parsed) {
      return;
    }
    if (!force && Date.now() - this.endpointResolvedAt < 5_000) {
      return;
    }
    this.endpointIps = await resolveAll(this.parsed.endpointHost);
    this.endpointResolvedAt = Date.now();
  }

  private async waitForLink() {
    const started = Date.now();
    while (Date.now() - started < 5_000) {
      if (!this.go) {
        throw new Error("Процесс AmneziaWG остановился");
      }
      const link = await run("ip", ["link", "show", IFACE]);
      if (link.code === 0) {
        return;
      }
      await sleep(100);
    }
    throw new Error("Интерфейс awg0 не поднялся");
  }

  private async assertDirectPath(resolvBefore: string) {
    const v4 = await run("ip", ["-4", "route", "show", "default"]);
    const v6 = await run("ip", ["-6", "route", "show", "default"]);
    if (`${v4.stdout}\n${v6.stdout}`.includes(`dev ${IFACE}`)) {
      throw new Error("Конфиг пытается направить весь трафик в туннель");
    }
    const resolv = await readFile(RESOLV_PATH, "utf8").catch(() => "");
    if (resolv !== resolvBefore) {
      throw new Error("Конфиг подменяет DNS контейнера");
    }
    for (const command of ["iptables", "ip6tables"]) {
      const rules = await run(command, ["-S"]);
      if (rules.code === 0 && rules.stdout.includes(IFACE)) {
        throw new Error("Конфиг ставит firewall-правила на туннель");
      }
    }
  }

  private async teardown() {
    this.stopping = true;
    const child = this.go;
    this.go = null;
    if (child) {
      child.kill("SIGTERM");
    }
    await run("ip", ["link", "del", IFACE]);
    this.routes.clear();
    this.stopping = false;
  }
}
