import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPullRequestBody } from "./pull-request-body.js";

const work = {
  dod: ["ok", "docs"],
  dodChecklist: [true, false],
};

test("renders the summary and the checklist of the work DOD", () => {
  assert.equal(
    renderPullRequestBody({
      summary: "S",
      work,
      tasks: [],
    }),
    "S\n\n## Work DOD\n\n- [x] ok\n- [ ] docs\n",
  );
});

test("adds a section for each task that has a DOD, missing entries unchecked", () => {
  const body = renderPullRequestBody({
    summary: "S",
    work,
    tasks: [
      {
        id: "a",
        dod: ["x", "y"],
        dodChecklist: [true],
      },
      {
        id: "b",
        dod: [],
      },
    ],
  });
  assert.equal(
    body,
    "S\n\n## Work DOD\n\n- [x] ok\n- [ ] docs\n\n## Task `a` DOD\n\n- [x] x\n- [ ] y\n",
  );
});

test("lists no DOD for a skipped task", () => {
  const body = renderPullRequestBody({
    summary: "S",
    work,
    tasks: [
      {
        id: "build-verify-1",
        dod: ["no test fails"],
        completed: true,
        skipped: true,
      },
    ],
  });
  assert.doesNotMatch(body, /build-verify-1/);
});

test("adds the limitations after the work DOD, one part for each group", () => {
  const body = renderPullRequestBody({
    summary: "S",
    work: {
      ...work,
      limitations: [
        {
          group: "build",
          rounds: 3,
          issues: [
            {
              gate: "build-test-3",
              failed: ["it builds", "no test fails"],
              summary: "",
            },
            {
              gate: "build-verify-3",
              failed: ["no test fails"],
              summary: "2 tests fail",
            },
          ],
        },
        {
          group: "review",
          rounds: 1,
          issues: [
            {
              gate: "review-check-1",
              failed: ["approved"],
              summary: "too long",
            },
          ],
        },
      ],
    },
    tasks: [
      {
        id: "a",
        dod: ["x"],
        dodChecklist: [true],
      },
    ],
  });
  assert.equal(
    body,
    "S\n\n## Work DOD\n\n- [x] ok\n- [ ] docs\n" +
      "\n## Limitations\n\n" +
      "`build` stopped after 3 rounds with no gate passed.\n\n" +
      "The gate `build-test-3` did not pass:\n\n- [ ] it builds\n- [ ] no test fails\n\n" +
      "The gate `build-verify-3` did not pass:\n\n- [ ] no test fails\n\nSummary: 2 tests fail\n\n" +
      "`review` stopped after 1 round with no gate passed.\n\n" +
      "The gate `review-check-1` did not pass:\n\n- [ ] approved\n\nSummary: too long\n" +
      "\n## Task `a` DOD\n\n- [x] x\n",
  );
});
