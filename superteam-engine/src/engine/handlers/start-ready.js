import { existsSync } from "node:fs";
import { listJson, readJson } from "../../lib/storage/files.js";
import {
  artifactsDir,
  workFile,
  worktreeDir,
} from "../../lib/storage/paths.js";
import { taskStatus } from "../../lib/storage/status.js";
import { buildJob } from "../jobs.js";
import { createTaskStore } from "../tasks.js";

export async function workerJob({ deps, work, task, tasks }) {
  const workdir = worktreeDir(deps.baseDir, {
    workId: work.id,
    taskId: task.id,
  });
  const artifacts = (await listJson(artifactsDir(workdir, work.id))).filter(
    (artifact) => task.dependOn.includes(artifact.task),
  );
  return buildJob({
    kind: "worker",
    work,
    task,
    tasks,
    workdir,
    artifacts,
  });
}

export async function startReady({ deps, workId }) {
  const workFolder = worktreeDir(deps.baseDir, {
    workId,
  });
  const work = await readJson(workFile(workFolder, workId));
  const tasks = await createTaskStore(workFolder).list();
  const rootBranch = await deps.git.rootBranch();

  for (const task of tasks) {
    const folder = worktreeDir(deps.baseDir, {
      workId,
      taskId: task.id,
    });
    if (taskStatus(task, tasks) !== "IN_PROGRESS" || existsSync(folder)) {
      continue;
    }
    const [first] = task.dependOn;
    await deps.git.createWorktree({
      folder,
      branch: `tasks/${workId}/${task.id}`,
      base: first === undefined ? rootBranch : `tasks/${workId}/${first}`,
    });
    const job =
      task.dependOn.length > 1
        ? buildJob({
            kind: "task-merger",
            work,
            task,
            tasks,
            workdir: folder,
          })
        : await workerJob({
            deps,
            work,
            task,
            tasks,
          });
    deps.publish("job:run", job);
  }
}
