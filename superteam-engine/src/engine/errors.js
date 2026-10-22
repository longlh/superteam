// A refusal of a function of the engine. `code` says why: "invalid" (the body),
// "not-found" (the work or the workflow), "conflict" (the state of the work) or
// "unavailable" (the engine is starting).
export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
