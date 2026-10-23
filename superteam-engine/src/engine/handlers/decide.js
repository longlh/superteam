import { isSlug } from "../../lib/storage/ids.js";

function refuse(message) {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

async function deleteTaskBranches(git, id) {
  for (const branch of await git.listBranches(`tasks/${id}/`)) {
    await git.deleteBranch(branch);
  }
}

// Approve is the merge of the pull request. Every step reads the state first,
// so a repeated event finishes the cleanup of a crash and changes nothing else.
export async function decide(deps, event) {
  const { id, decision } = event.payload.data;
  if (!isSlug(id) || (decision !== "approve" && decision !== "reject")) {
    throw refuse(`Invalid decision of the work: ${id} ${decision}`);
  }
  const { git } = deps;
  const branch = `works/${id}`;
  const state = (await git.getPullRequest(branch))?.state;

  if (decision === "approve") {
    if (state !== "open" && state !== "merged") {
      throw refuse(`The work ${id} has no pull request to approve`);
    }
    if (state === "open") {
      await git.mergePullRequest(branch);
    }
    if (await git.branchExists(branch)) {
      await git.deleteBranch(branch);
    }
    await deleteTaskBranches(git, id);
    // The result is read from the upstream: the root workspace is not pulled.
    await git.fetch();
    return;
  }

  if (state !== "open" && state !== "closed") {
    throw refuse(`The work ${id} has no pull request to reject`);
  }
  if (state === "open") {
    await git.closePullRequest(branch);
  }
  await deleteTaskBranches(git, id);
}
