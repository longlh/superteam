import { ensurePaths } from "./paths.js";

const SIGNALS = ["SIGINT", "SIGTERM"];

// The control owns the life cycle of the loop: the start stage, the loop, and
// the shutdown. It also owns enqueue(), because enqueue() needs the start stage
// to be done.
export function createControl({
  paths,
  queue,
  factory,
  loop,
  pollIntervalMs = 1000,
  sleep,
}) {
  // True once the start stage is done: the folders exist and the counter is set.
  let isStarted = false;
  let isShuttingDown = false;

  // The iteration in progress finishes, then the loop stops.
  function shutdown() {
    isShuttingDown = true;
  }

  return {
    // Creates the event and writes it to the queue. Needs start() first.
    async enqueue(payload) {
      if (!isStarted) throw new Error("enqueue() needs start() first");
      const event = factory.create(payload);
      await queue.put(event);
      return event;
    },

    // 1. Start: the folders, the counter, the recovery.
    // 2. Loop: until the shutdown. 3. Shutdown: no new iteration starts.
    // The signals call shutdown() unless handleSignals is false.
    async start({ fetchTimeoutMs, handleSignals = true } = {}) {
      if (handleSignals) SIGNALS.forEach((s) => process.on(s, shutdown));
      try {
        await ensurePaths(paths);
        factory.setCounter(await queue.maxOrder());
        await loop.recover();
        isStarted = true;
        while (!isShuttingDown) {
          if (!(await loop.iterate({ fetchTimeoutMs }))) {
            await sleep(pollIntervalMs);
          }
        }
      } finally {
        SIGNALS.forEach((s) => process.off(s, shutdown));
      }
    },

    shutdown,
  };
}
