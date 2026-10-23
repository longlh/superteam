import fs from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createGitAdapter } from "../engine/git-adapter.js";
import { writeJson } from "../lib/storage/files.js";
import { isSlug } from "../lib/storage/ids.js";
import { p, workflowFile } from "../lib/storage/paths.js";
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

// The names in a folder that end with `ext`, sorted; none when it is missing.
async function filesOf(dir, ext) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(ext)).sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// Checks that the setup of the root workspace is on the upstream of the root
// branch, where the engine and the worktrees read it: each workflow and role
// with the same content, each role that a workflow names, and the lines of the
// .gitignore. Returns "ok", or throws with the files to push.
export async function checkPushed(
  baseDir,
  git = createGitAdapter({
    baseDir,
  }),
) {
  await git.fetch();
  if ((await git.rootBranch()) === "") {
    throw new Error("HEAD is detached: check out the root branch first");
  }
  const base = await git.rootUpstream();
  if (base === null) {
    throw new Error(
      "the root branch tracks no branch on origin: push it with `git push --set-upstream origin HEAD`",
    );
  }
  if (!(await git.hasRemoteBranch(base))) {
    throw new Error(`corrupted workflow data: origin/${base} does not exist`);
  }
  const problems = [];
  const checked = new Set();
  async function compare(file) {
    checked.add(file);
    const local = await readText(path.join(baseDir, file));
    const remote = await git.readFileOnRemote(base, file);
    if (remote === null) {
      problems.push(`missing: ${file}`);
    } else if (remote !== local) {
      problems.push(`differs: ${file}`);
    }
  }

  const workflowsDir = path.join(p(baseDir), "workflows");
  const roles = new Set();
  for (const name of await filesOf(workflowsDir, ".json")) {
    const file = path.relative(baseDir, path.join(workflowsDir, name));
    await compare(file);
    try {
      const workflow = JSON.parse(await readText(path.join(baseDir, file)));
      for (const step of workflow.steps ?? []) {
        roles.add(step.role);
      }
    } catch {
      problems.push(`not valid JSON: ${file}`);
    }
  }
  for (const name of await filesOf(
    path.join(baseDir, ".claude/agents"),
    ".md",
  )) {
    await compare(path.join(".claude/agents", name));
  }
  for (const role of roles) {
    const file = path.join(".claude/agents", `${role}.md`);
    if (
      isSlug(role) &&
      !ENGINE_ROLES.includes(role) &&
      !checked.has(file) &&
      (await git.readFileOnRemote(base, file)) === null
    ) {
      problems.push(`missing: ${file}`);
    }
  }
  const gitignore = (await git.readFileOnRemote(base, ".gitignore")) ?? "";
  const present = new Set(gitignore.split("\n").map((line) => line.trim()));
  for (const line of GITIGNORE_LINES.filter((l) => !present.has(l))) {
    problems.push(`missing in .gitignore: ${line}`);
  }

  if (problems.length > 0) {
    throw new Error(
      [
        `the setup is not on origin/${base}: commit and push these files`,
        ...problems.map((problem) => `- ${problem}`),
      ].join("\n"),
    );
  }
  return "ok";
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
  if (command === "check") {
    return checkPushed(baseDir);
  }
  throw new Error("usage: seed.js init | role | workflow | check");
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
