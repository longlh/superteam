import { readFile } from "node:fs/promises";
import path from "node:path";

// The agent file of a role: the project one wins over the one of the plugin.
export function roleFiles({ workdir, role, pluginRoot }) {
  return [
    path.join(workdir, ".claude", "agents", `${role}.md`),
    path.join(pluginRoot, "agents", `${role}.md`),
  ];
}

async function readIfThere(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

// The tools of the `tools:` line of the front matter, or null when there is
// no such line or it lists no tool. Three forms are read: `tools: A, B`,
// `tools: [A, B]`, and a YAML list of `- A` lines under `tools:`. The front
// matter is read line by line, so a quoted value with a colon in another line
// does not matter.
const unquote = (text) =>
  text
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();

export function toolsOf(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return null;
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  const header = lines.slice(1, end === -1 ? undefined : end);
  const at = header.findIndex((line) => /^tools:/.test(line));
  if (at === -1) {
    return null;
  }
  let value = header[at].slice("tools:".length).trim();
  let tools = [];
  if (value === "") {
    for (const line of header.slice(at + 1)) {
      const item = /^\s*-\s*(.*)$/.exec(line);
      if (item === null) {
        break;
      }
      tools.push(unquote(item[1]));
    }
  } else {
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1);
    }
    tools = value.split(",").map(unquote);
  }
  tools = tools.filter((tool) => tool !== "");
  return tools.length === 0 ? null : tools;
}

export async function readRoleTools({ workdir, role, pluginRoot }) {
  const files = roleFiles({
    workdir,
    role,
    pluginRoot,
  });
  for (const file of files) {
    const content = await readIfThere(file);
    if (content !== null) {
      return toolsOf(content);
    }
  }
  throw new Error(
    `no agent file for the role ${role}: looked at ${files.join(" and ")}`,
  );
}
