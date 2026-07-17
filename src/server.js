import { createApp } from "./app.js";
import { parseAllowedWorkerIds } from "./config.js";
import { handleCompletedRound } from "./handler.js";

const port = Number(process.env.PORT ?? 3000);
const allowedWorkerIds = parseAllowedWorkerIds(process.env.ALLOWED_WORKER_IDS);
const server = createApp({ handler: handleCompletedRound, allowedWorkerIds });

server.listen(port, "0.0.0.0", () => {
  console.log(`Worker coordinator listening on port ${port}`);
});
