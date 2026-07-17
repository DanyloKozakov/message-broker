import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = [];
const silentLogger = {
  info() {},
  warn() {},
  error() {}
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(handler, options = {}) {
  const server = createApp({
    handler,
    allowedWorkerIds: options.allowedWorkerIds ?? ["worker-a", "worker-b"],
    logger: options.logger ?? silentLogger
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function submit(baseUrl, id) {
  return fetch(`${baseUrl}/completed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
}

test("waits for two distinct workers and for the handler to finish", async () => {
  let finishHandling;
  let handlerCalls = 0;
  const handling = new Promise((resolve) => { finishHandling = resolve; });
  const baseUrl = await start(async () => {
    handlerCalls += 1;
    await handling;
  });

  const first = await submit(baseUrl, "worker-a");
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), {
    workerId: "worker-a",
    round: 1,
    status: "waiting",
    stage: "collecting_workers",
    submittedWorkers: 1,
    requiredWorkers: 2,
    accepted: true
  });

  const duplicate = await submit(baseUrl, "worker-a");
  assert.equal((await duplicate.json()).submittedWorkers, 1);
  assert.equal(handlerCalls, 0, "a duplicate worker must not count twice");

  const second = await submit(baseUrl, "worker-b");
  assert.equal(second.status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handlerCalls, 1);

  const whileHandling = await fetch(`${baseUrl}/status?id=worker-a`);
  assert.equal((await whileHandling.json()).status, "waiting");

  finishHandling();
  await new Promise((resolve) => setImmediate(resolve));

  const completed = await fetch(`${baseUrl}/status?id=worker-a`);
  const completedBody = await completed.json();
  assert.equal(completedBody.status, "completed");
  assert.equal(completedBody.round, 1);
});

test("starts a fresh round after handling completes", async () => {
  const handledRounds = [];
  const baseUrl = await start(async ({ round }) => handledRounds.push(round));

  await submit(baseUrl, "worker-a");
  await submit(baseUrl, "worker-b");
  await new Promise((resolve) => setImmediate(resolve));

  const next = await submit(baseUrl, "worker-a");
  const nextBody = await next.json();
  assert.equal(nextBody.round, 2);
  assert.equal(nextBody.status, "waiting");
  assert.deepEqual(handledRounds, [1]);
});

test("rejects IDs outside the allow-list on both endpoints", async () => {
  const baseUrl = await start(async () => {});

  const arbitrary = await submit(baseUrl, "anything-at-all");
  assert.equal(arbitrary.status, 403);
  assert.equal((await arbitrary.json()).reason, "not_allowed");

  const status = await fetch(`${baseUrl}/status?id=anything-at-all`);
  assert.equal(status.status, 403);

  const missing = await fetch(`${baseUrl}/completed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(missing.status, 400);
});

test("logs accepted, duplicate, rejected, and completed submissions with worker IDs", async () => {
  const messages = [];
  const logger = {
    info: (message) => messages.push(message),
    warn: (message) => messages.push(message),
    error: (message) => messages.push(message)
  };
  const baseUrl = await start(async () => {}, { logger });

  await submit(baseUrl, "worker-a");
  await submit(baseUrl, "worker-a");
  await submit(baseUrl, "unknown-worker");
  await submit(baseUrl, "worker-b");
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(messages.some((message) => message.includes(
    "Worker submission accepted: workerId=worker-a round=1 submissions=1/2"
  )));
  assert.ok(messages.some((message) => message.includes(
    "Worker submission duplicate: workerId=worker-a round=1 submissions=1/2"
  )));
  assert.ok(messages.some((message) => message.includes(
    "Worker submission rejected: workerId=unknown-worker reason=not_allowed"
  )));
  assert.ok(messages.some((message) => message.includes(
    "Worker submission accepted: workerId=worker-b round=1 submissions=2/2"
  )));
  assert.ok(messages.some((message) => message.includes(
    "Round completed: round=1 workerIds=worker-a,worker-b"
  )));
});
