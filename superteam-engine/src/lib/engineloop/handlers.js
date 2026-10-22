export function createHandlers() {
  const byType = new Map();

  return {
    handle(type, handler) {
      if (typeof type !== "string" || type === "") {
        throw new TypeError("type must be a non-empty string");
      }
      if (typeof handler !== "function") {
        throw new TypeError(`the handler of ${type} must be a function`);
      }
      if (byType.has(type)) {
        throw new Error(`a handler is already registered for ${type}`);
      }
      byType.set(type, handler);
    },

    get(type) {
      return byType.get(type);
    },
  };
}
