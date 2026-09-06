import assert from "node:assert/strict";
import { test } from "node:test";

import { canCommitPoll, isSshAuthError, isSshSessionRevokedError, isSshTransportError, shouldRetrySshPoll } from "./errors";
import { SshSessionRevokedError } from "./session-registry";

test("classifies keepalive and disconnect as transport", () => {
  const timeout = Object.assign(new Error("Keepalive timeout"), { level: "client-timeout" });
  assert.equal(isSshTransportError(timeout), true);
  assert.equal(isSshTransportError(new Error("Not connected")), true);
  assert.equal(isSshTransportError(new Error("SSH-команда превысила 45000 мс")), true);
  assert.equal(isSshTransportError(Object.assign(new Error("read"), { code: "ECONNRESET" })), true);
});

test("does not treat command or auth errors as transport", () => {
  const collector = Object.assign(new Error("Контейнер amnezia-awg2 не запущен"), { name: "CollectorError" });
  assert.equal(isSshTransportError(collector), false);
  const auth = Object.assign(new Error("All configured authentication methods failed"), {
    level: "client-authentication",
  });
  assert.equal(isSshAuthError(auth), true);
  assert.equal(isSshTransportError(auth), false);
});

test("retries transport once and never retries command or auth", () => {
  assert.equal(shouldRetrySshPoll(new Error("Not connected"), false), true);
  assert.equal(shouldRetrySshPoll(new Error("Not connected"), true), false);
  const collector = Object.assign(new Error("нет счётчиков"), { name: "CollectorError" });
  assert.equal(shouldRetrySshPoll(collector, false), false);
  const auth = Object.assign(new Error("Permission denied"), { level: "client-authentication" });
  assert.equal(shouldRetrySshPoll(auth, false), false);
});

test("does not treat a revoked session as transport or retryable", () => {
  const revoked = new SshSessionRevokedError();
  assert.equal(isSshSessionRevokedError(revoked), true);
  assert.equal(isSshTransportError(revoked), false);
  assert.equal(shouldRetrySshPoll(revoked, false), false);
});

test("commit is allowed only for the same live epoch", () => {
  assert.equal(canCommitPoll({ stopping: false, startedEpoch: 3, currentEpoch: 3 }), true);
  assert.equal(canCommitPoll({ stopping: false, startedEpoch: 3, currentEpoch: 4 }), false);
  assert.equal(canCommitPoll({ stopping: true, startedEpoch: 3, currentEpoch: 3 }), false);
  assert.equal(canCommitPoll({ stopping: false, startedEpoch: null, currentEpoch: 1 }), false);
});
