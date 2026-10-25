import { isSlug } from "../../lib/storage/ids.js";
import { clearError } from "./clear-error.js";

function refuse(message) {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

async function deleteTaskBranches(deps, id) {
  const { git } = deps;
  for (const branch of await git.listBranches(deps.branches.tasksOf(id))) {
    await git.deleteBranch(branch);
  }
}

// The reason is written before the merge or the close, so it is there with the
// decision. A repeated event finds it and does not write it again.
async function commentReason(deps, branch, reason) {
  const { git } = deps;
  if (!(await git.listPullRequestComments(branch)).includes(reason)) {
    await git.commentPullRequest(branch, reason);
  }
}

// Approve is the merge of the pull request. Every step reads the state first,
// so a repeated event finishes the cleanup of a crash and changes nothing else.
export async function decide(deps, event) {
  const { id, decision, reason } = event.payload.data;
  if (!isSlug(id) || (decision !== "approve" && decision !== "reject")) {
    throw refuse(`Invalid decision of the work: ${id} ${decision}`);
  }
  const { git } = deps;
  const branch = deps.branches.work(id);
  const state = (await git.getPullRequest(branch))?.state;

  if (decision === "approve") {
    if (state !== "open" && state !== "merged") {
      throw refuse(`The work ${id} has no pull request to approve`);
    }
    if (state === "open") {
      if (reason) {
        await commentReason(deps, branch, reason);
      }
      await git.mergePullRequest(branch);
    }
    if (await git.branchExists(branch)) {
      await git.deleteBranch(branch);
    }
    await deleteTaskBranches(deps, id);
    // The result is read from the upstream: the root workspace is not pulled.
    await git.fetch();
    await clearError(deps, id);
    return;
  }

  if (state !== "open" && state !== "closed") {
    throw refuse(`The work ${id} has no pull request to reject`);
  }
  if (state === "open") {
    if (reason) {
      await commentReason(deps, branch, reason);
    }
    await git.closePullRequest(branch);
  }
  await deleteTaskBranches(deps, id);
  await clearError(deps, id);
}
