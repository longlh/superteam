export function createApiClient({ baseUrl, fetch: fetchFn = fetch }) {
  async function request(method, path, body) {
    const init = {
      method,
    };
    // Every POST says it is JSON, even with no body: the API refuses it else.
    if (method === "POST") {
      init.headers = {
        "content-type": "application/json",
      };
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, init);
    } catch (error) {
      const host = new URL(baseUrl).host;
      throw new Error(
        `The superteam orchestrator is not running on ${host}. Start it with /superteam:start.`,
        {
          cause: error,
        },
      );
    }
    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON: keep the text
    }
    return {
      status: response.status,
      body: parsed,
    };
  }

  return {
    request,
  };
}
