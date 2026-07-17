const DEFAULT_REFRESH_URL = "http://g5ip.com:4128/apix/reset_ip_secure?hash=2da19977945b";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createRefreshHandler({
  refreshUrl = DEFAULT_REFRESH_URL,
  retryDelayMs = 2_000,
  requestTimeoutMs = 60_000,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  logger = console
} = {}) {
  return async function handleCompletedRound({ round, workerIds }) {
    let attempt = 0;

    logger.log(`Both workers finished round ${round}: ${workerIds.join(", ")}`);

    while (true) {
      attempt += 1;

      try {
        const response = await fetchImpl(refreshUrl, {
          method: "GET",
          signal: AbortSignal.timeout(requestTimeoutMs)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data?.result === "success") {
          logger.log(`IP reset succeeded for round ${round} after ${attempt} attempt(s)`);
          return;
        }

        logger.warn(`IP reset attempt ${attempt} returned no success; retrying`);
      } catch (error) {
        logger.warn(`IP reset attempt ${attempt} failed: ${error.message}; retrying`);
      }

      await sleep(retryDelayMs);
    }
  };
}

export const handleCompletedRound = createRefreshHandler({
  refreshUrl: process.env.REFRESH_URL ?? DEFAULT_REFRESH_URL,
  retryDelayMs: positiveNumber(process.env.RETRY_DELAY_MS, 2_000),
  requestTimeoutMs: positiveNumber(process.env.REQUEST_TIMEOUT_MS, 10_000)
});
