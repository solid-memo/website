// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "./releaseWithoutMerges.ts";

/**
 * The plugin under semantic-release's own reading of a real history: its
 * getCommits, which holds merge commits, its plugin loader, and the
 * options in release.config.mjs.
 */

const ROOT = join(import.meta.dirname, "..");
const PLUGIN = "./scripts/releaseWithoutMerges.ts";

type Commit = { hash: string; message: string };
type Config = { default: { plugins: [string, Record<string, unknown>][] } };

// Untyped modules: imported by a name TypeScript does not resolve.
const GIT = "semantic-release/lib/git.js";
const { getCommits } = (await import(GIT)) as {
  getCommits(from: string, to: string, options: { cwd: string }): Promise<Commit[]>;
};
const config = (await import(new URL("../release.config.mjs", import.meta.url).href)) as Config;
const options = config.default.plugins.find(([name]) => name === PLUGIN)?.[1];

const logger = { log: () => {}, warn: () => {}, error: () => {}, success: () => {} };

describe("releaseWithoutMerges", () => {
  const repos: string[] = [];

  afterEach(() => {
    for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
  });

  /** A history of one pull request, its commit and the merge the queue makes of it. */
  async function merged(commit: string, merge: string) {
    const cwd = mkdtempSync(join(tmpdir(), "release-"));
    repos.push(cwd);
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", ...args], {
        cwd,
        encoding: "utf8",
      }).trim();
    git("init", "-q", "-b", "main");
    writeFileSync(join(cwd, "a"), "1");
    git("add", "a");
    git("commit", "-qm", "chore: start");
    const base = git("rev-parse", "HEAD");
    git("switch", "-qc", "topic");
    writeFileSync(join(cwd, "a"), "2");
    git("commit", "-qam", commit);
    git("switch", "-q", "main");
    git("merge", "-q", "--no-ff", "topic", "-m", merge);
    const commits = await getCommits(base, "HEAD", { cwd });
    // The merge commit is there for the plugin to leave out.
    expect(commits).toHaveLength(2);
    return {
      commits,
      cwd,
      logger,
      options: { repositoryUrl: "https://github.com/solid-memo/website" },
      lastRelease: { gitTag: "v1.0.0", version: "1.0.0" },
      nextRelease: { gitTag: "v1.1.0", version: "1.1.0" },
    };
  }

  const queued = (title: string) => `Merge pull request #1 from x/topic\n\n${title}`;
  const chore = "chore: tidy the footer\n\nThe footer reads better.\n\nCloses: #1";

  it.each([
    "chore: tidy the footer",
    "BREAKING CHANGE: tidy the footer",
    "BREAKING-CHANGE: tidy the footer",
    "feat!: tidy the footer",
    "fix: tidy the footer",
  ])("lets no title choose the version: %s", async (title) => {
    const context = await merged(chore, queued(title));
    expect(await plugin.analyzeCommits(options, context)).toBeNull();
  });

  it("lets no merge commit choose it, whatever its subject", async () => {
    const context = await merged(chore, "feat!: tidy\n\nBREAKING CHANGE: tidy the footer");
    expect(await plugin.analyzeCommits(options, context)).toBeNull();
  });

  it("keeps a title out of the notes", async () => {
    const context = await merged(chore, queued("BREAKING CHANGE: the title's text"));
    const notes = await plugin.generateNotes(options, context);
    expect(notes).not.toContain("BREAKING CHANGES");
    expect(notes).not.toContain("the title's text");
    expect(notes).not.toContain("Merge pull request");
  });

  it("still counts a pull request's own commits, a real footer among them", async () => {
    const breaking = "fix!: write format 8\n\nBREAKING CHANGE: an older app refuses it.";
    const context = await merged(breaking, queued("chore: a title that says little"));
    expect(await plugin.analyzeCommits(options, context)).toBe("major");
    const notes = await plugin.generateNotes(options, context);
    expect(notes).toContain("BREAKING CHANGES");
    expect(notes).toContain("an older app refuses it.");
    expect(notes).toContain("write format 8");

    const feature = await merged("feat: add a deck", queued("chore: a title"));
    expect(await plugin.analyzeCommits(options, feature)).toBe("minor");
    const fix = await merged("fix: a bug", queued("chore: a title"));
    expect(await plugin.analyzeCommits(options, fix)).toBe("patch");
  });

  // A commit with one parent stays, whatever commitlint does with it, so
  // a revert still releases (npm run check:merges reads the rest of it).
  it("keeps a revert, which still releases", async () => {
    const revert = 'Revert "feat: add a deck"\n\nThis reverts commit abc.';
    const context = await merged(revert, queued("chore: a title"));
    expect(await plugin.analyzeCommits(options, context)).toBe("patch");
  });

  it("releases nothing when there are no commits", async () => {
    const context = await merged(chore, queued("chore: a title"));
    expect(await plugin.analyzeCommits(options, { ...context, commits: [] })).toBeNull();
  });

  it("stops the release when git cannot read a commit", async () => {
    const context = await merged(chore, queued("chore: a title"));
    const commits = [{ hash: "0".repeat(40), message: "feat: a deck" }];
    await expect(plugin.analyzeCommits(options, { ...context, commits })).rejects.toThrow();
  });

  // In a process of its own, as a release runs it: Node reads the file as
  // it is, not as this test runner transforms it.
  it("loads as release.config.mjs names it, the way semantic-release loads it", () => {
    const script = `
      const { loadPlugin } = await import("semantic-release/lib/plugins/utils.js");
      const plugin = await loadPlugin({ cwd: process.cwd() }, ${JSON.stringify(PLUGIN)}, {});
      console.log(Object.keys(plugin).join(" "));
    `;
    const steps = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(options).toBeDefined();
    expect(steps.trim()).toBe("analyzeCommits generateNotes");
  });
});
