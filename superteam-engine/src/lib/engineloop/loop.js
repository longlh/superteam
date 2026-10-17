import { parseEvent } from "./event.js";

// The reason of a failure, as text.
const reasonOf = (error) =>
  error instanceof Error ? error.message : String(error);

// The loop does the work of the events: one iteration, and the recovery. It
// knows nothing of its own life cycle (see control.js), and nothing of what an
// event means: it gives the event to the handler of its type.
export function createLoop({
  queue,
  factory,
  handlers,
  subscribers,
  maxAttempts = 3,
  sleep,
  now = () => new Date(),
}) {
  // The event cannot be processed: move it to the DLQ and notify.
  async function reject(name, event, error) {
    await queue.toDlq(name);
    subscribers.emit("event:error", {
      event,
      error,
    });
  }

  // The handler failed: record the error in the event, then retry at the head
  // of the queue, or give up. An error that a retry cannot fix (`retryable` is
  // false) gives up at once. The notifications carry the event with the error.
  async function fail(name, event, error) {
    const reason = reasonOf(error);
    const failed = {
      ...event,
      errors: [
        ...event.errors,
        {
          attempt: event.attempts + 1,
          error: reason,
          time: now().toISOString(),
        },
      ],
    };
    if (error?.retryable === false || failed.attempts + 1 >= maxAttempts) {
      await queue.toDlq(name, failed);
      subscribers.emit("event:error", {
        event: failed,
        error: reason,
      });
      return;
    }
    await queue.put(
      factory.createAtHead(failed.payload, failed.attempts + 1, failed.errors),
    );
    await queue.deleteClaim(name);
    subscribers.emit("event:retry", {
      event: failed,
      error: reason,
    });
  }

  // Recovers from a crash: each abandoned claim goes back to the head of the
  // queue with the same attempts and errors, and is processed again. A claim
  // that is not valid goes to the DLQ.
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

  // One iteration of loop(). Returns false when the queue was empty.
  async function iterate() {
    // 1. A claim that is still there is abandoned: put it back.
    await recover();

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
    const handler = handlers.get(event.payload.type);
    if (!handler) {
      await reject(claim.name, event, `no handler for ${event.payload.type}`);
      return true;
    }
    if (event.attempts > 0) {
      await sleep(2 ** event.attempts * 1000);
    }

    // 3. Call the handler of the type.
    try {
      await handler(event);
    } catch (handlerError) {
      // 4. It failed.
      await fail(claim.name, event, handlerError);
      return true;
    }

    // 4. It succeeded.
    await queue.deleteClaim(claim.name);
    subscribers.emit("event:done", {
      event,
      time: now().toISOString(),
    });
    return true;
  }

  return {
    iterate,
    recover,
  };
}
