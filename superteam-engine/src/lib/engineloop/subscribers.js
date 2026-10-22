// Subscribers by name. `emit` calls them in order and does not wait for them,
// and a subscriber that fails never stops the others.
export function createSubscribers() {
  const byName = new Map();

  return {
    subscribe(name, subscriber) {
      if (typeof subscriber !== "function") {
        throw new TypeError("subscriber must be a function");
      }
      if (!byName.has(name)) {
        byName.set(name, new Set());
      }
      // A wrapper, so the same function can subscribe twice.
      const entry = {
        subscriber,
      };
      byName.get(name).add(entry);
      return () => {
        byName.get(name)?.delete(entry);
      };
    },

    emit(name, data) {
      for (const { subscriber } of [...(byName.get(name) ?? [])]) {
        try {
          const result = subscriber(data);
          if (typeof result?.catch === "function") {
            result.catch(() => {});
          }
        } catch {
          // Isolated: a failing subscriber is not the problem of the loop.
        }
      }
    },
  };
}
