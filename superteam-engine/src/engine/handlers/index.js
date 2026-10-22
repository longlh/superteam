import { assign } from "./assign.js";
import { taskMergerEnded } from "./task-merger-ended.js";
import { workerEnded } from "./worker-ended.js";

export function createEngineHandlers(deps) {
  return {
    "work:assign": (event) => assign(deps, event),
    "worker:ended": (event) => workerEnded(deps, event),
    "task-merger:ended": (event) => taskMergerEnded(deps, event),
  };
}
