import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ORDER,
  eventId,
  padOrder,
  parseEvent,
  sha256,
  validateEvent,
  validatePayload,
} from "./event.js";

const payload = {
  type: "work:submit",
  data: {
    title: "a",
  },
};
const event = {
  order: 1,
  id: "x",
  payload,
  createdAt: "2026-01-01T00:00:00.000Z",
  attempts: 0,
  errors: [],
};

test("padOrder pads to 6 digits", () => {
  assert.equal(padOrder(0), "000000");
  assert.equal(padOrder(1), "000001");
  assert.equal(padOrder(MAX_ORDER), "999999");
});

test("sha256 gives 64 hex characters, and the id comes from createdAt and order", () => {
  assert.match(sha256("a"), /^[0-9a-f]{64}$/);
  assert.equal(
    eventId("2026-01-01T00:00:00.000Z", 1),
    eventId("2026-01-01T00:00:00.000Z", 1),
  );
  assert.notEqual(
    eventId("2026-01-01T00:00:00.000Z", 1),
    eventId("2026-01-01T00:00:00.001Z", 1),
  );
  assert.notEqual(
    eventId("2026-01-01T00:00:00.000Z", 1),
    eventId("2026-01-01T00:00:00.000Z", 2),
  );
});

test("a valid event and payload pass", () => {
  assert.equal(validateEvent(event), null);
  assert.equal(validatePayload(payload), null);
  assert.equal(
    validateEvent({
      ...event,
      errors: [
        {
          attempt: 1,
          error: "boom",
          time: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
    null,
  );
});

test("invalid payloads are rejected", () => {
  const bad = [
    null,
    [],
    "text",
    {},
    {
      type: "",
      data: {},
    },
    {
      type: 1,
      data: {},
    },
    {
      type: "a",
    },
    {
      type: "a",
      data: null,
    },
    {
      type: "a",
      data: [],
    },
    {
      type: "a",
      data: "text",
    },
  ];
  for (const value of bad) {
    assert.equal(
      typeof validatePayload(value),
      "string",
      JSON.stringify(value),
    );
  }
});

test("invalid events are rejected", () => {
  const bad = [
    null,
    [],
    {
      ...event,
      order: -1,
    },
    {
      ...event,
      order: MAX_ORDER + 1,
    },
    {
      ...event,
      order: 1.5,
    },
    {
      ...event,
      id: 1,
    },
    {
      ...event,
      createdAt: 1,
    },
    {
      ...event,
      attempts: undefined,
    },
    {
      ...event,
      attempts: -1,
    },
    {
      ...event,
      errors: undefined,
    },
    {
      ...event,
      errors: "boom",
    },
    {
      ...event,
      errors: [
        {
          attempt: 1,
          error: "boom",
        },
      ],
    },
    {
      ...event,
      errors: [
        {
          attempt: 0,
          error: "boom",
          time: "t",
        },
      ],
    },
    {
      ...event,
      errors: [null],
    },
    {
      ...event,
      payload: {},
    },
  ];
  for (const value of bad) {
    assert.equal(typeof validateEvent(value), "string", JSON.stringify(value));
  }
});

test("parseEvent returns the event, or the error and the parsed value", () => {
  assert.deepEqual(parseEvent(JSON.stringify(event)), {
    event,
  });
  assert.match(parseEvent("{not json").error, /^invalid JSON/);
  assert.equal(parseEvent("{not json").parsed, undefined);
  const wrong = parseEvent('{"a":1}');
  assert.equal(typeof wrong.error, "string");
  assert.deepEqual(wrong.parsed, {
    a: 1,
  });
});
