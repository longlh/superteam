import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGoogleChat, fromEnv } from "./google-chat.js";

function fakeFetch(answer) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({
      url,
      options,
    });
    return answer;
  };
  return {
    fetch,
    calls,
  };
}

describe("createGoogleChat", () => {
  it("posts the JSON body and returns true", async () => {
    const { fetch, calls } = fakeFetch({
      ok: true,
    });
    const chat = createGoogleChat({
      webhookUrl: "https://h",
      fetch,
    });
    assert.equal(await chat.post("hello"), true);
    assert.equal(calls[0].url, "https://h");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      text: "hello",
    });
  });

  it("returns false when fetch rejects", async () => {
    const chat = createGoogleChat({
      webhookUrl: "https://h",
      fetch: async () => {
        throw new Error("down");
      },
    });
    assert.equal(await chat.post("x"), false);
  });

  it("returns false on a non-2xx answer", async () => {
    const { fetch } = fakeFetch({
      ok: false,
    });
    const chat = createGoogleChat({
      webhookUrl: "https://h",
      fetch,
    });
    assert.equal(await chat.post("x"), false);
  });

  it("returns false when fetch does not answer within timeoutMs", async () => {
    const fetch = (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(options.signal.reason);
        });
      });
    const chat = createGoogleChat({
      webhookUrl: "https://h",
      fetch,
      timeoutMs: 20,
    });
    assert.equal(await chat.post("x"), false);
  });
});

describe("fromEnv", () => {
  it("reads the webhook from the named variable", async () => {
    const { fetch, calls } = fakeFetch({
      ok: true,
    });
    const chat = fromEnv(
      {
        webhook: "X",
      },
      {
        X: "https://h",
      },
      fetch,
    );
    assert.equal(await chat.post("m"), true);
    assert.equal(calls[0].url, "https://h");
  });

  it("throws an error naming the missing variable", () => {
    assert.throws(
      () =>
        fromEnv(
          {
            webhook: "X",
          },
          {},
        ),
      /X/,
    );
  });
});
