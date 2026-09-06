import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertReadOnlyCommand,
  awgPollCommand,
  dockerInspectCommand,
  dockerPsAllCommand,
  dockerPsCommand,
  isAllowedContainerName,
  isForbiddenCommand,
} from "./commands";

test("accepts official awg container names", () => {
  assert.equal(isAllowedContainerName("amnezia-awg2"), true);
  assert.equal(isAllowedContainerName("amnezia-awg"), true);
  assert.equal(isAllowedContainerName("amnezia-awg2-old"), true);
  assert.equal(isAllowedContainerName("amnezia-openvpn"), false);
  assert.equal(isAllowedContainerName("amnezia-awg; rm -rf /"), false);
});

test("poll command is read-only and uses non-secret selectors", () => {
  const command = awgPollCommand("sudo -n docker", "amnezia-awg2");
  assert.match(command, /awg show all transfer/);
  assert.match(command, /awg show all latest-handshakes/);
  assert.ok(
    command.indexOf("awg show all endpoints") > command.indexOf("awg show all transfer"),
    "endpoints must be read after handshake and transfer",
  );
  assert.match(command, /awg show all content-padding-addition/);
  assert.match(command, /clientsTable/);
  assert.equal(command.includes("dump"), false);
  assert.equal(command.includes("private-key"), false);
  assert.equal(command.includes("header-protection-key"), false);
  assert.equal(command.includes("awg0.conf"), false);
  assert.equal(command.includes("i1"), false);
  assert.equal(command.includes("jc"), false);
  assert.doesNotThrow(() => assertReadOnlyCommand(command));
});

test("inspect command is read-only and asks for health fields", () => {
  const command = dockerInspectCommand("docker", "amnezia-awg2");
  assert.match(command, /State\.Running/);
  assert.match(command, /State\.StartedAt/);
  assert.match(command, /RestartCount/);
  assert.match(command, /NetworkSettings\.Ports/);
  assert.doesNotThrow(() => assertReadOnlyCommand(command));
});

test("rejects write and secret commands", () => {
  assert.equal(isForbiddenCommand("awg set awg0 peer AAAA"), true);
  assert.equal(isForbiddenCommand("awg syncconf awg0"), true);
  assert.equal(isForbiddenCommand("docker exec amnezia-awg2 awg show all dump"), true);
  assert.equal(isForbiddenCommand("docker exec amnezia-awg2 cat /opt/amnezia/awg/awg0.conf"), true);
  assert.equal(isForbiddenCommand("docker restart amnezia-awg2"), true);
  assert.equal(isForbiddenCommand("docker exec x awg show all private-key"), true);
  assert.equal(isForbiddenCommand("docker exec x awg show all header-protection-key"), true);
  assert.doesNotThrow(() => assertReadOnlyCommand(dockerPsCommand("docker")));
  assert.doesNotThrow(() => assertReadOnlyCommand(dockerPsAllCommand("sudo -n docker")));
  assert.doesNotThrow(() => assertReadOnlyCommand(dockerInspectCommand("docker", "amnezia-awg2")));
});

test("rejects unsafe container names in builders", () => {
  assert.throws(() => awgPollCommand("docker", "amnezia-awg2; reboot"));
  assert.throws(() => dockerInspectCommand("docker", "../etc"));
});

test("exporter-style dump command stays forbidden", () => {
  assert.equal(isForbiddenCommand("awg show all dump"), true);
  assert.equal(isForbiddenCommand("docker exec amnezia-awg2 bash -c 'awg show all dump'"), true);
});
