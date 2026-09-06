import assert from "node:assert/strict";
import { test } from "node:test";

import { isForbiddenCommand } from "./commands";

test("exporter-style dump command stays forbidden", () => {
  assert.equal(isForbiddenCommand("awg show all dump"), true);
  assert.equal(isForbiddenCommand("docker exec amnezia-awg2 bash -c 'awg show all dump'"), true);
});
