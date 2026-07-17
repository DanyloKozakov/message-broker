import http from "node:http";
import { WorkerCoordinator } from "./coordinator.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function hasId(value) {
  return value !== undefined && value !== null && String(value).length > 0;
}

export function createApp({ handler }) {
  const coordinator = new WorkerCoordinator({ handler });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "POST" && url.pathname === "/completed") {
        const body = await readJson(request);
        if (!hasId(body.id)) {
          sendJson(response, 400, { error: "id is required" });
          return;
        }

        const result = coordinator.submit(body.id);
        sendJson(response, result.accepted === false ? 409 : 202, result);
        return;
      }

      if (request.method === "GET" && url.pathname === "/status") {
        const id = url.searchParams.get("id");
        if (!hasId(id)) {
          sendJson(response, 400, { error: "id is required" });
          return;
        }

        sendJson(response, 200, coordinator.getStatus(id));
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const isBadRequest = error instanceof SyntaxError || error.message === "Request body is too large";
      sendJson(response, isBadRequest ? 400 : 500, {
        error: isBadRequest ? error.message : "Internal server error"
      });
    }
  });
}
