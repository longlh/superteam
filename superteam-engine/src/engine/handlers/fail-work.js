import { existsSync } from "node:fs";
import { readJson, writeJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { clearError } from "./clear-error.js";
import { removeTasksFolder } from "./tasks-folder.js";

// Records a failed task: `completed` with an `error` makes it FAILED.
export async function failTask({ deps, workId, task, error }) {
  const at = deps.now().toISOString();
  await createTaskStore(
    worktreeDir(deps.baseDir, {
      workId,
    }),
  ).put({
    ...task,
    completed: true,
    error,
    completedAt: at,
    updatedAt: at,
  });
  await failWork({
    deps,
    workId,
    error,
  });
}

// Every step is idempotent, so a retry after a crash finishes the cleanup.
// `cause` is who failed: the agent, or the engine (see ADR 16).
export async function failWork({ deps, workId, error, cause = "agent" }) {
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  if (!existsSync(workFolder)) {
    return;
  }
  deps.publish("job:stop", {
    workId,
  });

  const file = workFile(workFolder, workId);
  const work = await readJson(file);
  if (work.error === undefined) {
    await writeJson(file, {
      ...work,
      error,
      errorCause: cause,
      updatedAt: deps.now().toISOString(),
    });
  }
  // Always: a commit that failed after the write is done by the retry, and a
  // clean worktree makes it a no-op.
  await deps.git.commitAll(workFolder, `Fail the work ${workId}`);
  await deps.git.push(deps.branches.work(workId));

  for (const task of await createTaskStore(workFolder).list()) {
    await deps.git.removeWorktree(
      worktreeDir(deps.baseDir, {
        workId,
        taskId: task.id,
      }),
    );
  }
  await deps.git.removeWorktree(workFolder);
  await removeTasksFolder(deps, workId);
  for (const branch of await deps.git.listBranches(
    deps.branches.tasksOf(workId),
  )) {
    await deps.git.deleteBranch(branch);
  }
  // The error is in the work now.
  await clearError(deps, workId);
}
