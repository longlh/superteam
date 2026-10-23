import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listJson, writeJson } from "../../lib/storage/files.js";
import { createBranchNames } from "../../lib/storage/branches.js";
import { artifactsDir, p } from "../../lib/storage/paths.js";
import { createTaskStore } from "../tasks.js";
import { createEngineHandlers } from "./index.js";

export const now = new Date("2026-01-02T03:04:05.000Z");

// A handler harness with a fake git that records its calls (a commitAll call
// also records the works and tasks on disk at that moment). `commitArtifact`
// puts an artifact in every worktree later created on top of a branch, as the
// real worktree inherits it from its base branch.
export async function createHarness(workflows) {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "handlers-"));
  const calls = [];
  const published = [];
  const branches = new Set();
  const committed = new Map();
  const pullRequests = new Map();
  const branchFiles = new Map();
  const remoteFiles = new Map();
  const goneBranches = new Set();
  const git = {
    async fetch() {
      calls.push(["fetch"]);
    },
    async rootBranch() {
      return "main";
    },
    async rootUpstream() {
      return "main";
    },
    async hasRemoteBranch(branch) {
      return !goneBranches.has(branch);
    },
    async ensureExcluded(line) {
      calls.push(["ensureExcluded", line]);
    },
    async createWorktree(args) {
      if (existsSync(args.folder)) {
        return;
      }
      calls.push(["createWorktree", args]);
      branches.add(args.branch);
      await mkdir(args.folder, {
        recursive: true,
      });
      for (const artifact of committed.get(args.base) ?? []) {
        await writeJson(
          path.join(
            artifactsDir(args.folder, artifact.work),
            `${artifact.id}.json`,
          ),
          artifact,
        );
      }
    },
    async commitAll(folder, message) {
      calls.push([
        "commitAll",
        folder,
        message,
        {
          works: await listJson(path.join(p(folder), "works")),
          tasks: await createTaskStore(folder).list(),
        },
      ]);
      return true;
    },
    async push(branch) {
      calls.push(["push", branch]);
    },
    async removeWorktree(folder) {
      calls.push(["removeWorktree", folder]);
      await rm(folder, {
        recursive: true,
        force: true,
      });
    },
    async listBranches(prefix) {
      return [...branches].filter((b) => b.startsWith(prefix)).sort();
    },
    async getPullRequest(branch) {
      return pullRequests.get(branch) ?? null;
    },
    async listMergedPullRequests(prefix) {
      return [...pullRequests]
        .filter(
          ([branch, pr]) => branch.startsWith(prefix) && pr.state === "merged",
        )
        .map(([branch, pr]) => ({
          branch,
          base: pr.base,
        }));
    },
    async openPullRequest(args) {
      calls.push(["openPullRequest", args]);
      const pullRequest = {
        url: `https://example.test/${args.branch}`,
        state: "open",
        base: args.base,
      };
      pullRequests.set(args.branch, pullRequest);
      return pullRequest;
    },
    async mergePullRequest(branch) {
      calls.push(["mergePullRequest", branch]);
      pullRequests.get(branch).state = "merged";
    },
    async closePullRequest(branch) {
      calls.push(["closePullRequest", branch]);
      pullRequests.get(branch).state = "closed";
    },
    async branchExists(branch) {
      return branches.has(branch);
    },
    async readFileOnBranch(branch, file) {
      return branchFiles.get(`${branch}:${file}`) ?? null;
    },
    async readFileOnRemote(branch, file) {
      return remoteFiles.get(`${branch}:${file}`) ?? null;
    },
    async deleteBranch(branch) {
      calls.push(["deleteBranch", branch]);
      branches.delete(branch);
    },
  };
  return {
    baseDir,
    calls,
    published,
    git,
    handlers: createEngineHandlers({
      baseDir,
      git,
      branches: createBranchNames(),
      loadWorkflow: async (name) => workflows[name] ?? null,
      publish: (topic, data) => published.push([topic, data]),
      now: () => now,
    }),
    commitArtifact(branch, artifact) {
      committed.set(branch, [...(committed.get(branch) ?? []), artifact]);
    },
    pullRequests,
    branchFiles,
    remoteFiles,
    goneBranches,
    named: (name) => calls.filter(([n]) => n === name),
    // The next call of the git method `name` throws, the calls after it work.
    failOnce(name, message = "offline") {
      const original = git[name];
      git[name] = async () => {
        git[name] = original;
        throw new Error(message);
      };
    },
    cleanup: () =>
      rm(baseDir, {
        recursive: true,
        force: true,
      }),
  };
}

// The function `assign` puts the upstream it checked in the event, as `base`.
export function assignEvent(data) {
  return {
    type: "work:assign",
    payload: {
      data: {
        base: "main",
        ...data,
      },
    },
  };
}

export function endedEvent(type, data) {
  return {
    type,
    payload: {
      data,
    },
  };
}
