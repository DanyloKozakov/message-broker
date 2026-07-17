import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefreshHandler } from "../src/handler.js";

const silentLogger = {
  log() {},
  warn() {}
};

test("refresh handler retries until the API returns result success", async () => {
  const responses = [
    new Response(JSON.stringify({ result: "waiting" }), { status: 200 }),
    new Response("temporary error", { status: 503 }),
    new Response(JSON.stringify({ result: "success" }), { status: 200 })
  ];
  const requestedUrls = [];
  const delays = [];

  const handler = createRefreshHandler({
    refreshUrl: "http://example.test/reset",
    retryDelayMs: 25,
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return responses.shift();
    },
    sleep: async (milliseconds) => delays.push(milliseconds),
    logger: silentLogger
  });

  await handler({ round: 1, workerIds: ["one", "two"] });

  assert.deepEqual(requestedUrls, [
    "http://example.test/reset",
    "http://example.test/reset",
    "http://example.test/reset"
  ]);
  assert.deepEqual(delays, [25, 25]);
});

test("refresh handler retries network and invalid JSON failures", async () => {
  let attempts = 0;

  const handler = createRefreshHandler({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network unavailable");
      if (attempts === 2) return new Response("not json", { status: 200 });
      return new Response(JSON.stringify({ result: "success" }), { status: 200 });
    },
    sleep: async () => {},
    logger: silentLogger
  });

  await handler({ round: 3, workerIds: ["a", "b"] });
  assert.equal(attempts, 3);
});
