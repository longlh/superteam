import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNotifier } from "./index.js";

const getWork = async () => ({
  title: "T",
  status: "OPEN",
});

describe("send", () => {
  it("composes once and gives the text to every channel", async () => {
    const seen = [];
    const channel = {
      post: async (m) => {
        seen.push(m);
        return true;
      },
    };
    let composed = 0;
    await createNotifier({
      channels: [channel, channel],
    }).send(() => {
      composed += 1;
      return "msg";
    });
    assert.equal(composed, 1);
    assert.deepEqual(seen, ["msg", "msg"]);
  });

  it("a failing channel does not stop the others", async () => {
    const seen = [];
    const bad = {
      post: async () => {
        throw new Error("boom");
      },
    };
    const good = {
      post: async (m) => {
        seen.push(m);
        return true;
      },
    };
    await createNotifier({
      channels: [bad, good],
    }).send(async () => "m");
    assert.deepEqual(seen, ["m"]);
  });

  it("does not throw when composeMessage throws", async (t) => {
    const error = t.mock.method(console, "error", () => {});
    await createNotifier({
      channels: [],
    }).send(() => {
      throw new Error("bad");
    });
    assert.equal(error.mock.callCount(), 1);
  });
});

describe("composeMessage", () => {
  const { composeMessage } = createNotifier({
    channels: [],
  });

  it("builds the text of a bare event", async () => {
    const text = await composeMessage(
      {
        payload: {
          type: "work:assign",
          data: {
            id: "w",
          },
        },
      },
      {
        getWork,
      },
    );
    assert.equal(text, 'work:assign: w "T" (OPEN)');
  });

  it("reads the work id from data.jobId", async () => {
    const ids = [];
    const text = await composeMessage(
      {
        event: {
          payload: {
            type: "worker:ended",
            data: {
              jobId: "w/t/worker",
            },
          },
        },
        time: 1,
      },
      {
        getWork: async (id) => {
          ids.push(id);
          return {
            title: "T",
            status: "IN_PROGRESS",
          };
        },
      },
    );
    assert.deepEqual(ids, ["w"]);
    assert.equal(text, 'worker:ended: w "T" (IN_PROGRESS)');
  });

  it("appends the error", async () => {
    const text = await composeMessage(
      {
        event: {
          payload: {
            type: "worker:ended",
            data: {
              id: "w",
            },
          },
        },
        error: "boom",
      },
      {
        getWork,
      },
    );
    assert.equal(text, 'worker:ended: w "T" (OPEN): boom');
  });

  it("builds the text without work info when getWork throws", async () => {
    const text = await composeMessage(
      {
        payload: {
          type: "work:assign",
          data: {
            id: "w",
          },
        },
      },
      {
        getWork: async () => {
          throw new Error("gone");
        },
      },
    );
    assert.equal(text, "work:assign: w");
  });

  it("does not call getWork without a work id", async () => {
    let called = false;
    const text = await composeMessage(
      {
        payload: {
          type: "x:y",
        },
      },
      {
        getWork: async () => {
          called = true;
        },
      },
    );
    assert.equal(called, false);
    assert.equal(text, "x:y");
  });
});
