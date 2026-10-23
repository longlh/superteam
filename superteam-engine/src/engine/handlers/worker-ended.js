import { existsSync } from "node:fs";
import { readJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { taskStatus } from "../../lib/storage/status.js";
import { buildJob } from "../jobs.js";
import { failureOf, readEndedJob } from "./ended-job.js";
import { failTask, failWork } from "./fail-work.js";
import { startReady } from "./start-ready.js";

// A task already completed (by a run that threw after it) is not done again,
// but what comes after it is: the next tasks, the work merger, or the cleanup
// of the failure. A job published again is deduped by the Agents.
export async function workerEnded(deps, event) {
  const { jobId, summary, data, error } = event.payload.data;
  const ended = await readEndedJob(deps, jobId, "worker");
  if (ended === null) {
    return;
  }
  const { workId, taskId, workFolder, store, task } = ended;
  const failure = failureOf(ended);
  if (failure !== undefined) {
    await failWork({
      deps,
      workId,
      error: failure,
    });
    return;
  }
  if (!task.completed) {
    const failure = error ?? checklistError(task, data);
    if (failure !== undefined) {
      await failTask({
        deps,
        workId,
        task,
        error: failure,
      });
      return;
    }
    await completeTask({
      deps,
      workId,
      taskId,
      store,
      task,
      summary,
      data,
    });
  }

  await startReady({
    deps,
    workId,
  });
  const tasks = await store.list();
  if (tasks.every((t) => taskStatus(t, tasks) === "DONE")) {
    deps.publish(
      "job:run",
      buildJob({
        kind: "work-merger",
        work: await readJson(workFile(workFolder, workId)),
        tasks,
        workdir: workFolder,
        branches: deps.branches,
      }),
    );
  }
}

// The dodChecklist of a worker has one boolean for each item of the DOD of
// its task, so the pull request shows each item with its own answer.
function checklistError(task, data) {
  const expected = (task.dod ?? []).length;
  const got = data?.dodChecklist?.length ?? 0;
  return got === expected
    ? undefined
    : `the dodChecklist has ${got} items, the DOD of the task has ${expected}`;
}

// Commits what the worker left in its worktree (a safety net: it is told to
// commit), pushes the task branch, removes the worktree, then completes it.
async function completeTask({
  deps,
  workId,
  taskId,
  store,
  task,
  summary,
  data,
}) {
  const folder = worktreeDir(deps.baseDir, {
    workId,
    taskId,
  });
  if (existsSync(folder)) {
    await deps.git.commitAll(folder, `Save the work of the task ${taskId}`);
  }
  await deps.git.push(deps.branches.task(workId, taskId));
  await deps.git.removeWorktree(folder);
  const at = deps.now().toISOString();
  await store.put({
    ...task,
    completed: true,
    summary,
    dodChecklist: data?.dodChecklist,
    completedAt: at,
    updatedAt: at,
  });
}
