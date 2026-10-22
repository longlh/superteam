import { assign } from "./assign.js";

export function createEngineHandlers(deps) {
  return {
    "work:assign": (event) => assign(deps, event),
  };
}
