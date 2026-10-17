import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactory } from "./factory.js";
import { MAX_ORDER, eventId } from "./event.js";

const payload = {
  type: "work:submit",
  data: {},
};
const createdAt = "2026-01-01T00:00:00.000Z";
const setup = () =>
  createFactory({
    now: () => new Date(createdAt),
  });

test("create gives order, id, createdAt, attempts and no errors", () => {
  const factory = setup();
  assert.deepEqual(factory.create(payload), {
    order: 1,
    id: eventId(createdAt, 1),
    payload,
    createdAt,
    attempts: 0,
    errors: [],
  });
  assert.equal(factory.create(payload).order, 2);
});

test("100 calls at the same time give 100 different orders", async () => {
  const factory = setup();
  const events = await Promise.all(
    Array.from(
      {
        length: 100,
      },
      async () => factory.create(payload),
    ),
  );
  assert.equal(new Set(events.map((e) => e.order)).size, 100);
  assert.equal(new Set(events.map((e) => e.id)).size, 100);
});

test("setCounter continues from the given maximum", () => {
  const factory = setup();
  factory.setCounter(7);
  assert.equal(factory.create(payload).order, 8);
  factory.setCounter(2);
  assert.equal(factory.create(payload).order, 3);
});

test("createAtHead gives order 0 with the attempts and the errors, and keeps the counter", () => {
  const factory = setup();
  const errors = [
    {
      attempt: 1,
      error: "boom",
      time: createdAt,
    },
  ];
  assert.deepEqual(factory.createAtHead(payload, 2, errors), {
    order: 0,
    id: eventId(createdAt, 0),
    payload,
    createdAt,
    attempts: 2,
    errors,
  });
  assert.equal(factory.create(payload).order, 1);
});

test("create throws when the order would pass the maximum", () => {
  const factory = setup();
  factory.setCounter(MAX_ORDER - 1);
  assert.equal(factory.create(payload).order, MAX_ORDER);
  assert.throws(() => factory.create(payload), /not supported/);
});

test("the factory works with the real clock", () => {
  assert.match(createFactory().create(payload).createdAt, /^\d{4}-\d\d-\d\dT/);
});
