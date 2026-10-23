import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { EngineError } from "../engine/errors.js";
import { createHttpApi } from "./http-api.js";

function fakeEngine() {
  const calls = [];
  const record = (name, result) => {
    return (...args) => {
      calls.push({
        name,
        args,
      });
      return typeof result === "function" ? result(...args) : result;
    };
  };
  return {
    calls,
    assign: record("assign", {
      id: "w1",
      eventId: "e1",
    }),
    decide: record("decide", {
      eventId: "e2",
    }),
    archive: record("archive", {
      eventId: "e3",
    }),
    getWork: record("getWork", (id) => {
      return {
        id,
        title: "T",
      };
    }),
    listWorks: record("listWorks", [
      {
        id: "a",
      },
      {
        id: "b",
      },
    ]),
  };
}

// A POST says that its body is JSON, as the MCP client does. `headers` adds
// or replaces headers; a header set to null is not sent.
function send(port, method, path, body, headers = {}) {
  const all = {
    ...(method === "POST"
      ? {
          "content-type": "application/json",
        }
      : {}),
    ...headers,
  };
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        agent: false,
        headers: Object.fromEntries(
          Object.entries(all).filter(([, value]) => value !== null),
        ),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode,
            type: res.headers["content-type"],
            body: text === "" ? undefined : JSON.parse(text),
          });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("http api", () => {
  let engine;
  let api;
  let port;

  beforeEach(async () => {
    engine = fakeEngine();
    api = createHttpApi({
      engine,
    });
    ({ port } = await api.listen(0));
  });

  afterEach(async () => {
    await api.close();
  });

  test("listens on 127.0.0.1 with the real port", async () => {
    assert.ok(port > 0);
    const res = await send(port, "GET", "/works");
    assert.equal(res.status, 200);
  });

  test("POST /works calls assign and answers 202", async () => {
    const res = await send(
      port,
      "POST",
      "/works",
      JSON.stringify({
        workflow: "w",
        title: "t",
      }),
    );
    assert.equal(res.status, 202);
    assert.equal(res.type, "application/json");
    assert.deepEqual(res.body, {
      id: "w1",
      eventId: "e1",
    });
    assert.deepEqual(engine.calls, [
      {
        name: "assign",
        args: [
          {
            workflow: "w",
            title: "t",
          },
        ],
      },
    ]);
  });

  test("POST decision calls decide with the id and decision", async () => {
    const res = await send(
      port,
      "POST",
      "/works/w1/decision",
      JSON.stringify({
        decision: "approve",
      }),
    );
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, {
      eventId: "e2",
    });
    assert.deepEqual(engine.calls, [
      {
        name: "decide",
        args: ["w1", "approve"],
      },
    ]);
  });

  test("a decision that is not approve or reject is 400", async () => {
    for (const body of [
      {
        decision: "maybe",
      },
      {},
      {
        decision: 1,
      },
      null,
      [],
    ]) {
      const res = await send(
        port,
        "POST",
        "/works/w1/decision",
        JSON.stringify(body),
      );
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, "string");
    }
    assert.deepEqual(engine.calls, []);
  });

  test("POST archive works with an empty body", async () => {
    const res = await send(port, "POST", "/works/w1/archive");
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, {
      eventId: "e3",
    });
    assert.deepEqual(engine.calls, [
      {
        name: "archive",
        args: ["w1"],
      },
    ]);
  });

  test("GET /works/{id} calls getWork and answers 200", async () => {
    const res = await send(port, "GET", "/works/w1");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      id: "w1",
      title: "T",
    });
    assert.deepEqual(engine.calls, [
      {
        name: "getWork",
        args: ["w1"],
      },
    ]);
  });

  test("GET /works calls listWorks and answers 200", async () => {
    const res = await send(port, "GET", "/works");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [
      {
        id: "a",
      },
      {
        id: "b",
      },
    ]);
    assert.deepEqual(engine.calls, [
      {
        name: "listWorks",
        args: [],
      },
    ]);
  });

  test("each EngineError code gives its status", async () => {
    const cases = {
      invalid: 400,
      "not-found": 404,
      conflict: 409,
      unavailable: 503,
    };
    for (const [code, status] of Object.entries(cases)) {
      engine.getWork = () => {
        throw new EngineError(code, `msg ${code}`);
      };
      const res = await send(port, "GET", "/works/w1");
      assert.equal(res.status, status);
      assert.equal(res.type, "application/json");
      assert.deepEqual(res.body, {
        error: `msg ${code}`,
      });
    }
  });

  test("an async rejection of the engine is mapped too", async () => {
    engine.getWork = async () => {
      throw new EngineError("not-found", "no such work");
    };
    const res = await send(port, "GET", "/works/w1");
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, {
      error: "no such work",
    });
  });

  test("an error that is not an EngineError is 500 and logged", async () => {
    const spy = mock.method(console, "error", () => {});
    try {
      engine.listWorks = () => {
        throw new Error("secret detail");
      };
      const res = await send(port, "GET", "/works");
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        error: "internal error",
      });
      assert.equal(spy.mock.callCount(), 1);
    } finally {
      spy.mock.restore();
    }
  });

  test("a body that is not JSON is 400 and the engine is not called", async () => {
    const res = await send(port, "POST", "/works", "{nope");
    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, "string");
    const empty = await send(port, "POST", "/works");
    assert.equal(empty.status, 400);
    assert.deepEqual(engine.calls, []);
  });

  test("a body over 1 MB is 413", async () => {
    const big = JSON.stringify({
      title: "x".repeat(1024 * 1024 + 10),
    });
    const res = await send(port, "POST", "/works", big).catch((e) => {
      return {
        status: e.code,
      };
    });
    // The server may close the socket after the answer; accept either.
    assert.ok(res.status === 413 || res.status === "ECONNRESET");
    assert.deepEqual(engine.calls, []);
  });

  test("a path id that is not a slug is 404 and never reaches the engine", async () => {
    const paths = [
      "/works/..%2Fx",
      "/works/%E0%A4%A",
      "/works/Bad_Id",
      "/works/..",
      "/works/a%2Fb/archive",
    ];
    for (const path of paths) {
      const method = path.endsWith("archive") ? "POST" : "GET";
      const res = await send(port, method, path);
      assert.equal(res.status, 404, path);
      assert.equal(typeof res.body.error, "string");
    }
    const decision = await send(
      port,
      "POST",
      "/works/..%2Fx/decision",
      JSON.stringify({
        decision: "approve",
      }),
    );
    assert.equal(decision.status, 404);
    assert.deepEqual(engine.calls, []);
  });

  test("an unknown path or method is 404", async () => {
    for (const [method, path] of [
      ["GET", "/nope"],
      ["DELETE", "/works/w1"],
      ["PUT", "/works"],
      ["GET", "/works/w1/decision"],
      ["POST", "/works/w1"],
      ["POST", "/works/w1/other"],
      ["GET", "/works/w1/archive/x"],
    ]) {
      const res = await send(port, method, path);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.type, "application/json");
    }
    assert.deepEqual(engine.calls, []);
  });

  test("a POST whose body is not said to be JSON is 415 and the engine is not called", async () => {
    for (const type of [
      null,
      "text/plain",
      "application/x-www-form-urlencoded",
    ]) {
      for (const path of [
        "/works",
        "/works/w1/decision",
        "/works/w1/archive",
      ]) {
        const res = await send(port, "POST", path, "{}", {
          "content-type": type,
        });
        assert.equal(res.status, 415, `${type} ${path}`);
        assert.equal(typeof res.body.error, "string");
      }
    }
    assert.deepEqual(engine.calls, []);
  });

  test("a content-type of JSON with parameters is accepted", async () => {
    const res = await send(
      port,
      "POST",
      "/works/w1/decision",
      JSON.stringify({
        decision: "reject",
      }),
      {
        "content-type": "Application/JSON; charset=utf-8",
      },
    );
    assert.equal(res.status, 202);
  });

  test("GET /ready answers 200 and never calls the engine", async () => {
    const res = await send(port, "GET", "/ready");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      status: "ready",
    });
    assert.equal((await send(port, "POST", "/ready")).status, 404);
    assert.equal((await send(port, "GET", "/ready/x")).status, 404);
    assert.deepEqual(engine.calls, []);
  });

  test("a Host that is not this server is 403 and the engine is not called", async () => {
    for (const host of [
      "evil.example",
      `evil.example:${port}`,
      `127.0.0.1:${port + 1}`,
      "127.0.0.1",
      `localhost.evil.example:${port}`,
    ]) {
      for (const [method, path] of [
        ["GET", "/ready"],
        ["GET", "/works"],
        ["GET", "/works/w1"],
        ["POST", "/works/w1/archive"],
      ]) {
        const res = await send(port, method, path, undefined, {
          host,
        });
        assert.equal(res.status, 403, `${host} ${method} ${path}`);
      }
    }
    assert.deepEqual(engine.calls, []);
  });

  test("a Host of 127.0.0.1 or localhost with the port is accepted", async () => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      const res = await send(port, "GET", "/works", undefined, {
        host,
      });
      assert.equal(res.status, 200, host);
    }
  });

  test("close resolves even with an idle keep-alive connection", async () => {
    const agent = new http.Agent({
      keepAlive: true,
    });
    await new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port,
            path: "/works",
            agent,
          },
          (res) => {
            res.resume();
            res.on("end", resolve);
          },
        )
        .on("error", reject);
    });
    await api.close();
    agent.destroy();
    api = createHttpApi({
      engine,
    });
    ({ port } = await api.listen(0));
  });
});
