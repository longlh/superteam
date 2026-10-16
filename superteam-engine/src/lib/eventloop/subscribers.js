// The subscribers of the notifications of the loop.
export function createSubscribers() {
  // Each entry is { name, handler }, kept in the order of the subscription.
  let entries = [];

  return {
    // Returns a function that unsubscribes the handler.
    subscribe(name, handler) {
      const entry = {
        name,
        handler,
      };
      entries.push(entry);
      return () => {
        entries = entries.filter((e) => e !== entry);
      };
    },

    // Calls the handlers in order and does not wait for them. The try and catch
    // only keeps a failing handler from stopping the loop or the other
    // handlers: handling its error is not the job of the event loop.
    emit(name, data) {
      for (const entry of entries.filter((e) => e.name === name)) {
        try {
          Promise.resolve(entry.handler(data)).catch(() => {});
        } catch {
          // A synchronous error of a handler is isolated here.
        }
      }
    },
  };
}
