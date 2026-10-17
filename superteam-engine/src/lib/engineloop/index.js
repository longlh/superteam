import { createControl } from "./control.js";
import { createFactory } from "./factory.js";
import { createHandlers } from "./handlers.js";
import { createLoop } from "./loop.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";
import { getPaths } from "./paths.js";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Puts the parts together and gives the public API.
export function createEngineLoop({
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
  const handlers = createHandlers();
  const subscribers = createSubscribers();
  const queue = createQueue(paths);
  const loop = createLoop({
    queue,
    factory,
    handlers,
    subscribers,
    maxAttempts,
    sleep,
    now,
  });
  const control = createControl({
    paths,
    queue,
    factory,
    handlers,
    loop,
    pollIntervalMs,
    sleep,
  });

  return {
    handle: control.handle,
    enqueue: control.enqueue,
    subscribe: subscribers.subscribe,
    start: control.start,
    shutdown: control.shutdown,
  };
}
