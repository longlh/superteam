import { validateEvent } from "./event.js";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads the text of an event file. Returns { event } when it is valid, and
// { error, parsed } when it is not JSON or has a wrong structure.
function parseEvent(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { error: `invalid JSON: ${error.message}` };
  }
  const error = validateEvent(parsed);
  return error ? { error, parsed } : { event: parsed };
}

// The loop takes its parts as arguments, so it knows none of their jobs.
export function createLoop({
  queue,
  factory,
  writer,
  subscribers,
  maxAttempts = 3,
  pollIntervalMs = 1000,
  sleep = defaultSleep,
  now = () => new Date(),
}) {
  let isShuttingDown = false;
  let fetchTimeoutMs;

  // The event cannot be processed: move it to the DLQ and notify.
  async function reject(name, event, error) {
    await queue.toDlq(name);
    subscribers.emit("write:error", { event, error });
  }

  // The write failed: retry at the head of the queue, or give up.
  async function fail(name, event, error) {
    if (event.attempts + 1 >= maxAttempts) {
      return reject(name, event, error.message);
    }
    const retry = factory.create(event.payload, {
      order: 0,
      attempts: event.attempts + 1,
    });
    await factory.enqueue(retry);
    await queue.deleteClaim(name);
    subscribers.emit("write:retry", { event, error: error.message });
  }

  // One iteration of loop(). Returns false when the queue was empty.
  async function iterate() {
    // 1. A claim that is still there is abandoned.
    for (const name of await queue.listClaims()) await queue.toDlq(name);

    // 2. Claim a new event. A retry waits 2^attempts seconds.
    const claim = await queue.claimNext();
    if (!claim) return false;
    const { event, parsed, error } = parseEvent(claim.raw);
    if (error) {
      await reject(claim.name, parsed ?? null, error);
      return true;
    }
    if (event.attempts > 0) await sleep(2 ** event.attempts * 1000);

    // 3. Process the write.
    let hash;
    try {
      hash = await writer.write(event.payload, fetchTimeoutMs);
    } catch (writeError) {
      // 4. It failed.
      await fail(claim.name, event, writeError);
      return true;
    }

    // 4. It succeeded.
    await queue.deleteClaim(claim.name);
    subscribers.emit("write:done", {
      event,
      hash,
      time: now().toISOString(),
    });
    return true;
  }

  // Recovers from a crash: each abandoned claim goes back to the head of the
  // queue with the same attempts.
  async function recover() {
    for (const name of await queue.listClaims()) {
      const { event, parsed, error } = parseEvent(await queue.readClaim(name));
      if (error) {
        await reject(name, parsed ?? null, error);
        continue;
      }
      const head = factory.create(event.payload, {
        order: 0,
        attempts: event.attempts,
      });
      await factory.enqueue(head);
      await queue.deleteClaim(name);
    }
  }

  return {
    iterate,

    // The start stage: set the counter, then recover from a crash.
    async prepare() {
      factory.setCounter(await queue.maxOrder());
      await recover();
    },

    // The loop, until the shutdown.
    async run({ fetchTimeoutMs: timeoutMs } = {}) {
      fetchTimeoutMs = timeoutMs;
      while (!isShuttingDown) {
        if (!(await iterate())) await sleep(pollIntervalMs);
      }
    },

    // The iteration in progress finishes, then the loop stops.
    shutdown() {
      isShuttingDown = true;
    },
  };
}
