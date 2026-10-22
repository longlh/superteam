import { createSubscribers } from "../lib/engineloop/index.js";

// The notifications of the engine to whoever subscribes: exact topic match,
// subscribers called in order and not waited for, a failing one isolated.
export function createPubSub() {
  const subscribers = createSubscribers();
  return {
    subscribe: subscribers.subscribe,
    publish: subscribers.emit,
  };
}
