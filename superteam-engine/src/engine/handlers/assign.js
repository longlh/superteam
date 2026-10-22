import { readJson, writeJson } from "../../lib/storage/files.js";
import { workFile, worktreeDir } from "../../lib/storage/paths.js";
import { validateWorkflow } from "../../lib/storage/validate.js";
import { createTasks, createTaskStore } from "../tasks.js";
import { startReady } from "./start-ready.js";

function refuse(message) {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

export async function assign(deps, event) {
  const { id, workflow: name, title, description, dod } = event.payload.data;
  const workflow = await deps.loadWorkflow(name);
  if (!workflow) {
    throw refuse(`unknown workflow ${name}`);
  }
  // Checked again: the file may have changed since the assign was accepted.
  const reason = validateWorkflow(workflow);
  if (reason !== null) {
    throw refuse(`workflow ${name}: ${reason}`);
  }

  const folder = worktreeDir(deps.baseDir, {
    workId: id,
  });
  await deps.git.createWorktree({
    folder,
    branch: `works/${id}`,
    base: await deps.git.rootBranch(),
  });

  if ((await readJson(workFile(folder, id))) === null) {
    const at = deps.now().toISOString();
    await writeJson(workFile(folder, id), {
      id,
      workflow: name,
      title,
      ...(description === undefined
        ? {}
        : {
            description,
          }),
      dod: dod ?? workflow.dod ?? [],
      createdAt: at,
      updatedAt: at,
    });
  }
  await deps.git.commitAll(folder, `Assign the work ${id}`);

  const store = createTaskStore(folder);
  const work = await readJson(workFile(folder, id));
  for (const task of createTasks(work, workflow, deps.now())) {
    if ((await store.get(task.id)) === null) {
      await store.put(task);
    }
  }

  await startReady({
    deps,
    workId: id,
  });
}
