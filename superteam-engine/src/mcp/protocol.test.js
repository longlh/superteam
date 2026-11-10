import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpHandler } from "./protocol.js";
import { createTools } from "./tools.js";

function setup(
  request = async () => ({
    status: 200,
    body: [],
  }),
) {
  const calls = [];
  const handle = createMcpHandler({
    name: "superteam",
    version: "1.2.3",
    tools: createTools({
      request: async (...args) => {
        calls.push(args);
        return request(...args);
      },
    }),
  });
  return {
    calls,
    handle,
  };
}

const call = (id, method, params) => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});

test("initialize answers the version that the client asks for when it is supported", async () => {
  const { handle } = setup();
  assert.deepEqual(
    await handle(
      call(1, "initialize", {
        protocolVersion: "2025-06-18",
      }),
    ),
    {
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "superteam",
          version: "1.2.3",
        },
      },
    },
  );
});

test("initialize answers the latest version when the one asked for is not supported", async () => {
  const { handle } = setup();
  const answer = await handle(
    call(1, "initialize", {
      protocolVersion: "1999-01-01",
    }),
  );
  assert.equal(answer.result.protocolVersion, "2025-11-25");
});

test("a notification gets no answer", async () => {
  const { handle } = setup();
  assert.equal(
    await handle({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    null,
  );
  assert.equal(
    await handle({
      jsonrpc: "2.0",
      method: "notifications/unknown",
    }),
    null,
  );
});

test("ping answers an empty result", async () => {
  const { handle } = setup();
  assert.deepEqual(await handle(call("p", "ping")), {
    jsonrpc: "2.0",
    id: "p",
    result: {},
  });
});

test("tools/list answers the six tools with their schemas", async () => {
  const { handle } = setup();
  const { result } = await handle(call(2, "tools/list"));
  assert.deepEqual(
    result.tools.map((tool) => tool.name),
    [
      "assign_work",
      "decide_work",
      "archive_work",
      "retry_work",
      "get_work",
      "list_works",
    ],
  );
  for (const tool of result.tools) {
    assert.deepEqual(Object.keys(tool), ["name", "description", "inputSchema"]);
    assert.equal(tool.inputSchema.type, "object");
  }
});

test("tools/call answers the JSON of the answer of the API", async () => {
  const { calls, handle } = setup(async () => ({
    status: 200,
    body: {
      id: "w",
    },
  }));
  const answer = await handle(
    call(3, "tools/call", {
      name: "get_work",
      arguments: {
        id: "w",
      },
    }),
  );
  assert.deepEqual(calls, [["GET", "/works/w"]]);
  assert.deepEqual(answer, {
    jsonrpc: "2.0",
    id: 3,
    result: {
      content: [
        {
          type: "text",
          text: '{"status":200,"body":{"id":"w"}}',
        },
      ],
      isError: false,
    },
  });
});

test("tools/call marks an answer of the API with a status of 400 or more as an error", async () => {
  const { handle } = setup(async () => ({
    status: 409,
    body: {
      error: "not PROPOSED",
    },
  }));
  const { result } = await handle(
    call(4, "tools/call", {
      name: "decide_work",
      arguments: {
        id: "w",
        decision: "approve",
      },
    }),
  );
  assert.equal(result.isError, true);
  assert.equal(
    result.content[0].text,
    '{"status":409,"body":{"error":"not PROPOSED"}}',
  );
});

test("tools/call gives the message of a thrown error as an error result", async () => {
  const { handle } = setup(async () => {
    throw new Error("superteam is not running");
  });
  const { result } = await handle(
    call(5, "tools/call", {
      name: "list_works",
      arguments: {},
    }),
  );
  assert.deepEqual(result, {
    content: [
      {
        type: "text",
        text: "superteam is not running",
      },
    ],
    isError: true,
  });
});

test("tools/call refuses an invalid input and sends no request", async () => {
  const { calls, handle } = setup();
  const { result } = await handle(
    call(6, "tools/call", {
      name: "decide_work",
      arguments: {
        decision: "approve",
      },
    }),
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /\bid\b/);
  assert.deepEqual(calls, []);
});

test("tools/call without arguments works for a tool that needs none", async () => {
  const { calls, handle } = setup();
  const { result } = await handle(
    call(7, "tools/call", {
      name: "list_works",
    }),
  );
  assert.equal(result.isError, false);
  assert.deepEqual(calls, [["GET", "/works"]]);
});

test("tools/call drops the arguments that the tool does not describe", async () => {
  const { calls, handle } = setup();
  await handle(
    call(8, "tools/call", {
      name: "assign_work",
      arguments: {
        workflow: "wf",
        title: "T",
        extra: "x",
      },
    }),
  );
  assert.deepEqual(calls, [
    [
      "POST",
      "/works",
      {
        workflow: "wf",
        title: "T",
      },
    ],
  ]);
});

test("an unknown tool gives the error -32602", async () => {
  const { handle } = setup();
  const answer = await handle(
    call(9, "tools/call", {
      name: "nope",
    }),
  );
  assert.equal(answer.id, 9);
  assert.equal(answer.error.code, -32602);
});

test("an unknown method gives the error -32601", async () => {
  const { handle } = setup();
  const answer = await handle(call(10, "resources/list"));
  assert.equal(answer.id, 10);
  assert.equal(answer.error.code, -32601);
});

test("a message that is not a JSON-RPC 2.0 object gives the error -32600", async () => {
  const { handle } = setup();
  for (const message of [
    [],
    "x",
    null,
    {
      id: 1,
      method: "ping",
    },
  ]) {
    const answer = await handle(message);
    assert.equal(answer.error.code, -32600);
  }
  assert.equal(
    (
      await handle({
        id: 11,
        method: "ping",
      })
    ).id,
    11,
  );
});

test("an answer from the client gets no answer", async () => {
  const { handle } = setup();
  assert.equal(
    await handle({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    }),
    null,
  );
});
