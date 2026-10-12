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
  sameIp,
  type ParsedAwgConf,
} from "@/lib/awg/conf";
import { isSafeProbeHost } from "@/lib/net/probe-host";
import {
  chooseRouteIp,
  deletionPlan,
  hostKeepDecision,
  kernelSnapshotUsable,
  parseIfaceRoutes,
  privateDnsRoute,
  visibleAwgRoutes,
  type AwgListedRoute,
  type ShownRoute,
} from "@/lib/awg/routes";

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

const OUTPUT_LIMIT = 64_000;

type CommandResult = { code: number; stdout: string; stderr: string; truncated: boolean };

function run(command: string, args: string[], timeoutMs = 8_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const capture = (current: string, chunk: Buffer, limitStdout: boolean) => {
      const next = current + chunk.toString("utf8");
      if (next.length <= OUTPUT_LIMIT) {
        return next;
      }
      if (limitStdout) {
        truncated = true;
      }
      return next.slice(0, OUTPUT_LIMIT);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = capture(stdout, chunk, true);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = capture(stderr, chunk, false);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr, truncated });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, truncated });
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
  private readonly nodeBindings = new Map<string, string>();
  private dnsBinding: string | null = null;
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
    const keep: string[] = [];
    const nextNodes = new Map<string, string>();
    let nextDns: string | null = null;
    let sweep = true;

    const dns = privateDnsRoute(this.parsed!, this.endpointIps);
    if (dns) {
      const installed = await this.installKnown(dns, isIP(dns) === 6 ? 128 : 32);
      const previous = this.dnsBinding;
      if (installed) {
        keep.push(dns);
        nextDns = dns;
      } else if (previous && this.hasTracked(previous)) {
        keep.push(previous);
        nextDns = previous;
        sweep = false;
      } else {
        sweep = false;
      }
    }

    const results: HostRouteResult[] = [];
    for (const host of hosts) {
      const resolved = await resolveAll(host);
      const previous = this.nodeBindings.get(host) ?? null;
      const havePreviousRoute = previous !== null && this.hasTracked(previous);
      const choice =
        resolved.length > 0
          ? chooseRouteIp({
              resolved,
              endpointIps: this.endpointIps,
              allowedIps: this.parsed!.allowedIps,
              families: addressFamilies(this.parsed!.addresses),
              previousIp: previous,
            })
          : null;
      const installed = choice?.ok ? await this.installKnown(choice.ip, choice.prefix) : false;
      const decision = hostKeepDecision({
        previousIp: previous,
        havePreviousRoute,
        resolved,
        allowedChoice: choice,
        installed,
      });
      if (decision.sweepUnsafe) {
        sweep = false;
      }
      if (decision.keepIp) {
        keep.push(decision.keepIp);
        nextNodes.set(host, decision.keepIp);
      }
      results.push(
        decision.keepIp
          ? decision.error
            ? { host, ip: decision.keepIp, error: decision.error }
            : { host, ip: decision.keepIp }
          : { host, error: decision.error ?? "Нет маршрута до узла через AmneziaWG" },
      );
    }

    const snapshot = sweep ? await this.readKernelRoutes() : null;
    if (snapshot && !snapshot.ok) {
      sweep = false;
    }
    const plan = deletionPlan({
      keep,
      tracked: [...this.routes.keys()],
      shown: snapshot?.ok ? snapshot.routes : null,
      ownAddresses: this.parsed!.addresses,
      sweep: sweep && snapshot?.ok === true,
    });
    for (const ip of plan.tracked) {
      const removed = await this.deleteTracked(ip);
      if (removed) {
        console.info(`[awg] removed route ${ip}`);
      }
    }
    for (const route of plan.kernel) {
      const removed = await this.deleteUntracked(route.ip, route.prefix);
      if (removed) {
        console.info(`[awg] removed route ${route.ip}`);
      }
    }
    if (!sweep) {
      console.warn("[awg] skip stale route sweep");
    }

    this.nodeBindings.clear();
    for (const [host, ip] of nextNodes) {
      if (this.hasTracked(ip)) {
        this.nodeBindings.set(host, ip);
      }
    }
    this.dnsBinding = nextDns && this.hasTracked(nextDns) ? nextDns : null;
    return results;
  }

  async listRoutes(): Promise<{ up: true; routes: AwgListedRoute[] } | { up: false }> {
    if (!this.parsed || !this.go || this.applyError) {
      return { up: false };
    }
    const snapshot = await this.readKernelRoutes();
    if (!snapshot.ok) {
      throw new Error("Не удалось прочитать маршруты AmneziaWG");
    }
    return {
      up: true,
      routes: visibleAwgRoutes({
        shown: snapshot.routes,
        ownAddresses: this.parsed.addresses,
        bindings: this.bindingList(),
      }).map(({ host, ip, dns }) => ({ host, ip, dns })),
    };
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
    this.nodeBindings.set(host, choice.ip);
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
    this.dnsBinding = dns;
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

  private hasTracked(ip: string): boolean {
    for (const key of this.routes.keys()) {
      if (sameIp(key, ip)) {
        return true;
      }
    }
    return false;
  }

  private async installKnown(ip: string, prefix: 32 | 128): Promise<boolean> {
    try {
      await this.addRoute(ip, prefix);
      return true;
    } catch {
      return false;
    }
  }

  private async readKernelRoutes(): Promise<{ ok: true; routes: ShownRoute[] } | { ok: false }> {
    const shown = await run("ip", ["-o", "route", "show", "dev", IFACE]);
    if (!kernelSnapshotUsable(shown)) {
      return { ok: false };
    }
    return { ok: true, routes: parseIfaceRoutes(shown.stdout) };
  }

  private bindingList(): AwgListedRoute[] {
    const bindings: AwgListedRoute[] = [];
    if (this.dnsBinding && this.hasTracked(this.dnsBinding)) {
      bindings.push({ host: this.dnsBinding, ip: this.dnsBinding, dns: true });
    }
    for (const [host, ip] of this.nodeBindings) {
      if (this.hasTracked(ip)) {
        bindings.push({ host, ip, dns: false });
      }
    }
    return bindings;
  }

  private async deleteTracked(ip: string): Promise<boolean> {
    const prefix = this.prefixFor(ip);
    if (!prefix) {
      return false;
    }
    const removed = await this.deleteKernel(ip, prefix);
    if (!removed) {
      return false;
    }
    for (const key of [...this.routes.keys()]) {
      if (sameIp(key, ip)) {
        this.routes.delete(key);
      }
    }
    return true;
  }

  private async deleteUntracked(ip: string, prefix: 32 | 128): Promise<boolean> {
    return this.deleteKernel(ip, prefix);
  }

  private prefixFor(ip: string): 32 | 128 | null {
    for (const [key, prefix] of this.routes) {
      if (sameIp(key, ip)) {
        return prefix;
      }
    }
    return null;
  }

  private async deleteKernel(ip: string, prefix: 32 | 128): Promise<boolean> {
    const deleted = await run("ip", ["route", "del", `${ip}/${prefix}`, "dev", IFACE]);
    if (deleted.code === 0 || deleted.stderr.includes("No such process")) {
      return true;
    }
    console.error(`[awg] route delete failed ${ip}/${prefix}: ${deleted.stderr.trim() || deleted.code}`);
    return false;
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
    this.nodeBindings.clear();
    this.dnsBinding = null;
    this.stopping = false;
  }
}
