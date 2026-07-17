# Two-worker message broker

A dependency-free Node.js back end that coordinates two allow-listed workers in repeating rounds.

## Run

Requires Node.js 20 or newer.

```bash
ALLOWED_WORKER_IDS=worker-1,worker-2 npm start
```

PowerShell:

```powershell
$env:ALLOWED_WORKER_IDS="worker-1,worker-2"
npm.cmd start
```

The server listens on port `3000` by default. Set `PORT` to use another port.

## Endpoints

### 1. Submit completed work

```http
POST /completed
Content-Type: application/json

{"id":"worker-1"}
```

The first allowed worker receives `status: "waiting"`. When the other allowed ID submits, the service repeatedly calls the configured IP-reset URL. It retries unsuccessful results, HTTP errors, invalid responses, and network errors. Repeating a worker submission is safe and does not count that worker twice. Unknown IDs receive HTTP `403`.

Render logs identify every accepted, duplicate, or rejected submission with its worker ID and round. Round completion and failure are logged as well.

### 2. Poll status

```http
GET /status?id=worker-1
```

This returns `status: "waiting"` while the service is waiting for the other worker and while the reset request is retrying. It returns `status: "completed"` only after the reset endpoint returns JSON with `{"result":"success"}`. At that point, new submissions go into the next round.

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

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_WORKER_IDS` | Required | Exactly two comma-separated IDs, for example `worker-1,worker-2` |
| `REFRESH_URL` | `http://g5ip.com:4128/apix/reset_ip_secure?hash=2da19977945b` | IP-reset endpoint |
| `RETRY_DELAY_MS` | `2000` | Delay between attempts |
| `REQUEST_TIMEOUT_MS` | `10000` | Timeout for each request |

This implementation keeps coordination state in memory. Restarting the process resets the current round.
