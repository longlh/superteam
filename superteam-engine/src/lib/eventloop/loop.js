import { parseEvent } from "./event.js";

// The loop does the work of the events: one iteration, and the recovery. It
// knows nothing of its own life cycle: see control.js.
export function createLoop({
  queue,
  factory,
  writer,
  subscribers,
  maxAttempts = 3,
  sleep,
  now = () => new Date(),
}) {
  // The event cannot be processed: move it to the DLQ and notify.
  async function reject(name, event, error) {
    await queue.toDlq(name);
    subscribers.emit("write:error", {
      event,
      error,
    });
  }

  // The write failed: record the error in the event, then retry at the head of
  // the queue, or give up. A write that cannot be fixed by a retry (`retryable`
  // is false), such as a stale write, gives up at once. The notifications carry the event with the error.
  async function fail(name, event, error) {
    const failed = {
      ...event,
      errors: [
        ...event.errors,
        {
          attempt: event.attempts + 1,
          error: error.message,
          time: now().toISOString(),
        },
      ],
    };
    if (error.retryable === false || failed.attempts + 1 >= maxAttempts) {
      await queue.toDlq(name, failed);
      subscribers.emit("write:error", {
        event: failed,
        error: error.message,
      });
      return;
    }
    await queue.put(
      factory.createAtHead(failed.payload, failed.attempts + 1, failed.errors),
    );
    await queue.deleteClaim(name);
    subscribers.emit("write:retry", {
      event: failed,
      error: error.message,
    });
  }

  // One iteration of loop(). Returns false when the queue was empty.
  async function iterate({ fetchTimeoutMs } = {}) {
    // 1. A claim that is still there is abandoned.
    for (const name of await queue.listClaims()) {
      await queue.toDlq(name);
    }

    // 2. Claim a new event. A retry waits 2^attempts seconds.
    const claim = await queue.claimNext();
    if (!claim) {
      return false;
    }
    const { event, parsed, error } = parseEvent(claim.raw);
    if (error) {
      await reject(claim.name, parsed ?? null, error);
      return true;
    }
    if (event.attempts > 0) {
      await sleep(2 ** event.attempts * 1000);
    }

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
  // queue with the same attempts and errors.
  async function recover() {
    for (const name of await queue.listClaims()) {
      const { event, parsed, error } = parseEvent(await queue.readClaim(name));
      if (error) {
        await reject(name, parsed ?? null, error);
        continue;
      }
      await queue.put(
        factory.createAtHead(event.payload, event.attempts, event.errors),
      );
      await queue.deleteClaim(name);
    }
  }

  return {
    iterate,
    recover,
  };
}
