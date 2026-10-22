import { readJson } from "../../lib/storage/files.js";
import { workFile } from "../../lib/storage/paths.js";
import { failureOf, readEndedJob } from "./ended-job.js";
import { failTask, failWork } from "./fail-work.js";
import { taskJob } from "./start-ready.js";

// A summary already written (by a run that threw after it) is kept, and the
// worker job is published again: the Agents dedupe it by its id.
export async function taskMergerEnded(deps, event) {
  const { jobId, summary, error } = event.payload.data;
  const ended = await readEndedJob(deps, jobId, "task-merger");
  if (ended === null) {
    return;
  }
  const { workId, workFolder, store, task } = ended;
  const failure = failureOf(ended);
  if (failure !== undefined) {
    await failWork({
      deps,
      workId,
      error: failure,
    });
    return;
  }
  if (task.completed) {
    return;
  }
  let merged = task;
  if (task.summary === undefined) {
    if (error !== undefined) {
      await failTask({
        deps,
        workId,
        task,
        error,
      });
      return;
    }
    merged = {
      ...task,
      summary: summary ?? "",
      updatedAt: deps.now().toISOString(),
    };
    await store.put(merged);
  }
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
