import { createApp } from "./app.js";
import { handleCompletedRound } from "./handler.js";

const port = Number(process.env.PORT ?? 3000);
const server = createApp({ handler: handleCompletedRound });

server.listen(port, () => {
  console.log(`Worker coordinator listening on http://localhost:${port}`);
});
