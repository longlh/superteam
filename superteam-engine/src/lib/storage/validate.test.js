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

describe("validateWorkflow with a loop group", () => {
  const step = (name, extra = {}) => ({
    name,
    role: "dev",
    ...extra,
  });
  const loopSteps = () => [
    step("test", {
      gate: true,
      dod: ["no test fails"],
    }),
    step("fixbug", {
      dependOn: ["test"],
    }),
    step("verify", {
      dependOn: ["fixbug"],
      gate: true,
      dod: ["no test fails"],
    }),
  ];
  const group = (extra = {}, loop = {}) => ({
    name: "build",
    dependOn: ["spec"],
    loop: {
      maxRounds: 3,
      steps: loopSteps(),
      ...loop,
    },
    ...extra,
  });
  const flow = (build = group(), more = []) => ({
    name: "feature",
    title: "Feature",
    steps: [
      step("spec"),
      build,
      step("release-note", {
        dependOn: ["build"],
      }),
      ...more,
    ],
  });
  const refuses = (workflow, reason) =>
    assert.equal(validateWorkflow(workflow), reason, JSON.stringify(workflow));

  test("accepts the group of the design", () => {
    assert.equal(validateWorkflow(flow()), null);
  });

  test("refuses maxRounds out of 1 to 10", () => {
    for (const maxRounds of [0, 11, 1.5, undefined]) {
      refuses(
        flow(
          group(
            {},
            {
              maxRounds,
            },
          ),
        ),
        "step build: maxRounds must be an integer from 1 to 10",
      );
    }
  });

  test("refuses a group with a role, instruction, dod or timeout", () => {
    for (const extra of [
      {
        role: "dev",
      },
      {
        instruction: "i",
      },
      {
        dod: ["x"],
      },
      {
        timeout: 30,
      },
    ]) {
      refuses(
        flow(group(extra)),
        "step build: a loop group has no role, instruction, dod or timeout",
      );
    }
  });

  test("refuses empty loop steps", () => {
    for (const steps of [[], undefined, "test"]) {
      refuses(
        flow(
          group(
            {},
            {
              steps,
            },
          ),
        ),
        "step build: loop steps must be a non-empty array",
      );
    }
  });

  test("refuses loop steps that are not a straight chain", () => {
    const [testStep, fixbug, verify] = loopSteps();
    for (const steps of [
      [testStep, step("fixbug"), verify],
      [
        testStep,
        fixbug,
        {
          ...verify,
          dependOn: ["test", "fixbug"],
        },
      ],
      [
        testStep,
        fixbug,
        {
          ...verify,
          dependOn: ["test"],
        },
      ],
      [
        {
          ...testStep,
          dependOn: ["spec"],
        },
        fixbug,
        verify,
      ],
      [
        testStep,
        {
          ...fixbug,
          dependOn: ["verify"],
        },
        {
          ...verify,
        },
      ],
    ]) {
      refuses(
        flow(
          group(
            {},
            {
              steps,
            },
          ),
        ),
        "step build: the steps of a loop must be a straight chain",
      );
    }
  });

  test("refuses a loop with no gate", () => {
    refuses(
      flow(
        group(
          {},
          {
            steps: loopSteps().map(({ gate, ...rest }) => rest),
          },
        ),
      ),
      "step build: a loop has at least one gate",
    );
  });

  test("refuses a gate with no dod", () => {
    for (const dod of [undefined, []]) {
      const [testStep, ...rest] = loopSteps();
      refuses(
        flow(
          group(
            {},
            {
              steps: [
                {
                  ...testStep,
                  dod,
                },
                ...rest,
              ],
            },
          ),
        ),
        "step test: a gate has a non-empty dod",
      );
    }
  });

  test("refuses a gate outside a loop", () => {
    const workflow = flow();
    workflow.steps[0] = step("spec", {
      gate: true,
      dod: ["x"],
    });
    refuses(workflow, "step spec: gate is only for a step of a loop");
  });

  test("refuses a loop inside a loop", () => {
    refuses(
      flow(
        group(
          {},
          {
            steps: [
              ...loopSteps(),
              group({
                name: "inner",
                dependOn: ["verify"],
              }),
            ],
          },
        ),
      ),
      "step build: a loop has no loop inside it",
    );
  });

  test("refuses a step outside named as a step inside", () => {
    refuses(flow(group(), [step("test")]), "duplicate step name test");
  });

  test("refuses a step outside that depends on a step inside", () => {
    const workflow = flow();
    workflow.steps[2].dependOn = ["test"];
    refuses(workflow, "step release-note depends on unknown step test");
  });

  test("refuses a step outside named as a task of a loop", () => {
    const workflow = flow(group());
    workflow.steps.unshift(step("build-test-1"));
    refuses(workflow, "duplicate task id build-test-1");
  });

  test("refuses two groups whose tasks have the same id", () => {
    const one = (name, inner) =>
      group(
        {
          name,
          dependOn: [],
        },
        {
          maxRounds: 1,
          steps: [
            step(inner, {
              gate: true,
              dod: ["x"],
            }),
          ],
        },
      );
    refuses(
      {
        name: "feature",
        title: "Feature",
        steps: [one("a-b", "c"), one("a", "b-c")],
      },
      "duplicate task id a-b-c-1",
    );
  });

  test("refuses a group named as a task of another group", () => {
    const one = (name, inner, more = {}) =>
      group(
        {
          name,
          dependOn: [],
        },
        {
          maxRounds: 1,
          steps: [
            step(inner, {
              gate: true,
              dod: ["x"],
            }),
            ...(more.steps ?? []),
          ],
        },
      );
    refuses(
      {
        name: "feature",
        title: "Feature",
        steps: [one("x-test-1", "a"), one("x", "test")],
      },
      "duplicate task id x-test-1",
    );
  });

  test("refuses a gate that is not a boolean", () => {
    const [testStep, ...rest] = loopSteps();
    refuses(
      flow(
        group(
          {},
          {
            steps: [
              {
                ...testStep,
                gate: "true",
              },
              ...rest,
            ],
          },
        ),
      ),
      "step test: gate must be a boolean",
    );
  });

  test("refuses a group description that is not a string", () => {
    refuses(
      flow(
        group({
          description: 1,
        }),
      ),
      "step build: description must be a string",
    );
  });

  test("refuses a gate on a loop group", () => {
    refuses(
      flow(
        group({
          gate: true,
        }),
      ),
      "step build: gate is only for a step of a loop",
    );
  });

  test("refuses a task id that is not a slug of at most 63 characters", () => {
    const name = `build-${"x".repeat(50)}`;
    const workflow = flow(
      group(
        {
          name,
        },
        {
          maxRounds: 10,
        },
      ),
    );
    workflow.steps[2].dependOn = [name];
    refuses(
      workflow,
      `step ${name}: the id ${name}-test-10 of a task must be a slug of at most 63 characters`,
    );
  });
});
