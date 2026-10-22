import { createEngine } from "../engine/index.js";
import { createAgents } from "../agents/index.js";
import { createNotifier } from "../notifier/index.js";
import { fromEnv } from "../notifier/google-chat.js";
import { createHttpApi } from "./http-api.js";

// Runs a callback of a subscription: a throw or a rejection is reported, and
// never reaches the publisher.
function guarded(fn) {
  return (data) => {
    try {
      Promise.resolve(fn(data)).catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
    }
  };
}

// Connects the containers: it holds no logic, it only decides whom to call,
// when, and with which input. The optional parts are for tests.
export function createOrchestrator({
  baseDir,
  port,
  maxBudgetUsd,
  subscriptions = [],
  engine = createEngine({
    baseDir,
  }),
  agents = createAgents({
    baseDir,
    maxBudgetUsd,
  }),
  notifier,
  httpApi = createHttpApi({
    engine,
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
    async start() {
      validate();

      const ready = new Promise((resolve) => {
        engine.subscribe("engine:ready", resolve);
      });
      engine.subscribe(
        "job:run",
        guarded((job) => {
          if (stopping) {
            return;
          }
          return agents.run(job, (result) =>
            engine.jobEnded(result).catch(report),
          );
        }),
      );
      engine.subscribe(
        "job:stop",
        guarded((data) => agents.stopWork(data.workId)),
      );
      for (const sub of subscriptions) {
        const target =
          notifier ??
          createNotifier({
            channels: [fromEnv(sub.env, process.env)],
          });
        engine.subscribe(
          sub.topic,
          guarded((data) =>
            target.send(() =>
              target.composeMessage(data, {
                getWork: engine.getWork,
              }),
            ),
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

function report(error) {
  console.error(error);
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
