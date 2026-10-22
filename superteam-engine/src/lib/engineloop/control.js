// The life cycle: the start stage, the loop and the shutdown. It also owns
// `handle` and `enqueue`, which depend on the stage. It installs no signal
// handler: the process that owns the loop calls `shutdown()`.
export function createControl({ queue, factory, handlers, loop, subscribers }) {
  let started = false;
  let ready = false;
  let isShuttingDown = false;

  return {
    handle(type, handler) {
      if (started) {
        throw new Error("handle() must be called before start()");
      }
      handlers.handle(type, handler);
    },

    async enqueue(payload) {
      if (!ready) {
        throw new Error("enqueue() needs the start stage to be done");
      }
      return factory.create(payload);
    },

    async start() {
      if (started) {
        throw new Error("start() can be called only once");
      }
      started = true;
      await queue.ensureFolders();
      await queue.clearTmp();
      factory.setCounter(await queue.maxOrder());
      await loop.recoverClaims();
      ready = true;
      subscribers.emit("loop:ready");
      while (!isShuttingDown) {
        await loop.iterate();
      }
    },

    shutdown() {
      isShuttingDown = true;
    },
  };
}
