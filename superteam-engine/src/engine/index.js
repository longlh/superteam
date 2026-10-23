import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createEngineLoop } from "../lib/engineloop/index.js";
import { readJson } from "../lib/storage/files.js";
import { isSlug, newWorkId, parseJobId } from "../lib/storage/ids.js";
import {
  p,
  r,
  workFile,
  workflowFile,
  worktreeDir,
} from "../lib/storage/paths.js";
import {
  approvalStatus,
  taskStatus,
  workStatus,
} from "../lib/storage/status.js";
import {
  validateAssignBody,
  validateWorkflow,
} from "../lib/storage/validate.js";
import { EngineError } from "./errors.js";
import { createGitAdapter } from "./git-adapter.js";
import { createEngineHandlers } from "./handlers/index.js";
import { failWork } from "./handlers/fail-work.js";
import { startReady, taskJob } from "./handlers/start-ready.js";
import { buildJob } from "./jobs.js";
import { createPubSub } from "./pubsub.js";
import { createTaskStore } from "./tasks.js";

const JOB_KINDS = ["worker", "task-merger", "work-merger"];
const LOOP_NOTIFICATIONS = ["event:done", "event:retry", "event:error"];
const KILLED = "the agent was killed";

// The names in a folder that pass `keep`, sorted; none when it is missing.
async function listNames(dir, keep) {
  let entries;
  try {
    entries = await readdir(dir, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter(keep)
    .map((entry) => entry.name)
    .sort();
}

const branchOf = (id) => `works/${id}`;

// A file read from git, or null when it is missing or is not valid JSON: a
// corrupt file counts as not found on that source.
function parseJson(text) {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A workflow that cannot be read from the upstream: it is not retried.
function corrupted(reason) {
  return Object.assign(new Error(`corrupted workflow data: ${reason}`), {
    retryable: false,
    corrupted: true,
  });
}

// The first line of the stderr of a failed command, else of its message.
function shortReason(error) {
  const text = String(error?.stderr ?? "").trim() || String(error?.message);
  return text.split("\n")[0].trim().slice(0, 200);
}

export function createEngine({
  baseDir,
  git = createGitAdapter({
    baseDir,
  }),
  loopOptions = {},
  log = console.error,
}) {
  // The git of the functions of the engine: a failure of git or gh (offline,
  // no origin, gh signed out) is "unavailable", with a short reason.
  const remote = new Proxy(git, {
    get(target, name) {
      const value = target[name];
      if (typeof value !== "function") {
        return value;
      }
      return async (...args) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          throw new EngineError(
            "unavailable",
            `git or gh failed (${String(name)}): ${shortReason(error)}`,
          );
        }
      };
    },
  });
  // A workflow is read from `base`, the upstream of the root branch, never from
  // the root workspace: null when the upstream has no file for it, corrupted
  // when the upstream is not on origin or the file is not valid JSON. `source`
  // is the git of a handler or of a function.
  const workflowLoader = (source) => async (name, base) => {
    if (!isSlug(name)) {
      return null;
    }
    if (!(await source.hasRemoteBranch(base))) {
      throw corrupted(`origin/${base} does not exist`);
    }
    const file = path.relative(baseDir, workflowFile(baseDir, name));
    const text = await source.readFileOnRemote(base, file);
    if (text === null) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw corrupted(`${file} on origin/${base} is not valid JSON`);
    }
  };
  const pubsub = createPubSub();
  const loop = createEngineLoop({
    ...loopOptions,
    baseDir,
  });
  const deps = {
    baseDir,
    git,
    loadWorkflow: workflowLoader(git),
    publish: pubsub.publish,
    now: () => new Date(),
  };
  for (const [type, handler] of Object.entries(createEngineHandlers(deps))) {
    loop.handle(type, handler);
  }
  // Its own event, so the events left in the queue are processed first.
  loop.handle("engine:reconcile", (event) =>
    reconcileJobs(event.payload.data.killed),
  );

  let ready = false;
  loop.subscribe("loop:ready", () => {
    ready = true;
    pubsub.publish("engine:ready");
  });
  for (const topic of LOOP_NOTIFICATIONS) {
    loop.subscribe(topic, (data) => pubsub.publish(topic, data));
  }

  function ensureReady() {
    if (!ready) {
      throw new EngineError("unavailable", "the engine is starting");
    }
  }

  async function enqueue(type, data) {
    const event = await loop.enqueue({
      type,
      data,
    });
    return event.id;
  }

  const worksFolder = path.join(r(baseDir), "worktrees", "works");

  // The work of an id from the first source that has it: the work worktree
  // (with its tasks), the branch of the work, then the branch on which its pull
  // request was merged, else the upstream of the root branch (the branch it was
  // merged on can be gone), given with that pull request.
  async function findWork(id) {
    const folder = worktreeDir(baseDir, {
      workId: id,
    });
    const inWorktree = await readJson(workFile(folder, id));
    if (inWorktree !== null) {
      return {
        work: inWorktree,
        tasks: await createTaskStore(folder).list(),
        root: false,
      };
    }
    const text = await remote.readFileOnBranch(
      branchOf(id),
      path.relative(baseDir, workFile(baseDir, id)),
    );
    const onBranch = parseJson(text);
    if (onBranch !== null) {
      return {
        work: onBranch,
        tasks: [],
        root: false,
      };
    }
    const pr = await remote.getPullRequest(branchOf(id));
    if (pr?.state === "merged") {
      const file = path.relative(baseDir, workFile(baseDir, id));
      const upstream = await remote.rootUpstream();
      for (const branch of new Set([pr.base, upstream])) {
        const merged =
          branch === null
            ? null
            : parseJson(await remote.readFileOnRemote(branch, file));
        if (merged !== null) {
          return {
            work: merged,
            tasks: [],
            root: true,
            pr,
          };
        }
      }
    }
    return null;
  }

  // The state of a work, or null. It does not fetch: the caller does.
  async function readWork(id) {
    const found = await findWork(id);
    if (found === null) {
      return null;
    }
    const { work, tasks, root } = found;
    const pr = root ? found.pr : await remote.getPullRequest(branchOf(id));
    return {
      id,
      title: work.title,
      workflow: work.workflow,
      status: workStatus({
        work,
        tasks,
        proposed: root || pr !== null,
      }),
      approvalStatus: root ? "APPROVED" : approvalStatus(pr),
      ...(pr === null
        ? {}
        : {
            pullRequest: pr.url,
          }),
      ...(work.error === undefined
        ? {}
        : {
            error: work.error,
          }),
    };
  }

  // Offline, the state is read from the local refs, with a warning.
  async function fetchOrWarn() {
    try {
      await git.fetch();
    } catch (error) {
      log(
        `warning: git fetch failed, the local refs are used: ${shortReason(error)}`,
      );
    }
  }

  async function getWork(id) {
    if (!isSlug(id)) {
      throw new EngineError("not-found", `no work ${id}`);
    }
    await fetchOrWarn();
    const state = await readWork(id);
    if (state === null) {
      throw new EngineError("not-found", `no work ${id}`);
    }
    return state;
  }

  async function isUsed(id) {
    return (
      (await remote.branchExists(branchOf(id))) ||
      (await remote.getPullRequest(branchOf(id))) !== null
    );
  }

  async function newId() {
    let id;
    do {
      id = newWorkId();
    } while (await isUsed(id));
    return id;
  }

  async function jobEnded(result) {
    ensureReady();
    const id = result?.id;
    const kind = typeof id === "string" ? parseJobId(id).kind : undefined;
    if (!JOB_KINDS.includes(kind)) {
      throw new EngineError("invalid", `invalid job id ${id}`);
    }
    await enqueue(`${kind}:ended`, {
      jobId: id,
      summary: result.summary,
      data: result.data,
      error: result.error,
    });
  }

  // The jobs of the started tasks of a work: a task that is not completed and
  // has a worktree.
  async function startedJobs(work, tasks) {
    const jobs = [];
    for (const task of tasks) {
      const workdir = worktreeDir(baseDir, {
        workId: work.id,
        taskId: task.id,
      });
      if (task.completed || !existsSync(workdir)) {
        continue;
      }
      jobs.push(
        await taskJob({
          deps,
          work,
          task,
          tasks,
        }),
      );
    }
    return jobs;
  }

  // The jobs that the engine waits for, rebuilt from the disk, after what a
  // throw may have left undone: a failed work whose worktree is left is failed
  // again (the cleanup is idempotent), and the ready tasks of a running work
  // that have no worktree are started (startReady publishes their jobs). Then
  // come the started tasks of the running works, and the work merger of a work
  // whose tasks are all done and that has no pull request yet. A work whose
  // files cannot be read is skipped, so one bad work does not fail the others.
  // An error of git is not caught: every step is idempotent, so a retry is
  // safe.
  async function waitingJobs() {
    const jobs = [];
    const ids = await listNames(
      worksFolder,
      (entry) => entry.isDirectory() && isSlug(entry.name),
    );
    for (const workId of ids) {
      const folder = worktreeDir(baseDir, {
        workId,
      });
      let work;
      let tasks;
      try {
        work = await readJson(workFile(folder, workId));
        tasks = await createTaskStore(folder).list();
      } catch (error) {
        log(`reconcile skips the work ${workId}: ${error.message}`);
        continue;
      }
      if (work === null) {
        log(`reconcile skips the work ${workId}: it has no work file`);
        continue;
      }
      if (work.error !== undefined) {
        await failWork({
          deps,
          workId,
          error: work.error,
        });
        continue;
      }
      const started = await startReady({
        deps,
        workId,
      });
      for (const job of await startedJobs(work, tasks)) {
        if (!started.includes(job.id)) {
          jobs.push(job);
        }
      }
      if (
        tasks.length > 0 &&
        tasks.every((t) => taskStatus(t, tasks) === "DONE") &&
        (await git.getPullRequest(branchOf(workId))) === null
      ) {
        jobs.push(
          buildJob({
            kind: "work-merger",
            work,
            tasks,
            workdir: folder,
          }),
        );
      }
    }
    return jobs;
  }

  // A waiting job that was killed ends with an error; any other waiting job
  // is published again. A killed job that is not waited for is ignored.
  async function reconcileJobs(killedIds) {
    const killed = new Set(killedIds);
    for (const job of await waitingJobs()) {
      if (killed.has(job.id)) {
        await enqueue(`${parseJobId(job.id).kind}:ended`, {
          jobId: job.id,
          error: KILLED,
        });
      } else {
        pubsub.publish("job:run", job);
      }
    }
  }

  return {
    async assign(body) {
      ensureReady();
      const reason = validateAssignBody(body);
      if (reason !== null) {
        throw new EngineError("invalid", reason);
      }
      // A work starts from the latest upstream: offline, it is refused.
      await remote.fetch();
      if ((await remote.rootBranch()) === "") {
        throw new EngineError(
          "unavailable",
          "HEAD is detached: check out the root branch first",
        );
      }
      const base = await remote.rootUpstream();
      if (base === null) {
        throw new EngineError(
          "unavailable",
          "the root branch tracks no branch on origin: set its upstream with `git push --set-upstream origin HEAD`",
        );
      }
      let workflow;
      try {
        workflow = await workflowLoader(remote)(body.workflow, base);
      } catch (error) {
        if (error.corrupted) {
          throw new EngineError("invalid", error.message);
        }
        throw error;
      }
      if (workflow === null) {
        throw new EngineError("not-found", `no workflow ${body.workflow}`);
      }
      const refusal = validateWorkflow(workflow);
      if (refusal !== null) {
        throw new EngineError(
          "invalid",
          `workflow ${body.workflow}: ${refusal}`,
        );
      }
      let id = body.id;
      if (id === undefined) {
        id = await newId();
      } else if (await isUsed(id)) {
        throw new EngineError("conflict", `the id ${id} is used`);
      }
      const eventId = await enqueue("work:assign", {
        ...body,
        id,
        base,
      });
      return {
        id,
        eventId,
      };
    },

    async decide(id, decision) {
      ensureReady();
      if (!isSlug(id) || (decision !== "approve" && decision !== "reject")) {
        throw new EngineError(
          "invalid",
          `invalid decision ${decision} of ${id}`,
        );
      }
      const state = await getWork(id);
      if (state.approvalStatus !== "PROPOSED") {
        throw new EngineError("conflict", `the work ${id} is not PROPOSED`);
      }
      return {
        eventId: await enqueue("work:decide", {
          id,
          decision,
        }),
      };
    },

    async archive(id) {
      ensureReady();
      if (!isSlug(id)) {
        throw new EngineError("invalid", `invalid id ${id}`);
      }
      const state = await getWork(id);
      if (state.status !== "FAILED" && state.approvalStatus !== "REJECTED") {
        throw new EngineError(
          "conflict",
          `the work ${id} is neither FAILED nor REJECTED`,
        );
      }
      return {
        eventId: await enqueue("work:archive", {
          id,
        }),
      };
    },

    getWork,

    async listWorks() {
      await fetchOrWarn();
      const ids = [
        ...(await listNames(worksFolder, (entry) => entry.isDirectory())),
        ...(await remote.listBranches("works/")).map((branch) =>
          branch.slice("works/".length),
        ),
        ...(await remote.listMergedPullRequests("works/")).map(({ branch }) =>
          branch.slice("works/".length),
        ),
      ];
      const works = [];
      for (const id of new Set(ids.filter(isSlug))) {
        const state = await readWork(id);
        if (state !== null) {
          works.push(state);
        }
      }
      return works;
    },

    jobEnded,

    // Enqueues `engine:reconcile`: its handler runs after every event left in
    // the queue, so a job whose end is still queued is not published again.
    async reconcile(jobs) {
      ensureReady();
      await enqueue("engine:reconcile", {
        killed: (jobs ?? [])
          .map((job) => job?.id)
          .filter((id) => typeof id === "string"),
      });
    },

    subscribe: pubsub.subscribe,
    async start() {
      await git.ensureExcluded(".superteam/.r/");
      return loop.start();
    },
    shutdown: () => loop.shutdown(),
  };
}
