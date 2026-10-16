import { MAX_ORDER, eventId } from "./event.js";

// The factory creates events. It knows nothing of where they go: see queue.js.
export function createFactory({ now = () => new Date() }) {
  // The maximum `order` that was given out so far.
  let counter = 0;

  // Synchronous on purpose: two calls never get the same `order`.
  function build(payload, order, attempts, errors) {
    const createdAt = now().toISOString();
    return {
      order,
      id: eventId(createdAt, order),
      payload,
      createdAt,
      attempts,
      errors,
    };
  }

  return {
    setCounter(value) {
      counter = value;
    },

    // A new event goes to the end of the queue.
    // Throws when `order` would pass MAX_ORDER: the file name has 6 digits.
    create(payload) {
      if (counter >= MAX_ORDER) {
        throw new Error(`order above ${MAX_ORDER} is not supported`);
      }
      return build(payload, ++counter, 0, []);
    },

    // An event goes back to the head of the queue: `order` 0 is reserved for the
    // event of a retry and the event that is recovered at the start. It keeps
    // the errors of the attempts that failed.
    createAtHead: (payload, attempts, errors) =>
      build(payload, 0, attempts, errors),
  };
}
