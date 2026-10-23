import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { artifactsDir, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { assignEvent, createHarness, endedEvent } from "./harness.js";

const linear = {
  name: "linear",
  title: "Linear",
  steps: [
    {
      name: "a",
      role: "dev",
    },
    {
      name: "b",
      role: "qa",
      dependOn: ["a"],
    },
  ],
};

let h;

beforeEach(async () => {
  h = await createHarness({
    linear,
  });
  await h.handlers["work:assign"](
    assignEvent({
      id: "w1",
      workflow: "linear",
      title: "T",
    }),
  );
  h.published.length = 0;
  h.calls.length = 0;
});

afterEach(() => h.cleanup());

const taskTree = (taskId) =>
  worktreeDir(h.baseDir, {
    workId: "w1",
    taskId,
  });

test("a job that cannot be built removes the new worktree, so a retry starts the task", async () => {
  // The first worktree of b holds a corrupt artifact: its job cannot be built.
  const { createWorktree } = h.git;
  let corrupt = true;
  h.git.createWorktree = async (args) => {
    await createWorktree(args);
    if (corrupt && args.folder === taskTree("b")) {
      corrupt = false;
      const folder = artifactsDir(args.folder, "w1");
      await mkdir(folder, {
        recursive: true,
      });
      await writeFile(path.join(folder, "bad.json"), "{ not json");
    }
  };
  const event = endedEvent("worker:ended", {
    jobId: "w1/a/worker",
    summary: "s",
  });
  await assert.rejects(h.handlers["worker:ended"](event));
  assert.equal(existsSync(taskTree("b")), false);
  assert.equal(h.published.length, 0);

  await h.handlers["worker:ended"](event);
  assert.equal(existsSync(taskTree("b")), true);
  assert.deepEqual(
    h.published.map(([topic, job]) => [topic, job.id]),
    [["job:run", "w1/b/worker"]],
  );
});

const feature = {
  name: "feature",
  title: "Feature",
  steps: [
    {
      name: "spec",
      role: "analyst",
    },
    {
      name: "build",
      dependOn: ["spec"],
      loop: {
        maxRounds: 2,
        steps: [
          {
            name: "test",
            role: "tester",
            gate: true,
            dod: ["no test fails"],
          },
          {
            name: "fixbug",
            role: "developer",
            dependOn: ["test"],
          },
          {
            name: "verify",
            role: "tester",
            dependOn: ["fixbug"],
            gate: true,
            dod: ["no test fails"],
          },
        ],
      },
    },
    {
      name: "release-note",
      role: "writer",
      dependOn: ["build"],
    },
  ],
};
const LATER = [
  "build-fixbug-1",
  "build-verify-1",
  "build-test-2",
  "build-fixbug-2",
  "build-verify-2",
];

// A harness with the work w2 of the workflow feature, its spec done and
// build-test-1 started.
async function loopHarness() {
  const g = await createHarness({
    feature,
  });
  await g.handlers["work:assign"](
    assignEvent({
      id: "w2",
      workflow: "feature",
      title: "T",
    }),
  );
  await g.handlers["worker:ended"](
    endedEvent("worker:ended", {
      jobId: "w2/spec/worker",
      summary: "spec",
      data: {
        dodChecklist: [],
      },
    }),
  );
  g.published.length = 0;
  g.calls.length = 0;
  const store = createTaskStore(
    worktreeDir(g.baseDir, {
      workId: "w2",
    }),
  );
  return {
    g,
    store,
  };
}

async function assertSkippedAfterTest1(g, store) {
  const tasks = new Map((await store.list()).map((t) => [t.id, t]));
  for (const id of LATER) {
    assert.equal(tasks.get(id).completed, true, id);
    assert.equal(tasks.get(id).skipped, true, id);
  }
  assert.equal(tasks.get("build-test-1").skipped, undefined);
  assert.equal(tasks.get("release-note").completed, undefined);
  const created = g.named("createWorktree").map(([, args]) => args);
  assert.deepEqual(
    created.map((args) => args.branch),
    ["superteam-task/w2/release-note"],
  );
  assert.equal(created[0].base, "superteam-task/w2/build-test-1");
  assert.deepEqual(
    g.published.map(([topic, job]) => [topic, job.id]),
    [["job:run", "w2/release-note/worker"]],
  );
}

test("after a passed gate, the next tasks of the group are skipped", async () => {
  const { g, store } = await loopHarness();
  try {
    g.commitArtifact("superteam-task/w2/build-test-1", {
      id: "1",
      task: "build-test-1",
      work: "w2",
      createdAt: "x",
      content: "all tests pass",
    });
    await g.handlers["worker:ended"](
      endedEvent("worker:ended", {
        jobId: "w2/build-test-1/worker",
        summary: "tested",
        data: {
          dodChecklist: [true],
        },
      }),
    );
    await assertSkippedAfterTest1(g, store);
    const [, job] = g.published[0];
    assert.match(job.instruction.prompt, /- from build-test-1: all tests pass/);
  } finally {
    await g.cleanup();
  }
});

test("a restart after a passed gate finishes the skips", async () => {
  const { g, store } = await loopHarness();
  try {
    // The run stopped after the gate was stored, before the next tasks.
    const gate = await store.get("build-test-1");
    await store.put({
      ...gate,
      completed: true,
      summary: "tested",
      dodChecklist: [true],
    });
    await g.handlers["worker:ended"](
      endedEvent("worker:ended", {
        jobId: "w2/build-test-1/worker",
        summary: "tested",
        data: {
          dodChecklist: [true],
        },
      }),
    );
    await assertSkippedAfterTest1(g, store);
  } finally {
    await g.cleanup();
  }
});

test("a gate that does not pass runs the next task of the group", async () => {
  const { g, store } = await loopHarness();
  try {
    await g.handlers["worker:ended"](
      endedEvent("worker:ended", {
        jobId: "w2/build-test-1/worker",
        summary: "2 tests fail",
        data: {
          dodChecklist: [false],
        },
      }),
    );
    const fixbug = await store.get("build-fixbug-1");
    assert.equal(fixbug.skipped, undefined);
    assert.deepEqual(
      g.published.map(([topic, job]) => [topic, job.id]),
      [["job:run", "w2/build-fixbug-1/worker"]],
    );
  } finally {
    await g.cleanup();
  }
});
