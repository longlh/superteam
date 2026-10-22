import { existsSync } from "node:fs";
import { readJson, writeJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";

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
export async function failWork({ deps, workId, error }) {
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
      updatedAt: deps.now().toISOString(),
    });
    await deps.git.commitAll(workFolder, `Fail the work ${workId}`);
  }
  await deps.git.push(`works/${workId}`);

  for (const task of await createTaskStore(workFolder).list()) {
    await deps.git.removeWorktree(
      worktreeDir(deps.baseDir, {
        workId,
        taskId: task.id,
      }),
    );
  }
  await deps.git.removeWorktree(workFolder);
  for (const branch of await deps.git.listBranches(`tasks/${workId}/`)) {
    await deps.git.deleteBranch(branch);
  }
}
