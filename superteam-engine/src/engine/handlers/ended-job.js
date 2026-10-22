import { existsSync } from "node:fs";
import { isSlug, parseJobId } from "../../lib/storage/ids.js";
import { worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";

// The shared start of the handlers of the end of a job. Returns null (the event
// is ignored) when the job id is not valid, the work worktree is gone, or the
// task is unknown or already completed.
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
  if (task === null || task.completed) {
    return null;
  }
  return {
    workId,
    taskId,
    workFolder,
    store,
    task,
  };
}
