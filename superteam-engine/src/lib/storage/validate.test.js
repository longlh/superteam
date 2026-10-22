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
  const flow = (steps, extra = {}) => ({
    name: "flow",
    title: "Flow",
    steps,
    ...extra,
  });
  const step = (name, extra = {}) => ({
    name,
    role: "dev",
    ...extra,
  });

  test("accepts a valid workflow", () => {
    assert.equal(
      validateWorkflow(
        flow(
          [
            step("a", {
              timeout: 30,
              dod: ["x"],
              description: "d",
              instruction: "i",
            }),
            step("b", {
              dependOn: ["a"],
              timeout: 35791,
            }),
          ],
          {
            description: "About the flow",
            dod: ["shipped"],
            canApprove: ["lead"],
          },
        ),
      ),
      null,
    );
  });

  test("refuses bad workflows, each with its reason", () => {
    for (const [workflow, reason] of [
      [null, /workflow must be an object/],
      [
        {
          title: "Flow",
          steps: [step("a")],
        },
        /name must be a slug/,
      ],
      [
        {
          name: "Bad Name",
          title: "Flow",
          steps: [step("a")],
        },
        /name must be a slug/,
      ],
      [
        {
          name: "flow",
          steps: [step("a")],
        },
        /title must be a non-empty string/,
      ],
      [
        flow([step("a")], {
          description: 5,
        }),
        /^description must be a string/,
      ],
      [
        flow([step("a")], {
          dod: "shipped",
        }),
        /^dod must be an array of strings/,
      ],
      [
        flow([step("a")], {
          dod: [1],
        }),
        /^dod must be an array of strings/,
      ],
      [
        flow([step("a")], {
          canApprove: "lead",
        }),
        /^canApprove must be an array of strings/,
      ],
      [flow([]), /steps must be a non-empty array/],
      [flow(undefined), /steps must be a non-empty array/],
      [flow([step("Bad")]), /step name must be a slug/],
      [
        flow([
          {
            name: "a",
          },
        ]),
        /step a: role must be a slug/,
      ],
      [
        flow([
          step("a", {
            role: "Bad Role",
          }),
        ]),
        /step a: role must be a slug/,
      ],
      [flow([step("a"), step("a")]), /duplicate step name a/],
      [
        flow([
          step("a", {
            dependOn: ["zzz"],
          }),
        ]),
        /depends on unknown step zzz/,
      ],
      [
        flow([
          step("a", {
            dependOn: ["b"],
          }),
          step("b", {
            dependOn: ["a"],
          }),
        ]),
        /cycle/,
      ],
      [
        flow([
          step("a", {
            dependOn: ["a"],
          }),
        ]),
        /cycle/,
      ],
      ...[0, 1.5, "5", 35792].map((timeout) => [
        flow([
          step("a", {
            timeout,
          }),
        ]),
        /step a: timeout must be an integer from 1 to 35791/,
      ]),
      [
        flow([
          step("a", {
            dod: "x",
          }),
        ]),
        /step a: dod must be an array of strings/,
      ],
      [
        flow([
          step("a", {
            instruction: 5,
          }),
        ]),
        /step a: instruction must be a string/,
      ],
    ]) {
      assert.match(
        String(validateWorkflow(workflow)),
        reason,
        JSON.stringify(workflow),
      );
    }
  });
});
