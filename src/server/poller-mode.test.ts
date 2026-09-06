import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldRunInProcessPoller } from "./poller-mode";

test("production stays silent unless GATE_RUN_POLLER=1", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousFlag = process.env.GATE_RUN_POLLER;
  process.env.NODE_ENV = "production";
  delete process.env.GATE_RUN_POLLER;
  assert.equal(shouldRunInProcessPoller(), false);
  process.env.GATE_RUN_POLLER = "1";
  assert.equal(shouldRunInProcessPoller(), true);
  process.env.GATE_RUN_POLLER = "0";
  assert.equal(shouldRunInProcessPoller(), false);
  process.env.NODE_ENV = previousEnv;
  if (previousFlag === undefined) {
    delete process.env.GATE_RUN_POLLER;
  } else {
    process.env.GATE_RUN_POLLER = previousFlag;
  }
});

test("development starts the in-process poller by default", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousFlag = process.env.GATE_RUN_POLLER;
  process.env.NODE_ENV = "development";
  delete process.env.GATE_RUN_POLLER;
  assert.equal(shouldRunInProcessPoller(), true);
  process.env.NODE_ENV = previousEnv;
  if (previousFlag === undefined) {
    delete process.env.GATE_RUN_POLLER;
  } else {
    process.env.GATE_RUN_POLLER = previousFlag;
  }
});
