import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventId,
  padOrder,
  parseEvent,
  sha256,
  validateEvent,
  validatePayload,
} from "./event.js";

const payload = {
  command: "write",
  target: "/a/b.txt",
  src: "hi",
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
  assert.equal(padOrder(999999), "999999");
});

test("sha256 is hex, and the id depends on createdAt and order", () => {
  assert.match(sha256("a"), /^[0-9a-f]{64}$/);
  assert.equal(sha256(Buffer.from("a")), sha256("a"));
  const id = eventId("2026-01-01T00:00:00.000Z", 1);
  assert.equal(id, eventId("2026-01-01T00:00:00.000Z", 1));
  assert.notEqual(id, eventId("2026-01-01T00:00:00.000Z", 2));
  assert.notEqual(id, eventId("2026-01-01T00:00:00.001Z", 1));
});

test("a payload with a version passes", () => {
  assert.equal(
    validatePayload({
      ...payload,
      version: 0,
    }),
    null,
  );
  assert.equal(
    validatePayload({
      ...payload,
      version: 3,
    }),
    null,
  );
});

test("a valid event and payload pass", () => {
  assert.equal(validateEvent(event), null);
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
  assert.equal(
    validatePayload({
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "https://x.test/f",
        headers: {
          a: "b",
        },
      },
    }),
    null,
  );
  assert.equal(
    validatePayload({
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "file:///f",
      },
    }),
    null,
  );
});

test("src wins, so a bad remoteSrc is ignored when src is set", () => {
  assert.equal(
    validatePayload({
      ...payload,
      remoteSrc: "nope",
    }),
    null,
  );
});

test("an empty src is still content", () => {
  assert.equal(
    validatePayload({
      ...payload,
      src: "",
    }),
    null,
  );
});

test("invalid payloads are rejected", () => {
  const bad = [
    null,
    {
      ...payload,
      version: -1,
    },
    {
      ...payload,
      version: "1",
    },
    {
      ...payload,
      version: 1.5,
    },
    {
      ...payload,
      command: "delete",
    },
    {
      ...payload,
      target: "relative.txt",
    },
    {
      ...payload,
      target: 1,
    },
    {
      ...payload,
      src: 5,
    },
    {
      command: "write",
      target: "/a",
    },
    {
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "ftp://x",
      },
    },
    {
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "not a url",
      },
    },
    {
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "file:///f",
        method: "POST",
      },
    },
    {
      command: "write",
      target: "/a",
      remoteSrc: {
        url: "file:///f",
        headers: [],
      },
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
      order: 1000000,
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
      payload: {},
    },
  ];
  for (const value of bad) {
    assert.equal(typeof validateEvent(value), "string", JSON.stringify(value));
  }
});

test("parseEvent returns the event when it is valid", () => {
  assert.deepEqual(parseEvent(JSON.stringify(event)), {
    event,
  });
});

test("parseEvent returns the error, and the parsed value when there is one", () => {
  const broken = parseEvent("{not json");
  assert.match(broken.error, /^invalid JSON/);
  assert.equal(broken.parsed, undefined);
  assert.deepEqual(parseEvent('{"a":1}').parsed, {
    a: 1,
  });
  assert.equal(typeof parseEvent('{"a":1}').error, "string");
});
