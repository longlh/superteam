import { createFactory } from "./factory.js";
import { createControl } from "./control.js";
import { createLoop } from "./loop.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";
import { createWriter } from "./writer.js";
import { getPaths } from "./paths.js";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Puts the parts together and gives the public API.
export function createEventLoop({
  baseDir,
  maxAttempts,
  pollIntervalMs,
  sleep = defaultSleep,
  now,
}) {
  if (!baseDir) {
    throw new Error("baseDir is required");
  }
  const paths = getPaths(baseDir);
  const factory = createFactory({
    now,
  });
  const subscribers = createSubscribers();
  const queue = createQueue(paths);
  const loop = createLoop({
    queue,
    factory,
    writer: createWriter({
      paths,
    }),
    subscribers,
    maxAttempts,
    sleep,
    now,
  });
  const control = createControl({
    paths,
    queue,
    factory,
    loop,
    pollIntervalMs,
    sleep,
  });

  return {
    enqueue: control.enqueue,
    subscribe: subscribers.subscribe,
    start: control.start,
    shutdown: control.shutdown,
  };
}
