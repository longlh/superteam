import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { eventId, padOrder } from "./event.js";

// The factory creates events and writes them to the queue.
export function createFactory({ paths, now = () => new Date() }) {
  // The maximum `order` that was given out so far.
  let counter = 0;

  return {
    setCounter(value) {
      counter = value;
    },

    // Synchronous on purpose: two calls never get the same `order`.
    // An explicit `order` (0) is for the events that go back to the head.
    create(payload, { order, attempts = 0 } = {}) {
      const eventOrder = order ?? ++counter;
      const createdAt = now().toISOString();
      return {
        order: eventOrder,
        id: eventId(createdAt, eventOrder),
        payload,
        createdAt,
        attempts,
      };
    },

    // Atomic: write to tmp, then move into the queue. An existing file with the
    // same name is overwritten.
    async enqueue(event) {
      const tmpFile = path.join(paths.tmp, `${randomUUID()}.tmp`);
      await writeFile(tmpFile, JSON.stringify(event));
      await rename(
        tmpFile,
        path.join(paths.queue, `${padOrder(event.order)}.json`),
      );
    },
  };
}
