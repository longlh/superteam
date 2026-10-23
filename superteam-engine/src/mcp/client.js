import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";

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

// A request to the API of the workspace: the port is read from .superteam/.env
// at each call, so the MCP server works even when the file is written or
// changed after the session has started.
export function createWorkspaceRequest({ baseDir, fetch: fetchFn = fetch }) {
  return async (method, path, body) => {
    let port;
    try {
      port = parseEnv(
        await readFile(join(baseDir, ".superteam", ".env"), "utf8"),
      ).SUPERTEAM_PORT;
    } catch {
      // no file: no port
    }
    if (!port) {
      throw new Error(
        "SUPERTEAM_PORT is not set in .superteam/.env. Run /superteam:def-role or /superteam:def-process to seed it.",
      );
    }
    return createApiClient({
      baseUrl: `http://127.0.0.1:${port}`,
      fetch: fetchFn,
    }).request(method, path, body);
  };
}
