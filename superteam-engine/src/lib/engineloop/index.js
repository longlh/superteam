import { createControl } from "./control.js";
import { createFactory } from "./factory.js";
import { createHandlers } from "./handlers.js";
import { createLoop } from "./loop.js";
import { createPaths } from "./paths.js";
import { createQueue } from "./queue.js";
import { createSubscribers } from "./subscribers.js";

export { createSubscribers };

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultNow = () => new Date().toISOString();

export function createEngineLoop({
  baseDir,
  maxAttempts = 6,
  pollIntervalMs = 1000,
  sleep = defaultSleep,
  now = defaultNow,
}) {
  const queue = createQueue(createPaths(baseDir));
  const factory = createFactory({
    queue,
    now,
  });
  const handlers = createHandlers();
  const subscribers = createSubscribers();
  const loop = createLoop({
    queue,
    factory,
    handlers,
    subscribers,
    maxAttempts,
    pollIntervalMs,
    sleep,
    now,
  });
  const control = createControl({
    queue,
    factory,
    handlers,
    loop,
    subscribers,
  });

  return {
    handle: control.handle,
    enqueue: control.enqueue,
    requeue: control.requeue,
    subscribe: subscribers.subscribe,
    start: control.start,
    shutdown: control.shutdown,
  };
}
