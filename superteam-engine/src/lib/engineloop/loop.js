import { parseEvent } from "./event.js";

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

// One iteration of the loop. Errors of the file system are not caught: they
// reject the iteration, and the loop fails fast.
export function createLoop({
  queue,
  factory,
  handlers,
  subscribers,
  maxAttempts,
  pollIntervalMs,
  sleep,
  now,
}) {
  async function reject(key, content, event, reason) {
    await queue.toDlq(key, content);
    subscribers.emit("event:error", {
      event,
      error: reason,
    });
  }

  // Puts every abandoned claim back at the head of the queue, with the same
  // payload, attempts and errors. A claim that is not valid goes to the DLQ.
  async function recoverClaims() {
    for (const { key, raw } of await queue.listClaims()) {
      const { event, reason } = parseEvent(raw);
      if (reason !== undefined) {
        await reject(key, raw, null, reason);
        continue;
      }
      await factory.createAtHead(event.payload, event.attempts, event.errors);
      await queue.deleteClaim(key);
    }
  }

  async function fail(key, event, error) {
    const reason = describe(error);
    const failed = {
      ...event,
      errors: [
        ...event.errors,
        {
          attempt: event.attempts + 1,
          error: reason,
          time: now(),
        },
      ],
    };
    if (error?.retryable === false || event.attempts + 1 >= maxAttempts) {
      await reject(key, failed, failed, reason);
      return;
    }
    const retry = await factory.createAtHead(
      event.payload,
      event.attempts + 1,
      failed.errors,
    );
    await queue.deleteClaim(key);
    subscribers.emit("event:retry", {
      event: retry,
      error: reason,
    });
  }

  async function process({ key, raw }) {
    const { event, reason } = parseEvent(raw);
    if (reason !== undefined) {
      await reject(key, raw, null, reason);
      return;
    }
    if (event.attempts > 0) {
      await sleep(2 ** event.attempts * 1000);
    }
    const handler = handlers.get(event.payload.type);
    if (handler === undefined) {
      const error = new Error(`no handler for ${event.payload.type}`);
      error.retryable = false;
      await fail(key, event, error);
      return;
    }
    try {
      await handler(event);
    } catch (error) {
      await fail(key, event, error);
      return;
    }
    await queue.deleteClaim(key);
    subscribers.emit("event:done", {
      event,
      time: now(),
    });
  }

  return {
    recoverClaims,

    async iterate() {
      await recoverClaims();
      const claimed = await queue.claimNext();
      if (claimed === null) {
        await sleep(pollIntervalMs);
        return;
      }
      await process(claimed);
    },
  };
}
