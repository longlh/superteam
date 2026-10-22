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
