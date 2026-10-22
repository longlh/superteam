import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ensureGitignore,
  ensurePort,
  writeRole,
  writeWorkflow,
} from "./seed.js";

async function withDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st-seed-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, {
    withFileTypes: true,
  })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, base)));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out.sort();
}

const workflow = {
  name: "feature",
  title: "Feature",
  steps: [
    {
      name: "build",
    },
    {
      name: "review",
      dependOn: ["build"],
    },
  ],
};

test("ensureGitignore creates the file and is idempotent", async () => {
  await withDir(async (dir) => {
    await ensureGitignore(dir);
    await ensureGitignore(dir);
    assert.equal(
      await readFile(path.join(dir, ".gitignore"), "utf8"),
      ".superteam/.r/\n.superteam/.env\n",
    );
  });
});

test("ensureGitignore keeps other lines and adds a newline", async () => {
  await withDir(async (dir) => {
    await writeFile(
      path.join(dir, ".gitignore"),
      "node_modules\n.superteam/.env",
    );
    await ensureGitignore(dir);
    await ensureGitignore(dir);
    assert.equal(
      await readFile(path.join(dir, ".gitignore"), "utf8"),
      "node_modules\n.superteam/.env\n.superteam/.r/\n",
    );
  });
});

test("ensurePort writes a free port and keeps it", async () => {
  await withDir(async (dir) => {
    const port = await ensurePort(dir);
    assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
    assert.equal(
      await readFile(path.join(dir, ".superteam/.env"), "utf8"),
      `SUPERTEAM_PORT=${port}\n`,
    );
    assert.equal(await ensurePort(dir), port);
  });
});

test("ensurePort keeps an existing value and the other variables", async () => {
  await withDir(async (dir) => {
    await mkdir(path.join(dir, ".superteam"));
    const env = path.join(dir, ".superteam/.env");
    await writeFile(env, "A=1\nSUPERTEAM_PORT=4321\n# note\n");
    assert.equal(await ensurePort(dir), 4321);
    assert.equal(
      await readFile(env, "utf8"),
      "A=1\nSUPERTEAM_PORT=4321\n# note\n",
    );
  });
});

test("ensurePort appends to a file without the port", async () => {
  await withDir(async (dir) => {
    await mkdir(path.join(dir, ".superteam"));
    const env = path.join(dir, ".superteam/.env");
    await writeFile(env, "A=1");
    const port = await ensurePort(dir);
    assert.equal(await readFile(env, "utf8"), `A=1\nSUPERTEAM_PORT=${port}\n`);
  });
});

test("writeRole adds StructuredOutput to the tools", async () => {
  await withDir(async (dir) => {
    const file = await writeRole(dir, {
      name: "dev",
      description: "Writes code",
      tools: ["Read", "Edit"],
      model: "sonnet",
      instructions: "Do the work.",
    });
    assert.equal(file, path.join(dir, ".claude/agents/dev.md"));
    assert.equal(
      await readFile(file, "utf8"),
      '---\nname: dev\ndescription: "Writes code"\ntools: Read, Edit, StructuredOutput\nmodel: sonnet\n---\n\nDo the work.\n',
    );
  });
});

test("writeRole does not duplicate StructuredOutput", async () => {
  await withDir(async (dir) => {
    const file = await writeRole(dir, {
      name: "dev",
      description: "d",
      tools: ["Read", "StructuredOutput"],
      instructions: "x",
    });
    assert.match(
      await readFile(file, "utf8"),
      /tools: Read, StructuredOutput\n/,
    );
  });
});

test("writeRole with no tools writes no tools or model line", async () => {
  await withDir(async (dir) => {
    for (const tools of [undefined, []]) {
      const file = await writeRole(dir, {
        name: "dev",
        description: "d",
        tools,
        instructions: "x",
      });
      assert.equal(
        await readFile(file, "utf8"),
        '---\nname: dev\ndescription: "d"\n---\n\nx\n',
      );
    }
  });
});

test("writeRole overwrites an existing role file", async () => {
  await withDir(async (dir) => {
    await writeRole(dir, {
      name: "dev",
      description: "one",
      instructions: "x",
    });
    const file = await writeRole(dir, {
      name: "dev",
      description: "two",
      instructions: "y",
    });
    assert.match(await readFile(file, "utf8"), /description: "two"/);
  });
});

test("writeRole refuses bad input and engine roles", async () => {
  await withDir(async (dir) => {
    for (const name of ["Dev", "a/b", "..", "", undefined]) {
      await assert.rejects(
        writeRole(dir, {
          name,
          description: "d",
          instructions: "x",
        }),
        /slug/,
      );
    }
    await assert.rejects(
      writeRole(dir, {
        name: "dev",
        instructions: "x",
      }),
      /description/,
    );
    for (const name of ["task-merger", "work-merger"]) {
      await assert.rejects(
        writeRole(dir, {
          name,
          description: "d",
          instructions: "x",
        }),
        /engine/,
      );
    }
    assert.deepEqual(await listFiles(dir), []);
  });
});

test("writeRole keeps the header safe", async () => {
  await withDir(async (dir) => {
    const base = {
      name: "dev",
      instructions: "x",
    };
    for (const description of [
      "a\nmodel: opus",
      "a\n---\nx",
      "---\nb",
      "   ",
    ]) {
      await assert.rejects(
        writeRole(dir, {
          ...base,
          description,
        }),
        /description/,
      );
    }
    await assert.rejects(
      writeRole(dir, {
        ...base,
        description: "d",
        model: "opus\nx: y",
      }),
      /model/,
    );
    for (const tools of [["Read\nx"], ["a,b"], [""], [5], ["  "]]) {
      await assert.rejects(
        writeRole(dir, {
          ...base,
          description: "d",
          tools,
        }),
        /tool/,
      );
    }
    assert.deepEqual(await listFiles(dir), []);
    const file = await writeRole(dir, {
      ...base,
      description: "Writes code: fast",
    });
    const text = await readFile(file, "utf8");
    assert.match(text, /description: "Writes code: fast"\n/);
    assert.equal(text.split("\n").filter((l) => l === "---").length, 2);
  });
});

test("ensurePort refuses a non-numeric port", async () => {
  await withDir(async (dir) => {
    await mkdir(path.join(dir, ".superteam"));
    await writeFile(path.join(dir, ".superteam/.env"), "SUPERTEAM_PORT=abc\n");
    await assert.rejects(ensurePort(dir), /not a number/);
  });
});

test("writeWorkflow writes a valid workflow", async () => {
  await withDir(async (dir) => {
    const file = await writeWorkflow(dir, workflow);
    assert.equal(file, path.join(dir, ".superteam/.p/workflows/feature.json"));
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), workflow);
  });
});

test("writeWorkflow refuses a cycle", async () => {
  await withDir(async (dir) => {
    await assert.rejects(
      writeWorkflow(dir, {
        name: "loop",
        title: "Loop",
        steps: [
          {
            name: "a",
            dependOn: ["b"],
          },
          {
            name: "b",
            dependOn: ["a"],
          },
        ],
      }),
      /cycle/,
    );
    assert.deepEqual(await listFiles(dir), []);
  });
});

test("the four functions write no other file", async () => {
  await withDir(async (dir) => {
    await ensureGitignore(dir);
    await ensurePort(dir);
    await writeRole(dir, {
      name: "dev",
      description: "d",
      instructions: "x",
    });
    await writeWorkflow(dir, workflow);
    assert.deepEqual(await listFiles(dir), [
      ".claude/agents/dev.md",
      ".gitignore",
      ".superteam/.env",
      ".superteam/.p/workflows/feature.json",
    ]);
  });
});
