import { existsSync } from "node:fs";
import { readJson } from "../../lib/storage/files.js";
import { parseJobId } from "../../lib/storage/ids.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { taskStatus } from "../../lib/storage/status.js";
import { buildJob } from "../jobs.js";
import { createTaskStore } from "../tasks.js";
import { failTask } from "./fail-work.js";
import { startReady } from "./start-ready.js";

export async function workerEnded(deps, event) {
  const { jobId, summary, data, error } = event.payload.data;
  const { workId, taskId } = parseJobId(jobId);
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  if (!existsSync(workFolder)) {
    return;
  }
  const store = createTaskStore(workFolder);
  const task = await store.get(taskId);
  if (task === null || task.completed) {
    return;
  }
  if (error !== undefined) {
    await failTask({
      deps,
      workId,
      task,
      error,
    });
    return;
  }

  await deps.git.push(`tasks/${workId}/${taskId}`);
  await deps.git.removeWorktree(
    worktreeDir(deps.baseDir, {
      workId,
      taskId,
    }),
  );
  const at = deps.now().toISOString();
  await store.put({
    ...task,
    completed: true,
    summary,
    dodChecklist: data?.dodChecklist,
    completedAt: at,
    updatedAt: at,
  });

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
      }),
    );
  }
}
