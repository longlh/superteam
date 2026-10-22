import { readJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { readEndedJob } from "./ended-job.js";
import { failTask } from "./fail-work.js";
import { taskJob } from "./start-ready.js";

export async function taskMergerEnded(deps, event) {
  const { jobId, summary, error } = event.payload.data;
  const ended = await readEndedJob(deps, jobId, "task-merger");
  if (ended === null || ended.task.summary !== undefined) {
    return;
  }
  const { workId, workFolder, store, task } = ended;
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
    summary: summary ?? "",
    updatedAt: deps.now().toISOString(),
  };
  await store.put(merged);
  deps.publish(
    "job:run",
    await taskJob({
      deps,
      work: await readJson(workFile(workFolder, workId)),
      task: merged,
      tasks: await store.list(),
    }),
  );
}
