import { readJson, writeJson } from "../../lib/storage/files.js";
import { workFile } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { failureOf, readEndedWorkMerger } from "./ended-job.js";
import { failWork } from "./fail-work.js";
import { renderPullRequestBody } from "./pull-request-body.js";
import { removeTasksFolder } from "./tasks-folder.js";

export async function workMergerEnded(deps, event) {
  const { jobId, summary, data, error } = event.payload.data;
  const ended = await readEndedWorkMerger(deps, jobId);
  if (ended === null) {
    return;
  }
  const { workId, workFolder } = ended;
  const failure = failureOf(ended) ?? error;
  if (failure !== undefined) {
    await failWork({
      deps,
      workId,
      error: failure,
    });
    return;
  }

  const branch = deps.branches.work(workId);
  if ((await deps.git.getPullRequest(branch)) === null) {
    const file = workFile(workFolder, workId);
    const work = {
      ...(await readJson(file)),
      dodChecklist: data?.dodChecklist,
      updatedAt: deps.now().toISOString(),
    };
    await writeJson(file, work);
    await deps.git.commitAll(workFolder, `Propose the work ${workId}`);
    await deps.git.push(branch);
    await deps.git.openPullRequest({
      branch,
      base: work.base,
      title: work.title,
      body: renderPullRequestBody({
        summary: summary ?? "",
        work,
        tasks: await createTaskStore(workFolder).list(),
      }),
    });
  }
  await deps.git.removeWorktree(workFolder);
  await removeTasksFolder(deps, workId);
}
