import { readJson, writeJson } from "../../lib/storage/files.js";
import { workFile } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { readEndedWorkMerger } from "./ended-job.js";
import { failWork } from "./fail-work.js";
import { renderPullRequestBody } from "./pull-request-body.js";

export async function workMergerEnded(deps, event) {
  const { jobId, summary, data, error } = event.payload.data;
  const ended = readEndedWorkMerger(deps, jobId);
  if (ended === null) {
    return;
  }
  const { workId, workFolder } = ended;
  if (error !== undefined) {
    await failWork({
      deps,
      workId,
      error,
    });
    return;
  }

  const branch = `works/${workId}`;
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
      title: work.title,
      body: renderPullRequestBody({
        summary: summary ?? "",
        work,
        tasks: await createTaskStore(workFolder).list(),
      }),
    });
  }
  await deps.git.removeWorktree(workFolder);
}
