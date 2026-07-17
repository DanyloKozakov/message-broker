# Two-worker message broker

A dependency-free Node.js back end that coordinates two workers in repeating rounds. Worker IDs are opaque: there is no allow-list, authentication, or ID verification.

## Run

Requires Node.js 20 or newer.

```bash
npm start
```

The server listens on port `3000` by default. Set `PORT` to use another port.

## Endpoints

### 1. Submit completed work

```http
POST /completed
Content-Type: application/json

{"id":"worker-1"}
```

The first distinct worker receives `status: "waiting"`. When a second distinct ID submits, the shared handler in `src/handler.js` runs once. Repeating the same request is safe and does not count the worker twice.

### 2. Poll status

```http
GET /status?id=worker-1
```

This returns `status: "waiting"` while the service is waiting for the other worker and while the shared handler is running. It returns `status: "completed"` only after that handler resolves. At that point, new submissions go into the next round.

Example completed response:

```json
{
  "workerId": "worker-1",
  "round": 1,
  "status": "completed",
  "stage": "completed",
  "submittedWorkers": 2,
  "requiredWorkers": 2,
  "completedAt": "2026-07-18T00:00:00.000Z"
}
```

## Test

```bash
npm test
```

This implementation keeps coordination state in memory. Restarting the process resets the current round.
