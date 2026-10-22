import { createHash } from "node:crypto";
import { MAX_ORDER, validatePayload } from "./event.js";

export function createFactory({ queue, now }) {
  let counter = 0;

  async function build(order, payload, attempts, errors) {
    const createdAt = now();
    const event = {
      order,
      id: createHash("sha256").update(`${createdAt}:${order}`).digest("hex"),
      payload,
      createdAt,
      attempts,
      errors,
    };
    await queue.put(event);
    return event;
  }

  return {
    setCounter(value) {
      counter = value;
    },

    // A new event goes to the tail: order is the counter plus one. The counter
    // moves before the first await, so two calls never share an order.
    async create(payload) {
      const result = validatePayload(payload);
      if (!result.valid) {
        throw new Error(result.reason);
      }
      if (counter + 1 > MAX_ORDER) {
        throw new Error(`the queue is full: order is above ${MAX_ORDER}`);
      }
      counter += 1;
      return build(counter, payload, 0, []);
    },

    // An event that goes back to the head of the queue: order 0.
    createAtHead(payload, attempts, errors) {
      return build(0, payload, attempts, [...errors]);
    },
  };
}
