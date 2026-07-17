import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAllowedWorkerIds } from "../src/config.js";

test("parses exactly two unique allowed worker IDs", () => {
  assert.deepEqual(parseAllowedWorkerIds(" worker-1, worker-2 "), ["worker-1", "worker-2"]);
});

test("rejects a missing, duplicate, or incorrectly sized allow-list", () => {
  assert.throws(() => parseAllowedWorkerIds(undefined), /exactly two unique/);
  assert.throws(() => parseAllowedWorkerIds("worker-1,worker-1"), /exactly two unique/);
  assert.throws(() => parseAllowedWorkerIds("one,two,three"), /exactly two unique/);
});
