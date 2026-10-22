import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MAX_ORDER,
  parseEvent,
  queueFileName,
  validateEvent,
  validateOrder,
  validatePayload,
} from "./event.js";

const event = {
  order: 1,
  id: "abc",
  payload: {
    type: "work:assign",
    data: {},
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  attempts: 0,
  errors: [],
};

describe("validatePayload", () => {
  test("a valid payload passes", () => {
    assert.deepEqual(
      validatePayload({
        type: "a",
        data: {
          x: 1,
        },
      }),
      {
        valid: true,
      },
    );
  });

  test("a type that is not a non-empty string is refused with a reason", () => {
    for (const type of [undefined, "", 3, null, {}]) {
      const result = validatePayload({
        type,
        data: {},
      });
      assert.equal(result.valid, false);
      assert.match(result.reason, /type/);
    }
  });

  test("a data that is not an object is refused with a reason", () => {
    for (const data of [undefined, null, "x", 3, []]) {
      const result = validatePayload({
        type: "a",
        data,
      });
      assert.equal(result.valid, false);
      assert.match(result.reason, /data/);
    }
  });

  test("a payload that is not an object is refused", () => {
    assert.equal(validatePayload(null).valid, false);
    assert.equal(validatePayload("x").valid, false);
  });
});

describe("order", () => {
  test("0 to 999999 passes, above it is refused", () => {
    assert.equal(validateOrder(0).valid, true);
    assert.equal(validateOrder(MAX_ORDER).valid, true);
    assert.equal(validateOrder(MAX_ORDER + 1).valid, false);
    assert.equal(validateOrder(-1).valid, false);
    assert.equal(validateOrder(1.5).valid, false);
  });

  test("the file name is padded to 6 digits", () => {
    assert.equal(queueFileName(1), "000001.json");
    assert.equal(queueFileName(0), "000000.json");
    assert.equal(queueFileName(999999), "999999.json");
  });
});

describe("validateEvent and parseEvent", () => {
  test("a valid event passes", () => {
    assert.equal(validateEvent(event).valid, true);
    assert.deepEqual(parseEvent(JSON.stringify(event)), {
      event,
    });
  });

  test("an order above 999999 is refused", () => {
    assert.equal(
      validateEvent({
        ...event,
        order: 1000000,
      }).valid,
      false,
    );
  });

  test("a wrong field is refused with a reason", () => {
    for (const bad of [
      {
        ...event,
        id: "",
      },
      {
        ...event,
        createdAt: 3,
      },
      {
        ...event,
        attempts: -1,
      },
      {
        ...event,
        errors: [
          {
            attempt: 0,
            error: "x",
            time: "t",
          },
        ],
      },
      {
        ...event,
        errors: "no",
      },
      {
        ...event,
        payload: {
          type: "a",
        },
      },
    ]) {
      assert.equal(validateEvent(bad).valid, false);
    }
  });

  test("broken JSON and a wrong structure give a reason", () => {
    assert.match(parseEvent("{oops").reason, /invalid JSON/);
    assert.match(parseEvent("[]").reason, /invalid event/);
  });
});
