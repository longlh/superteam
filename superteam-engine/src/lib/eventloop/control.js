import { clearTmp, ensurePaths } from "./paths.js";

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
  exit = process.exit,
}) {
  // True once the start stage is done: the folders exist and the counter is set.
  let isStarted = false;
  let isShuttingDown = false;
  // start() runs once: a second call, or a restart after shutdown, is refused.
  let isStartCalled = false;
  let isSignaled = false;

  // The iteration in progress finishes, then the loop stops.
  function shutdown() {
    isShuttingDown = true;
  }

  // A second signal is a force quit. The
  // claim stays, and the next start() recovers from it like from a crash.
  function onSignal() {
    if (isSignaled) {
      exit(130);
    }
    isSignaled = true;
    shutdown();
  }

  return {
    // Creates the event and writes it to the queue. Needs start() first.
    async enqueue(payload) {
      if (!isStarted) {
        throw new Error("enqueue() needs start() first");
      }
      const event = factory.create(payload);
      await queue.put(event);
      return event;
    },

    // 1. Start: the folders, the tmp clean-up, the counter, the recovery.
    // 2. Loop: until the shutdown. 3. Shutdown: no new iteration starts.
    // The signals call shutdown() unless handleSignals is false. A second
    // signal quits at once.
    async start({ fetchTimeoutMs, handleSignals = true } = {}) {
      if (isStartCalled) {
        throw new Error("start() can be called only once");
      }
      isStartCalled = true;
      if (handleSignals) {
        SIGNALS.forEach((s) => process.on(s, onSignal));
      }
      try {
        await ensurePaths(paths);
        await clearTmp(paths);
        factory.setCounter(await queue.maxOrder());
        await loop.recover();
        isStarted = true;
        while (!isShuttingDown) {
          if (
            !(await loop.iterate({
              fetchTimeoutMs,
            }))
          ) {
            await sleep(pollIntervalMs);
          }
        }
      } finally {
        SIGNALS.forEach((s) => process.off(s, onSignal));
      }
    },

    shutdown,
  };
}
