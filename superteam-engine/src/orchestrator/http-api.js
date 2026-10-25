import http from "node:http";
import { EngineError } from "../engine/errors.js";
import { isSlug } from "../lib/storage/ids.js";

const BODY_LIMIT = 1024 * 1024;
const STATUS_OF_CODE = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  unavailable: 503,
};

// The only door of the system: each request is one call of a function of the
// engine. The API maps the answers and the errors to HTTP, and holds no logic.
export function createHttpApi({ engine }) {
  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => {
        checkOrigin(req, server.address().port);
        return handle(engine, req, res);
      })
      .catch((error) => {
        reply(res, ...errorAnswer(error));
      });
  });

  return {
    listen(port) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve({
            port: server.address().port,
          });
        });
      });
    },
    // An API that is not open, such as on a stop during the start, is closed.
    close() {
      if (!server.listening) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        server.close((error) => {
          return error ? reject(error) : resolve();
        });
        server.closeIdleConnections();
      });
    },
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A web page can send a request to 127.0.0.1 too. A Host that is not this
// server is refused (DNS rebinding), and so is a POST that does not say its
// body is JSON: a page can send such a POST with no preflight (CSRF).
function checkOrigin(req, port) {
  const host = (req.headers.host ?? "").toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    throw new HttpError(403, "forbidden host");
  }
  const type = (req.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (req.method === "POST" && type !== "application/json") {
    throw new HttpError(415, "the content-type must be application/json");
  }
}

async function handle(engine, req, res) {
  const parts = new URL(req.url, "http://localhost").pathname
    .split("/")
    .slice(1);
  // The API listens only at the end of the start: an answer means ready.
  if (parts.length === 1 && parts[0] === "ready" && req.method === "GET") {
    return reply(res, 200, {
      status: "ready",
      pid: process.pid,
    });
  }
  if (parts[0] !== "works" || parts.length > 3) {
    throw new HttpError(404, "not found");
  }
  const [, rawId, action] = parts;
  const { method } = req;

  if (rawId === undefined) {
    if (method === "POST") {
      const body = await readJson(req);
      return reply(res, 202, await engine.assign(body));
    }
    if (method === "GET") {
      return reply(res, 200, await engine.listWorks());
    }
    throw new HttpError(404, "not found");
  }

  const known =
    (action === undefined && method === "GET") ||
    (method === "POST" &&
      (action === "decision" || action === "archive" || action === "retry"));
  if (!known) {
    throw new HttpError(404, "not found");
  }
  const id = decodeId(rawId);

  if (action === undefined) {
    return reply(res, 200, await engine.getWork(id));
  }
  if (action === "archive") {
    return reply(res, 202, await engine.archive(id));
  }
  if (action === "retry") {
    return reply(res, 202, await engine.retry(id));
  }
  const body = await readJson(req);
  const decision = body !== null && typeof body === "object" && body.decision;
  if (decision !== "approve" && decision !== "reject") {
    throw new HttpError(400, "decision must be approve or reject");
  }
  const { reason } = body;
  if (reason !== undefined && typeof reason !== "string") {
    throw new HttpError(400, "reason must be a string");
  }
  return reply(res, 202, await engine.decide(id, decision, reason));
}

function decodeId(raw) {
  let id;
  try {
    id = decodeURIComponent(raw);
  } catch {
    throw new HttpError(404, "not found");
  }
  if (!isSlug(id)) {
    throw new HttpError(404, "not found");
  }
  return id;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.removeAllListeners("data");
        reject(new HttpError(413, "body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new HttpError(400, "body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function errorAnswer(error) {
  if (error instanceof HttpError) {
    return [
      error.status,
      {
        error: error.message,
      },
    ];
  }
  if (error instanceof EngineError) {
    return [
      STATUS_OF_CODE[error.code] ?? 500,
      {
        error: error.message,
      },
    ];
  }
  console.error(error);
  return [
    500,
    {
      error: "internal error",
    },
  ];
}

function reply(res, status, body) {
  if (res.headersSent) {
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}
