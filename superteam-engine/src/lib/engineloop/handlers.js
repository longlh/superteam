// The handlers of the events: one handler for each type.
export function createHandlers() {
  const byType = new Map();

  return {
    // A type has one handler: a second one for the same type is a mistake.
    register(type, handler) {
      if (typeof handler !== "function") {
        throw new Error(`the handler of ${type} must be a function`);
      }
      if (byType.has(type)) {
        throw new Error(`${type} already has a handler`);
      }
      byType.set(type, handler);
    },

    // The handler of a type, or undefined when there is none.
    get: (type) => byType.get(type),
  };
}
