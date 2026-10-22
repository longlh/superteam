import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { validateAssignBody, validateWorkflow } from "./validate.js";

describe("validateAssignBody", () => {
  test("accepts a valid body", () => {
    assert.equal(
      validateAssignBody({
        workflow: "flow",
        title: "T",
      }),
      null,
    );
    assert.equal(
      validateAssignBody({
        workflow: "flow",
        title: "T",
        id: "my-id",
        description: "d",
        dod: ["a"],
      }),
      null,
    );
  });

  test("refuses bad bodies", () => {
    const ok = {
      workflow: "flow",
      title: "T",
    };
    for (const body of [
      null,
      "x",
      [],
      {
        workflow: "flow",
      },
      {
        ...ok,
        title: "",
      },
      {
        title: "T",
      },
      {
        ...ok,
        workflow: "Bad Flow",
      },
      {
        ...ok,
        id: "Bad/Id",
      },
      {
        ...ok,
        id: "a".repeat(64),
      },
      {
        ...ok,
        dod: "x",
      },
      {
        ...ok,
        dod: [1],
      },
      {
        ...ok,
        description: 5,
      },
    ]) {
      assert.equal(
        typeof validateAssignBody(body),
        "string",
        JSON.stringify(body),
      );
    }
  });
});

describe("validateWorkflow", () => {
  const flow = (steps) => ({
    name: "flow",
    title: "Flow",
    steps,
  });

  test("accepts a valid workflow", () => {
    assert.equal(
      validateWorkflow(
        flow([
          {
            name: "a",
            role: "dev",
            timeout: 30,
            dod: ["x"],
          },
          {
            name: "b",
            dependOn: ["a"],
          },
        ]),
      ),
      null,
    );
  });

  test("refuses bad workflows", () => {
    for (const workflow of [
      null,
      {
        title: "Flow",
        steps: [
          {
            name: "a",
          },
        ],
      },
      {
        name: "Bad Name",
        title: "Flow",
        steps: [
          {
            name: "a",
          },
        ],
      },
      {
        name: "flow",
        steps: [
          {
            name: "a",
          },
        ],
      },
      flow([]),
      flow(undefined),
      flow([
        {
          name: "Bad",
        },
      ]),
      flow([
        {
          name: "a",
        },
        {
          name: "a",
        },
      ]),
      flow([
        {
          name: "a",
          dependOn: ["zzz"],
        },
      ]),
      flow([
        {
          name: "a",
          dependOn: ["b"],
        },
        {
          name: "b",
          dependOn: ["a"],
        },
      ]),
      flow([
        {
          name: "a",
          dependOn: ["a"],
        },
      ]),
      flow([
        {
          name: "a",
          timeout: 0,
        },
      ]),
      flow([
        {
          name: "a",
          timeout: 1.5,
        },
      ]),
      flow([
        {
          name: "a",
          timeout: "5",
        },
      ]),
      flow([
        {
          name: "a",
          dod: "x",
        },
      ]),
    ]) {
      assert.equal(
        typeof validateWorkflow(workflow),
        "string",
        JSON.stringify(workflow),
      );
    }
  });
});
