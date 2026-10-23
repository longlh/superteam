import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  checkPushed,
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
      role: "developer",
    },
    {
      name: "review",
      role: "reviewer",
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

test("writeRole refuses a role with no tools, and writes no file", async () => {
  await withDir(async (dir) => {
    for (const tools of [undefined, []]) {
      await assert.rejects(
        writeRole(dir, {
          name: "dev",
          description: "d",
          tools,
          instructions: "x",
        }),
        /tools must be a non-empty list/,
      );
    }
    assert.deepEqual(await listFiles(dir), []);
  });
});

test("writeRole overwrites an existing role file", async () => {
  await withDir(async (dir) => {
    await writeRole(dir, {
      name: "dev",
      description: "one",
      tools: ["Read"],
      instructions: "x",
    });
    const file = await writeRole(dir, {
      name: "dev",
      description: "two",
      tools: ["Read"],
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
      tools: ["Read"],
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
            role: "dev",
            dependOn: ["b"],
          },
          {
            name: "b",
            role: "dev",
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
      tools: ["Read"],
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

const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();

// A project with a bare origin, the setup written by the skill, and nothing
// committed yet.
async function withProject(fn) {
  await withDir(async (root) => {
    const origin = path.join(root, "origin.git");
    const dir = path.join(root, "project");
    git(root, "init", "-q", "--bare", "-b", "main", origin);
    git(root, "init", "-q", "-b", "main", dir);
    git(dir, "config", "user.name", "Test");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "commit.gpgsign", "false");
    git(dir, "remote", "add", "origin", origin);
    git(dir, "commit", "-q", "--allow-empty", "-m", "init");
    git(dir, "push", "-q", "--set-upstream", "origin", "main");
    await ensureGitignore(dir);
    await ensurePort(dir);
    for (const name of ["developer", "reviewer"]) {
      await writeRole(dir, {
        name,
        description: name,
        tools: ["Read"],
        instructions: "x",
      });
    }
    await writeWorkflow(dir, workflow);
    await fn(dir);
  });
}

const pushSetup = (dir) => {
  git(dir, "add", ".gitignore", ".claude/agents", ".superteam/.p/workflows");
  git(dir, "commit", "-q", "-m", "Set up superteam");
  git(dir, "push", "-q");
};

test("check lists the files of the setup that are not on the upstream", async () => {
  await withProject(async (dir) => {
    await assert.rejects(checkPushed(dir), (error) => {
      assert.equal(
        error.message,
        [
          "the setup is not on origin/main: commit and push these files",
          "- missing: .superteam/.p/workflows/feature.json",
          "- missing: .claude/agents/developer.md",
          "- missing: .claude/agents/reviewer.md",
          "- missing in .gitignore: .superteam/.r/",
          "- missing in .gitignore: .superteam/.env",
        ].join("\n"),
      );
      return true;
    });
  });
});

test("check passes once the setup is pushed, and finds a file changed after", async () => {
  await withProject(async (dir) => {
    pushSetup(dir);
    assert.equal(await checkPushed(dir), "ok");
    await writeRole(dir, {
      name: "developer",
      description: "changed",
      tools: ["Read"],
      instructions: "x",
    });
    await assert.rejects(
      checkPushed(dir),
      /- differs: .claude\/agents\/developer.md$/,
    );
  });
});

test("check finds a role that a workflow names and that is on no side", async () => {
  await withProject(async (dir) => {
    await rm(path.join(dir, ".claude/agents/reviewer.md"));
    pushSetup(dir);
    await assert.rejects(checkPushed(dir), (error) => {
      assert.match(error.message, /\n- missing: .claude\/agents\/reviewer.md$/);
      return true;
    });
  });
});

test("check finds a role that a step inside a loop group names", async () => {
  await withProject(async (dir) => {
    await writeWorkflow(dir, {
      name: "fix",
      title: "Fix",
      steps: [
        {
          name: "build",
          loop: {
            maxRounds: 2,
            steps: [
              {
                name: "test",
                role: "tester",
                gate: true,
                dod: ["no test fails"],
              },
            ],
          },
        },
      ],
    });
    pushSetup(dir);
    await assert.rejects(checkPushed(dir), (error) => {
      assert.match(error.message, /\n- missing: .claude\/agents\/tester.md$/);
      return true;
    });
  });
});

test("check finds a role file with no tools line", async () => {
  await withProject(async (dir) => {
    await writeFile(
      path.join(dir, ".claude/agents/reviewer.md"),
      "---\nname: reviewer\ndescription: r\n---\n\nx\n",
    );
    pushSetup(dir);
    await assert.rejects(checkPushed(dir), (error) => {
      assert.match(
        error.message,
        /\n- no tools line: .claude\/agents\/reviewer.md$/,
      );
      return true;
    });
  });
});

test("check refuses a root branch with no upstream, and a detached HEAD", async () => {
  await withProject(async (dir) => {
    git(dir, "checkout", "-q", "-b", "local");
    await assert.rejects(checkPushed(dir), /tracks no branch on origin/);
    git(dir, "checkout", "-q", "--detach");
    await assert.rejects(checkPushed(dir), /HEAD is detached/);
  });
});

test("check compares the config of the project when there is one, and checks it", async () => {
  await withProject(async (dir) => {
    pushSetup(dir);
    await writeFile(
      path.join(dir, ".superteam/.p/config.json"),
      '{ "branchPrefix": "acme" }\n',
    );
    await assert.rejects(
      checkPushed(dir),
      /- missing: \.superteam\/\.p\/config\.json/,
    );
    git(dir, "add", ".superteam/.p/config.json");
    git(dir, "commit", "-q", "-m", "Config");
    git(dir, "push", "-q");
    assert.equal(await checkPushed(dir), "ok");
    await writeFile(
      path.join(dir, ".superteam/.p/config.json"),
      '{ "branchPrefix": "Not A Slug" }\n',
    );
    await assert.rejects(checkPushed(dir), /branchPrefix must be a slug/);
  });
});
