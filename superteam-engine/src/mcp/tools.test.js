import { test } from "node:test";
import assert from "node:assert/strict";
import { createTools } from "./tools.js";

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

test("the tools are the five requests of the API", () => {
  const { byName } = setup();
  assert.deepEqual(Object.keys(byName), [
    "assign_work",
    "decide_work",
    "archive_work",
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

test("archive_work sends POST /works/{id}/archive", async () => {
  const { calls, byName } = setup();
  await byName.archive_work.handler({
    id: "w",
  });
  assert.deepEqual(calls, [["POST", "/works/w/archive"]]);
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
