import { eventId } from "./event.js";

// The factory creates events. It knows nothing of where they go: see queue.js.
export function createFactory({ now = () => new Date() }) {
  // The maximum `order` that was given out so far.
  let counter = 0;

  // Synchronous on purpose: two calls never get the same `order`.
  function build(payload, order, attempts) {
    const createdAt = now().toISOString();
    return {
      order,
      id: eventId(createdAt, order),
      payload,
      createdAt,
      attempts,
    };
  }

  return {
    setCounter(value) {
      counter = value;
    },

    // A new event goes to the end of the queue.
    create: (payload) => build(payload, ++counter, 0),

    // An event goes back to the head of the queue: `order` 0 is reserved for the
    // event of a retry and the event that is recovered at the start.
    createAtHead: (payload, attempts) => build(payload, 0, attempts),
  };
}
