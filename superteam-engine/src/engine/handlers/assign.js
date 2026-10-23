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
  const folder = worktreeDir(deps.baseDir, {
    workId: id,
  });
  await deps.git.fetch();
  // The upstream that `assign` checked; a retry keeps the base of the work
  // that is already written.
  const base =
    (await readJson(workFile(folder, id)))?.base ?? event.payload.data.base;
  if (typeof base !== "string" || base === "") {
    throw refuse(`the work:assign event of ${id} has no base`);
  }
  const workflow = await deps.loadWorkflow(name, base);
  if (!workflow) {
    throw refuse(`unknown workflow ${name}`);
  }
  // Checked again: the file may have changed since the assign was accepted.
  const reason = validateWorkflow(workflow);
  if (reason !== null) {
    throw refuse(`workflow ${name}: ${reason}`);
  }

  await deps.git.createWorktree({
    folder,
    branch: `works/${id}`,
    base: `origin/${base}`,
  });

  if ((await readJson(workFile(folder, id))) === null) {
    const at = deps.now().toISOString();
    await writeJson(workFile(folder, id), {
      id,
      workflow: name,
      base,
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
