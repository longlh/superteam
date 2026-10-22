import { existsSync } from "node:fs";
import { readJson } from "../../lib/storage/files.js";
import { parseJobId } from "../../lib/storage/ids.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { failTask } from "./fail-work.js";
import { workerJob } from "./start-ready.js";

export async function taskMergerEnded(deps, event) {
  const { jobId, summary, error } = event.payload.data;
  const { workId, taskId } = parseJobId(jobId);
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  if (!existsSync(workFolder)) {
    return;
  }
  const store = createTaskStore(workFolder);
  const task = await store.get(taskId);
  if (task === null || task.completed || task.summary !== undefined) {
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

  const merged = {
    ...task,
    summary,
    updatedAt: deps.now().toISOString(),
  };
  await store.put(merged);
  deps.publish(
    "job:run",
    await workerJob({
      deps,
      work: await readJson(workFile(workFolder, workId)),
      task: merged,
      tasks: await store.list(),
    }),
  );
}
