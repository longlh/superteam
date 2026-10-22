import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApiClient } from "./client.js";

async function listen(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        type: req.headers["content-type"],
        raw,
      });
      handler(res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    seen,
    port: server.address().port,
  };
}

test("sends JSON and parses a JSON answer", async () => {
  const { server, seen, port } = await listen((res) => {
    res.writeHead(202, {
      "content-type": "application/json",
    });
    res.end(
      JSON.stringify({
        eventId: "e1",
      }),
    );
  });
  try {
    const client = createApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
    });
    const result = await client.request("POST", "/works", {
      title: "T",
    });
    assert.deepEqual(result, {
      status: 202,
      body: {
        eventId: "e1",
      },
    });
    assert.deepEqual(seen, [
      {
        method: "POST",
        url: "/works",
        type: "application/json",
        raw: '{"title":"T"}',
      },
    ]);
  } finally {
    server.close();
  }
});

test("sends no body and no content-type on a GET, and keeps a text answer", async () => {
  const { server, seen, port } = await listen((res) => {
    res.writeHead(409, {
      "content-type": "text/plain",
    });
    res.end("conflict");
  });
  try {
    const client = createApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
    });
    const result = await client.request("GET", "/works/w");
    assert.deepEqual(result, {
      status: 409,
      body: "conflict",
    });
    assert.equal(seen[0].type, undefined);
    assert.equal(seen[0].raw, "");
  } finally {
    server.close();
  }
});

test("a POST with no body still says that it is JSON", async () => {
  const { server, seen, port } = await listen((res) => {
    res.writeHead(202, {
      "content-type": "application/json",
    });
    res.end("{}");
  });
  try {
    const client = createApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
    });
    await client.request("POST", "/works/w/archive");
    assert.equal(seen[0].type, "application/json");
    assert.equal(seen[0].raw, "");
  } finally {
    server.close();
  }
});

test("a refused connection says that the orchestrator is not running", async () => {
  const { server, port } = await listen(() => {});
  await new Promise((resolve) => server.close(resolve));
  const client = createApiClient({
    baseUrl: `http://127.0.0.1:${port}`,
  });
  await assert.rejects(client.request("GET", "/works"), (error) => {
    assert.match(
      error.message,
      /superteam orchestrator is not running on 127\.0\.0\.1:/,
    );
    assert.ok(error.message.includes(String(port)));
    assert.match(error.message, /\/superteam:start/);
    return true;
  });
});
