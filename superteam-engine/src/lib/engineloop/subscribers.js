// The subscribers of the notifications of the loop.
export function createSubscribers() {
  // Each entry is { name, subscriber }, kept in the order of the subscription.
  let entries = [];

  return {
    // Returns a function that unsubscribes the subscriber.
    subscribe(name, subscriber) {
      const entry = {
        name,
        subscriber,
      };
      entries.push(entry);
      return () => {
        entries = entries.filter((e) => e !== entry);
      };
    },

    // Calls the subscribers in order and does not wait for them. The try and
    // catch only keeps a failing subscriber from stopping the loop or the other
    // subscribers: handling its error is not the job of the loop.
    emit(name, data) {
      for (const entry of entries.filter((e) => e.name === name)) {
        try {
          Promise.resolve(entry.subscriber(data)).catch(() => {});
        } catch {
          // A synchronous error of a subscriber is isolated here.
        }
      }
    },
  };
}
