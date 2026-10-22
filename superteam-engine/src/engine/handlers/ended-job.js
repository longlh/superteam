import { existsSync } from "node:fs";
import { readJson } from "../../lib/storage/files.js";
import { isSlug, parseJobId } from "../../lib/storage/ids.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";

// The shared start of the handlers of the end of a job. Returns null (the event
// is ignored) when the job id is not valid, the work worktree is gone, or the
// task is unknown. A completed task is returned too: the handler finishes what
// a throw left undone (the next tasks, or the cleanup of a failure).
export async function readEndedJob(deps, jobId, kind) {
  if (typeof jobId !== "string") {
    return null;
  }
  const parsed = parseJobId(jobId);
  const { workId, taskId } = parsed;
  if (parsed.kind !== kind || !isSlug(workId) || !isSlug(taskId)) {
    return null;
  }
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  if (!existsSync(workFolder)) {
    return null;
  }
  const store = createTaskStore(workFolder);
  const task = await store.get(taskId);
  if (task === null) {
    return null;
  }
  return {
    workId,
    taskId,
    workFolder,
    store,
    task,
    work: await readJson(workFile(workFolder, workId)),
  };
}

// The same for the work merger, whose job id has no task: `{workId}/work-merger`.
export async function readEndedWorkMerger(deps, jobId) {
  if (typeof jobId !== "string") {
    return null;
  }
  const parsed = parseJobId(jobId);
  const { workId } = parsed;
  if (
    parsed.kind !== "work-merger" ||
    parsed.taskId !== undefined ||
    !isSlug(workId)
  ) {
    return null;
  }
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  if (!existsSync(workFolder)) {
    return null;
  }
  return {
    workId,
    workFolder,
    work: await readJson(workFile(workFolder, workId)),
  };
}

// The error that has failed the work or the task, if any: the failure is then
// finished again (failWork is idempotent), whatever the event says.
export function failureOf({ work, task }) {
  return work?.error ?? (task?.completed ? task.error : undefined);
}
