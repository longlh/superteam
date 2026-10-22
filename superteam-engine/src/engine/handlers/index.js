import { archive } from "./archive.js";
import { assign } from "./assign.js";
import { decide } from "./decide.js";
import { taskMergerEnded } from "./task-merger-ended.js";
import { workMergerEnded } from "./work-merger-ended.js";
import { workerEnded } from "./worker-ended.js";

export function createEngineHandlers(deps) {
  return {
    "work:assign": (event) => assign(deps, event),
    "worker:ended": (event) => workerEnded(deps, event),
    "task-merger:ended": (event) => taskMergerEnded(deps, event),
    "work-merger:ended": (event) => workMergerEnded(deps, event),
    "work:decide": (event) => decide(deps, event),
    "work:archive": (event) => archive(deps, event),
  };
}
