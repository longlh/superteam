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
// no such line. The front matter is read line by line, so a quoted value with
// a colon in another line does not matter.
function toolsOf(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return null;
  }
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      return null;
    }
    const match = /^tools:(.*)$/.exec(line);
    if (match) {
      const tools = match[1]
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool !== "");
      return tools.length === 0 ? null : tools;
    }
  }
  return null;
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
