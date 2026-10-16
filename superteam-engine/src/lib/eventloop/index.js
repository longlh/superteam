import { createFactory } from "./factory.js";
import { createLoop } from "./loop.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";
import { createWriter } from "./writer.js";
import { ensurePaths, getPaths } from "./paths.js";

const SIGNALS = ["SIGINT", "SIGTERM"];

// Puts the parts together and gives the public API.
export function createEventLoop({
  baseDir,
  maxAttempts,
  pollIntervalMs,
  sleep,
  now,
}) {
  if (!baseDir) throw new Error("baseDir is required");
  const paths = getPaths(baseDir);
  const factory = createFactory({ paths, now });
  const subscribers = createSubscribers();
  const loop = createLoop({
    queue: createQueue(paths),
    factory,
    writer: createWriter({ paths }),
    subscribers,
    maxAttempts,
    pollIntervalMs,
    sleep,
    now,
  });

  // True once the start stage is done: the folders exist and the counter is set.
  let isStarted = false;

  return {
    // Creates the event and writes it to the queue. Needs start() first.
    async enqueue(payload) {
      if (!isStarted) throw new Error("enqueue() needs start() first");
      const event = factory.create(payload);
      await factory.enqueue(event);
      return event;
    },

    subscribe: subscribers.subscribe,

    // Runs until shutdown(). The signals call shutdown() unless turned off.
    async start({ fetchTimeoutMs, handleSignals = true } = {}) {
      await ensurePaths(paths);
      if (handleSignals) SIGNALS.forEach((s) => process.on(s, loop.shutdown));
      try {
        await loop.prepare();
        isStarted = true;
        await loop.run({ fetchTimeoutMs });
      } finally {
        SIGNALS.forEach((s) => process.off(s, loop.shutdown));
      }
    },

    shutdown: loop.shutdown,
  };
}
