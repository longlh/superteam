import { createEngine } from "../engine/index.js";
import { createAgents } from "../agents/index.js";
import { createGitAdapter } from "../engine/git-adapter.js";
import { consoleLog } from "../lib/log.js";
import { parseJobId } from "../lib/storage/ids.js";
import { createNotifier } from "../notifier/index.js";
import { fromEnv } from "../notifier/google-chat.js";
import { createHttpApi } from "./http-api.js";

// Runs a callback of a subscription: a throw or a rejection is logged, and
// never reaches the publisher.
function guarded(fn, log) {
  return (data) => {
    try {
      Promise.resolve(fn(data)).catch((error) => log.error(String(error)));
    } catch (error) {
      log.error(String(error));
    }
  };
}

// The type and the id of the event of a notification of the engine loop.
function eventOf(data) {
  const event = data?.event;
  return `${event?.payload?.type ?? "unknown"} (${event?.id ?? "no id"})`;
}

// The work of the event of a notification: its id, or the work of its job.
function workOf(data) {
  const payload = data?.event?.payload?.data;
  if (typeof payload?.id === "string") {
    return payload.id;
  }
  if (typeof payload?.jobId === "string") {
    return parseJobId(payload.jobId).workId ?? "unknown";
  }
  return "unknown";
}

// The line of an event that goes to the DLQ: what it was, for which work,
// how many attempts, why, and where its file is.
export function deadEventLine(data) {
  const attempts = data?.event?.errors?.length ?? 0;
  return `the event ${eventOf(data)} of the work ${workOf(data)} went to the DLQ after ${attempts} attempts: ${data?.error}; file: ${data?.file}`;
}

// Connects the containers: it holds no logic, it only decides whom to call,
// when, and with which input. The optional parts are for tests.
export function createOrchestrator({
  baseDir,
  port,
  maxBudgetUsd,
  subscriptions = [],
  log = consoleLog,
  engine = createEngine({
    baseDir,
    log: (message) => log.warn(message),
  }),
  agents = createAgents({
    baseDir,
    maxBudgetUsd,
    log,
  }),
  notifier,
  httpApi = createHttpApi({
    engine,
  }),
  git = createGitAdapter({
    baseDir,
  }),
}) {
  let engineDone;
  // Set when the shutdown begins: a job that a handler still publishes is not
  // run, so no agent outlives the shutdown. The engine publishes it again at
  // the next start, because it waits for it and it was never run.
  let stopping = false;

  function validate() {
    for (const sub of subscriptions) {
      if (sub.addon !== "notifier") {
        throw new Error(
          `unknown addon "${sub.addon}" for the topic "${sub.topic}"`,
        );
      }
    }
  }

  return {
    // The end of the engine, once started: it rejects when the engine stops
    // with an error.
    get done() {
      return engineDone;
    },

    // For the logs of the caller: a topic of the engine to a guarded callback.
    subscribe(topic, fn) {
      return engine.subscribe(topic, guarded(fn, log));
    },

    async start() {
      validate();
      if (!(await git.hasOrigin())) {
        throw new Error(
          "superteam cannot start: the project has no git remote named origin: add one with `git remote add origin <url>`",
        );
      }
      if ((await git.rootBranch()) === "") {
        throw new Error(
          "superteam cannot start: HEAD is detached: check out the root branch first",
        );
      }
      if ((await git.rootUpstream()) === null) {
        throw new Error(
          "superteam cannot start: the root branch tracks no branch on origin: set it with `git branch --set-upstream-to=origin/<branch>`, or push it with `git push --set-upstream origin HEAD`",
        );
      }
      if (!(await git.checkForge())) {
        throw new Error(
          "superteam cannot start: gh is not signed in to GitHub: run `gh auth login`",
        );
      }

      const ready = new Promise((resolve) => {
        engine.subscribe("engine:ready", resolve);
      });
      engine.subscribe(
        "job:run",
        guarded((job) => {
          if (stopping) {
            return;
          }
          log.info(`job ${job.id} runs, role ${job.role}`);
          return agents.run(job, (result) => {
            if (result?.error === undefined) {
              log.info(`job ${result?.id} ended`);
            } else {
              log.warn(`job ${result?.id} failed: ${result.error}`);
            }
            return engine
              .jobEnded(result)
              .catch((error) => log.error(String(error)));
          });
        }, log),
      );
      engine.subscribe(
        "job:stop",
        guarded((data) => agents.stopWork(data.workId), log),
      );
      engine.subscribe(
        "event:retry",
        guarded(
          (data) =>
            log.warn(
              `the event ${eventOf(data)} of the work ${workOf(data)} failed, retried: ${data?.error}`,
            ),
          log,
        ),
      );
      engine.subscribe(
        "event:error",
        guarded((data) => log.error(deadEventLine(data)), log),
      );
      for (const sub of subscriptions) {
        const target =
          notifier ??
          createNotifier({
            channels: [fromEnv(sub.env, process.env)],
          });
        engine.subscribe(
          sub.topic,
          guarded(
            (data) =>
              target.send(() =>
                target.composeMessage(data, {
                  getWork: engine.getWork,
                }),
              ),
            log,
          ),
        );
      }

      // Before the loop starts: after it, recover would kill the agents just
      // spawned for the events that were left in the queue.
      const jobs = await agents.recover();

      engineDone = engine.start();
      const failed = engineDone.then(() => {
        throw new Error("the engine stopped before it was ready");
      });
      await Promise.race([ready, failed]);

      await engine.reconcile(jobs);
      await httpApi.listen(port);
    },

    async shutdown() {
      stopping = true;
      await httpApi.close();
      await agents.stopAll();
      engine.shutdown();
      await engineDone;
    },
  };
}

// The first signal shuts down, the second is a force quit.
export function handleSignals({
  shutdown,
  on = process.on.bind(process),
  exit = process.exit,
}) {
  let signaled = false;
  const onSignal = () => {
    if (signaled) {
      exit(130);
      return;
    }
    signaled = true;
    shutdown();
  };
  on("SIGINT", onSignal);
  on("SIGTERM", onSignal);
}
