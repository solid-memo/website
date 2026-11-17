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
      lastRelease: { gitTag: "v1.0.0", version: "1.0.0", gitHead: base },
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

  /**
   * A history on main: its commits from `base`, newest first, as
   * semantic-release gets them, after `steps` run in a new repository.
   */
  async function history(steps: (git: (...args: string[]) => string, cwd: string) => void) {
    const cwd = mkdtempSync(join(tmpdir(), "release-"));
    repos.push(cwd);
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.org",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd, encoding: "utf8" },
      ).trim();
    git("init", "-q", "-b", "main");
    writeFileSync(join(cwd, "a"), "1");
    git("add", "a");
    git("commit", "-qm", "chore: start");
    const base = git("rev-parse", "HEAD");
    steps(git, cwd);
    return {
      commits: await getCommits(base, "HEAD", { cwd }),
      cwd,
      logger,
      options: { repositoryUrl: "https://github.com/solid-memo/website" },
      lastRelease: { gitTag: "v1.0.0", version: "1.0.0", gitHead: base },
      nextRelease: { gitTag: "v2.0.0", version: "2.0.0" },
    };
  }

  const header = "feat(api)!: drop the old deck address";
  const breaking = `${header}\n\nThe old address is gone.\n\nBREAKING CHANGE: old links no longer open.`;

  // A revert is matched to the commit it names by its message, so its
  // change must undo that commit's for the two to leave the release.
  it("leaves out a breaking commit that git revert undoes, and its revert", async () => {
    const context = await history((git, cwd) => {
      writeFileSync(join(cwd, "a"), "2");
      git("commit", "-qam", breaking);
      git("revert", "--no-edit", "HEAD");
    });
    expect(context.commits).toHaveLength(2);
    expect(await plugin.analyzeCommits(options, context)).toBeNull();
    expect(await plugin.generateNotes(options, context)).not.toContain("BREAKING CHANGES");
  });

  it("keeps a breaking commit that a revert only names, and still releases the revert", async () => {
    const context = await history((git, cwd) => {
      writeFileSync(join(cwd, "a"), "2");
      git("commit", "-qam", breaking);
      const named = git("rev-parse", "HEAD");
      git(
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        `Revert "${header}"\n\nThis reverts commit ${named}.`,
      );
      writeFileSync(join(cwd, "b"), "1");
      git("add", "b");
      git("commit", "-qm", "feat(api): open decks at the new address");
    });
    expect(await plugin.analyzeCommits(options, context)).toBe("major");
    const notes = await plugin.generateNotes(options, context);
    expect(notes).toContain("BREAKING CHANGES");
    expect(notes).toContain("old links no longer open.");
    expect(notes).toContain("drop the old deck address");
    expect(notes).toContain("open decks at the new address");
  });

  it("keeps a breaking commit whose revert differs from the undoing only in whitespace", async () => {
    const context = await history((git, cwd) => {
      writeFileSync(join(cwd, "a"), "2");
      git("commit", "-qam", breaking);
      const named = git("rev-parse", "HEAD");
      // The start was "1": this puts it back with a space.
      writeFileSync(join(cwd, "a"), "1 ");
      git("commit", "-qam", `Revert "${header}"\n\nThis reverts commit ${named}.`);
    });
    expect(context.commits).toHaveLength(2);
    expect(await plugin.analyzeCommits(options, context)).toBe("major");
    expect(await plugin.generateNotes(options, context)).toContain("old links no longer open.");
  });

  it("keeps a revert of a commit from before the range, which releases a patch", async () => {
    const context = await history((git) => {
      git("revert", "--no-edit", "HEAD");
    });
    expect(context.commits).toHaveLength(1);
    expect(await plugin.analyzeCommits(options, context)).toBe("patch");
  });

  it("releases nothing when there are no commits", async () => {
    const context = await history(() => {});
    expect(context.commits).toEqual([]);
    expect(await plugin.analyzeCommits(options, context)).toBeNull();
  });

  it("reads the whole history when there is no release yet, up to the release's head", async () => {
    const context = await history((git) => {
      git("commit", "-q", "--allow-empty", "-m", "fix: an ordinary commit");
    });
    const head = context.commits[0]!.hash;
    const commits = await getCommits("", head, { cwd: context.cwd });
    expect(commits).toHaveLength(2);
    const first = { ...context, commits, lastRelease: {}, nextRelease: { gitHead: head } };
    expect(await plugin.analyzeCommits(options, first)).toBe("patch");
    expect(await plugin.generateNotes(options, first)).toContain("an ordinary commit");
  });

  // As semantic-release runs it: @semantic-release/git's prepare makes
  // the release commit, moves nextRelease.gitHead to it and writes the
  // notes again with the commits read before it.
  it("writes the notes again once the release commit is made, from the range it read", async () => {
    let git: (...args: string[]) => string = () => "";
    const context = await history((run, cwd) => {
      git = run;
      writeFileSync(join(cwd, "a"), "2");
      git("commit", "-qam", "fix: an ordinary commit");
    });
    expect(await plugin.analyzeCommits(options, context)).toBe("patch");
    const nextRelease = { ...context.nextRelease, gitHead: git("rev-parse", "HEAD") };
    const before = await plugin.generateNotes(options, { ...context, nextRelease });
    expect(before).toContain("an ordinary commit");

    writeFileSync(join(context.cwd, "a"), "3");
    git("commit", "-qam", "chore(release): 2.0.0");
    const released = { ...nextRelease, gitHead: git("rev-parse", "HEAD") };
    expect(await plugin.generateNotes(options, { ...context, nextRelease: released })).toBe(before);

    // The range read before still holds the release to what git holds.
    const misread = { ...context, commits: [], nextRelease: released };
    await expect(plugin.generateNotes(options, misread)).rejects.toThrow(/not the ones git holds/);
  });

  it("stops the release when git cannot read a commit, or the range", async () => {
    const context = await merged(chore, queued("chore: a title"));
    const commits = [{ hash: "0".repeat(40), message: "feat: a deck" }];
    await expect(plugin.analyzeCommits(options, { ...context, commits })).rejects.toThrow();
    const lastRelease = { gitHead: "0".repeat(40) };
    await expect(plugin.analyzeCommits(options, { ...context, lastRelease })).rejects.toThrow();
  });

  /** The commits semantic-release read, changed by `change`, against the history. */
  async function misread(change: (commits: Commit[]) => Commit[]) {
    const context = await history((git, cwd) => {
      writeFileSync(join(cwd, "a"), "2");
      git("commit", "-qam", breaking);
      git("commit", "-q", "--allow-empty", "-m", "fix: an ordinary commit");
    });
    return { ...context, commits: change(context.commits) };
  }

  it.each<[string, (commits: Commit[]) => Commit[]]>([
    ["a commit left out", (commits) => commits.slice(1)],
    ["a commit read twice", ([first, ...rest]) => [first!, first!, ...rest.slice(1)]],
    [
      "a commit given another's message",
      ([first, second]) => [first!, { ...second!, message: "feat: x" }],
    ],
    [
      "a commit not in the range",
      (commits) => [...commits, { hash: "f".repeat(40), message: "fix: x" }],
    ],
  ])("stops the release when semantic-release read the range otherwise: %s", async (_, change) => {
    const context = await misread(change);
    const stopped = /not the ones git holds/;
    await expect(plugin.analyzeCommits(options, context)).rejects.toThrow(stopped);
    await expect(plugin.generateNotes(options, context)).rejects.toThrow(stopped);
  });

  // An author's or committer's identity is written before the hash and
  // the message in the output semantic-release splits: one that holds
  // the separator could make it read another commit's.
  it("never releases a commit as semantic-release misread it from an identity", async () => {
    const field = "==FIELD==";
    const context = await history((git, cwd) => {
      git("commit", "-q", "--allow-empty", "-m", "fix: an ordinary commit");
      const decoy = git("rev-parse", "HEAD");
      const name = [
        "x",
        "p1",
        "p2",
        "p3",
        "p4",
        "p5",
        "p6",
        "p7",
        decoy,
        "feat: add a small thing",
        "",
        "2026-11-17 10:00:00 +0000",
        "x",
      ].join(field);
      writeFileSync(join(cwd, "a"), "2");
      execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-qam", breaking], {
        cwd,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: name,
          GIT_AUTHOR_EMAIL: "x@example.org",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@example.org",
        },
      });
    });
    // semantic-release read the decoy where the breaking commit is.
    expect(context.commits.map(({ message }) => message)).not.toContain(breaking);
    await expect(plugin.analyzeCommits(options, context)).rejects.toThrow(/not the ones git holds/);
    await expect(plugin.generateNotes(options, context)).rejects.toThrow(/not the ones git holds/);
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
