import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInput, createTools } from "./tools.js";

function setup(
  answer = {
    status: 202,
    body: {
      eventId: "e1",
    },
  },
) {
  const calls = [];
  const tools = createTools({
    request: async (...args) => {
      calls.push(args);
      return answer;
    },
  });
  return {
    calls,
    byName: Object.fromEntries(tools.map((tool) => [tool.name, tool])),
  };
}

test("the tools are the six requests of the API", () => {
  const { byName } = setup();
  assert.deepEqual(Object.keys(byName), [
    "assign_work",
    "decide_work",
    "archive_work",
    "retry_work",
    "get_work",
    "list_works",
  ]);
  for (const tool of Object.values(byName)) {
    assert.equal(typeof tool.description, "string");
    assert.equal(typeof tool.handler, "function");
  }
});

test("assign_work sends POST /works with the input as body", async () => {
  const { calls, byName } = setup();
  const input = {
    id: "w",
    workflow: "wf",
    title: "T",
    description: "D",
    dod: ["a"],
  };
  const result = await byName.assign_work.handler(input);
  assert.deepEqual(calls, [["POST", "/works", input]]);
  assert.deepEqual(result, {
    status: 202,
    body: {
      eventId: "e1",
    },
  });
});

test("decide_work sends POST /works/{id}/decision with the decision", async () => {
  const { calls, byName } = setup();
  await byName.decide_work.handler({
    id: "w",
    decision: "approve",
  });
  assert.deepEqual(calls, [
    [
      "POST",
      "/works/w/decision",
      {
        decision: "approve",
      },
    ],
  ]);
});

test("decide_work sends the reason when it is given", async () => {
  const { calls, byName } = setup();
  await byName.decide_work.handler({
    id: "w",
    decision: "reject",
    reason: "Too short",
  });
  assert.deepEqual(calls, [
    [
      "POST",
      "/works/w/decision",
      {
        decision: "reject",
        reason: "Too short",
      },
    ],
  ]);
});

test("archive_work sends POST /works/{id}/archive", async () => {
  const { calls, byName } = setup();
  await byName.archive_work.handler({
    id: "w",
  });
  assert.deepEqual(calls, [["POST", "/works/w/archive"]]);
});

test("retry_work sends POST /works/{id}/retry", async () => {
  const { calls, byName } = setup();
  await byName.retry_work.handler({
    id: "w",
  });
  assert.deepEqual(calls, [["POST", "/works/w/retry"]]);
});

test("get_work sends GET /works/{id}", async () => {
  const { calls, byName } = setup({
    status: 200,
    body: {
      id: "w",
    },
  });
  const result = await byName.get_work.handler({
    id: "w",
  });
  assert.deepEqual(calls, [["GET", "/works/w"]]);
  assert.deepEqual(result, {
    status: 200,
    body: {
      id: "w",
    },
  });
});

test("list_works sends GET /works", async () => {
  const { calls, byName } = setup({
    status: 200,
    body: [],
  });
  await byName.list_works.handler({});
  assert.deepEqual(calls, [["GET", "/works"]]);
});

test("the id in the path is encoded", async () => {
  const { calls, byName } = setup();
  await byName.get_work.handler({
    id: "a/../b c",
  });
  assert.equal(calls[0][1], "/works/a%2F..%2Fb%20c");
});

test("a 409 is given back unchanged", async () => {
  const answer = {
    status: 409,
    body: {
      error: "not PROPOSED",
    },
  };
  const { byName } = setup(answer);
  assert.deepEqual(
    await byName.decide_work.handler({
      id: "w",
      decision: "reject",
    }),
    answer,
  );
});

test("decide_work describes its input with JSON Schema", () => {
  const { byName } = setup();
  const schema = byName.decide_work.inputSchema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["id", "decision"]);
  assert.deepEqual(schema.properties.decision.enum, ["approve", "reject"]);
  assert.equal(schema.properties.reason.type, "string");
});

test("assign_work describes its input with JSON Schema", () => {
  const { byName } = setup();
  const schema = byName.assign_work.inputSchema;
  assert.deepEqual(schema.required, ["workflow", "title"]);
  assert.equal(schema.properties.dod.type, "array");
  assert.deepEqual(schema.properties.dod.items, {
    type: "string",
  });
});

test("list_works has no required argument", () => {
  const { byName } = setup();
  assert.deepEqual(byName.list_works.inputSchema, {
    type: "object",
    properties: {},
  });
});

test("checkInput accepts a valid input", () => {
  const { byName } = setup();
  assert.equal(
    checkInput(byName.assign_work.inputSchema, {
      workflow: "wf",
      title: "T",
      dod: ["a", "b"],
    }),
    null,
  );
});

test("checkInput names a missing required argument", () => {
  const { byName } = setup();
  assert.match(
    checkInput(byName.decide_work.inputSchema, {
      decision: "approve",
    }),
    /\bid\b/,
  );
});

test("checkInput names an argument of the wrong type", () => {
  const { byName } = setup();
  assert.match(
    checkInput(byName.assign_work.inputSchema, {
      workflow: 1,
      title: "T",
    }),
    /workflow/,
  );
});

test("checkInput names a value that is not in the enum", () => {
  const { byName } = setup();
  assert.match(
    checkInput(byName.decide_work.inputSchema, {
      id: "w",
      decision: "maybe",
    }),
    /decision/,
  );
});

test("checkInput names an array with an item that is not a string", () => {
  const { byName } = setup();
  assert.match(
    checkInput(byName.assign_work.inputSchema, {
      workflow: "wf",
      title: "T",
      dod: ["a", 2],
    }),
    /dod/,
  );
});
