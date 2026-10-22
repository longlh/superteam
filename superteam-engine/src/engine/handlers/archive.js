import path from "node:path";
import { isSlug } from "../../lib/storage/ids.js";
import { workFile } from "../../lib/storage/paths.js";

function refuse(message) {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

// A work is archived when it is REJECTED (its pull request is closed) or FAILED
// (no pull request, and an error in its work file): its branch is deleted.
export async function archive(deps, event) {
  const { id } = event.payload.data;
  if (!isSlug(id)) {
    throw refuse(`Invalid id of the work: ${id}`);
  }
  const { git } = deps;
  const branch = `works/${id}`;
  const pullRequest = await git.getPullRequest(branch);
  const exists = await git.branchExists(branch);

  if (!exists && (pullRequest === null || pullRequest.state === "closed")) {
    return;
  }
  if (exists && pullRequest?.state === "closed") {
    await git.deleteBranch(branch);
    return;
  }
  if (exists && pullRequest === null) {
    const text = await git.readFileOnBranch(
      branch,
      path.relative(deps.baseDir, workFile(deps.baseDir, id)),
    );
    if (text !== null && JSON.parse(text).error !== undefined) {
      await git.deleteBranch(branch);
      return;
    }
  }
  throw refuse(`The work ${id} is neither failed nor rejected`);
}
