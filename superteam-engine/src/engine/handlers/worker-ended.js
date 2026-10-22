import { readJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { taskStatus } from "../../lib/storage/status.js";
import { buildJob } from "../jobs.js";
import { readEndedJob } from "./ended-job.js";
import { failTask } from "./fail-work.js";
import { startReady } from "./start-ready.js";

export async function workerEnded(deps, event) {
  const { jobId, summary, data, error } = event.payload.data;
  const ended = await readEndedJob(deps, jobId, "worker");
  if (ended === null) {
    return;
  }
  const { workId, taskId, workFolder, store, task } = ended;
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
