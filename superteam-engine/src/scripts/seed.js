import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { writeJson } from "../lib/storage/files.js";
import { isSlug } from "../lib/storage/ids.js";
import { workflowFile } from "../lib/storage/paths.js";
import { validateWorkflow } from "../lib/storage/validate.js";

const GITIGNORE_LINES = [".superteam/.r/", ".superteam/.env"];
const ENGINE_ROLES = ["task-merger", "work-merger"];

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function withLines(text, lines) {
  const prefix = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${prefix}${lines.map((line) => `${line}\n`).join("")}`;
}

export async function ensureGitignore(baseDir) {
  const file = path.join(baseDir, ".gitignore");
  const text = await readText(file);
  const present = new Set(text.split("\n").map((line) => line.trim()));
  const missing = GITIGNORE_LINES.filter((line) => !present.has(line));
  if (missing.length > 0) {
    await writeFile(file, withLines(text, missing));
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export async function ensurePort(baseDir) {
  const file = path.join(baseDir, ".superteam/.env");
  const text = await readText(file);
  const existing = parseEnv(text).SUPERTEAM_PORT;
  if (existing) {
    if (!/^\d+$/.test(existing)) {
      throw new Error(`SUPERTEAM_PORT is not a number: ${existing}`);
    }
    return Number(existing);
  }
  const port = await freePort();
  await mkdir(path.dirname(file), {
    recursive: true,
  });
  await writeFile(file, withLines(text, [`SUPERTEAM_PORT=${port}`]));
  return port;
}

export async function writeRole(
  baseDir,
  { name, description, tools, model, instructions },
) {
  if (!isSlug(name)) {
    throw new Error("name must be a slug");
  }
  if (ENGINE_ROLES.includes(name)) {
    throw new Error(
      `${name} is a role of the engine, it ships with the plugin`,
    );
  }
  if (typeof description !== "string" || description.trim() === "") {
    throw new Error("description must be a non-empty string");
  }
  if (/[\r\n]/.test(description)) {
    throw new Error("description must be one line");
  }
  if (model && !/^[A-Za-z0-9._-]+$/.test(model)) {
    throw new Error("model must be letters, digits, '.', '_' or '-'");
  }
  const header = [
    `name: ${name}`,
    `description: ${JSON.stringify(description.trim())}`,
  ];
  if (Array.isArray(tools) && tools.length > 0) {
    for (const tool of tools) {
      if (typeof tool !== "string" || !/^[^,\r\n]+$/.test(tool.trim())) {
        throw new Error(
          "each tool must be a non-empty string with no comma or newline",
        );
      }
    }
    const list = tools.includes("StructuredOutput")
      ? tools
      : [...tools, "StructuredOutput"];
    header.push(`tools: ${list.join(", ")}`);
  }
  if (model) {
    header.push(`model: ${model}`);
  }
  const file = path.join(baseDir, ".claude/agents", `${name}.md`);
  await mkdir(path.dirname(file), {
    recursive: true,
  });
  await writeFile(
    file,
    `---\n${header.join("\n")}\n---\n\n${String(instructions ?? "").trim()}\n`,
  );
  return file;
}

export async function writeWorkflow(baseDir, workflow) {
  const reason = validateWorkflow(workflow);
  if (reason) {
    throw new Error(reason);
  }
  const file = workflowFile(baseDir, workflow.name);
  await writeJson(file, workflow);
  return file;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function run(command, baseDir) {
  if (command === "init") {
    await ensureGitignore(baseDir);
    return `SUPERTEAM_PORT=${await ensurePort(baseDir)}`;
  }
  if (command === "role") {
    return writeRole(baseDir, await readStdinJson());
  }
  if (command === "workflow") {
    return writeWorkflow(baseDir, await readStdinJson());
  }
  throw new Error("usage: seed.js init | role | workflow");
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(await run(process.argv[2], process.cwd()));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
