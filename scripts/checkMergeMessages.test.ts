// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultIo,
  main,
  type MergesIo,
  problemsOf,
  type RangeCommit,
  run,
} from "./checkMergeMessages.ts";

const merge = (title: string) => `Merge pull request #1 from solid-memo/topic\n\n${title}`;

describe("problemsOf", () => {
  it("passes a merge commit with a title like any other", () => {
    expect(
      problemsOf(merge("chore(deps): update dependency @solid/pivot to v1.9.0"), true),
    ).toEqual([]);
    expect(problemsOf(merge("feat!: write deck format 8"), true)).toEqual([]);
    expect(problemsOf(merge("docs: say what a BREAKING CHANGE: footer does"), true)).toEqual([]);
    expect(problemsOf(merge("docs: skip checks in the guide"), true)).toEqual([]);
  });

  it.each([
    "chore: tidy [skip ci]",
    "chore: tidy [CI SKIP]",
    "[no ci] chore: tidy",
    "chore: tidy [skip actions]",
    "chore: tidy [actions skip]",
    "skip-checks: true",
  ])("refuses a title with a skip keyword: %s", (title) => {
    expect(problemsOf(merge(title), true)).toEqual(["holds a keyword that makes GitHub skip CI"]);
  });

  it.each(["BREAKING CHANGE: tidy the footer", "BREAKING-CHANGE: tidy the footer"])(
    "refuses a title that starts as a footer: %s",
    (title) => {
      expect(problemsOf(merge(title), true)).toEqual([
        "holds a line that starts as a breaking change's footer",
      ]);
    },
  );

  it.each([
    "Merge branch 'z'\n\nBREAKING CHANGE: a footer",
    "Merge pull request #2 from x/z\n\nBREAKING-CHANGE: a footer",
    'Revert "chore: x"\n\nBREAKING CHANGE: a footer',
    "Reapply chore: x\n\nBREAKING CHANGE: a footer",
    "fixup! chore: x\n\nBREAKING CHANGE: a footer",
    "fixup!: chore",
    "squash!: chore",
  ])("refuses a breaking change in a commit commitlint skips: %j", (message) => {
    expect(problemsOf(message, false)).toEqual(["says it breaks, and commitlint skips it"]);
  });

  it.each([
    'Revert "feat!: write deck format 8"\n\nThis reverts commit abc.',
    "fixup! chore: x",
    "Merge branch 'z'",
    // commitlint reads these, and judges them by its own rules.
    "fix!: write format 8\n\nBREAKING CHANGE: an older app refuses it.",
    "chore: x\n\nBREAKING CHANGE: no mark",
    "chore: tidy [skip ci]",
  ])("leaves any other commit with one parent to commitlint: %j", (message) => {
    expect(problemsOf(message, false)).toEqual([]);
  });

  it("says both when both are there", () => {
    expect(problemsOf(merge("BREAKING CHANGE: tidy [skip ci]"), true)).toHaveLength(2);
  });
});

describe("main", () => {
  function io(
    messages: Record<string, string>,
    single: readonly string[] = [],
  ): MergesIo & { logged: string[] } {
    const logged: string[] = [];
    const commits: RangeCommit[] = Object.keys(messages).map((hash) => ({
      hash,
      merge: !single.includes(hash),
    }));
    return {
      logged,
      commitsBetween: () => commits,
      messageOf: (hash) => messages[hash]!,
      log: (message) => logged.push(message),
    };
  }
  const args = ["node", "--base", "b", "--head", "h"];
  const queue = [...args, "--queue"];

  it("passes when no commit holds what it refuses", () => {
    const fake = io({ a: merge("fix: a bug"), c: merge("docs: say why") });
    expect(main(args, fake)).toBe(0);
    expect(fake.logged).toEqual(["Read 2 commit(s), and none holds what the check refuses."]);
  });

  it("passes on a pull request's range, with no merge commit", () => {
    expect(main(args, io({}))).toBe(0);
    expect(main(args, io({ a: "fix: a bug" }, ["a"]))).toBe(0);
  });

  it("fails on the queue's range when it holds no merge commit", () => {
    for (const fake of [io({}), io({ a: "fix: a bug" }, ["a"])]) {
      expect(main(queue, fake)).toBe(1);
      expect(fake.logged).toHaveLength(1);
      expect(fake.logged[0]).toContain("no merge commit");
    }
  });

  it("passes on the queue's range when it holds a clean merge commit", () => {
    expect(main(queue, io({ a: "fix: a bug", m: merge("fix: a bug") }, ["a"]))).toBe(0);
  });

  it("gives the two refs to the io", () => {
    const fake = io({});
    const commitsBetween = vi.spyOn(fake, "commitsBetween");
    main(args, fake);
    expect(commitsBetween).toHaveBeenCalledWith("b", "h");
  });

  it("fails on every commit that holds one, and prints none of the message", () => {
    const fake = io(
      {
        a: merge("BREAKING CHANGE: the title's text"),
        b: merge("fix: a bug"),
        c: merge("the title's text [skip ci]"),
        d: "Revert \"the title's text\"\n\nBREAKING CHANGE: the title's text",
        e: "Merge branch 'z'\n\nthe title's text [skip ci]\n\nBREAKING CHANGE: the title's text",
      },
      ["d", "e"],
    );
    expect(main(args, fake)).toBe(1);
    expect(fake.logged).toHaveLength(4);
    expect(fake.logged[0]).toMatch(/^a \(#1\) holds a line/);
    expect(fake.logged[1]).toMatch(/^c \(#1\) holds a keyword/);
    expect(fake.logged[2]).toMatch(/^d says it breaks/);
    expect(fake.logged[3]).toContain("change the title");
    expect(fake.logged.join("\n")).not.toContain("the title's text");
  });

  it("names only the commit when its message names no pull request", () => {
    const fake = io({ a: "Merge branch 'z' (#7) \n\nBREAKING CHANGE: x" });
    expect(main(args, fake)).toBe(1);
    expect(fake.logged[0]).toMatch(/^a holds a line/);
  });

  it.each([[["node"]], [["node", "--base", "b"]], [["node", "--head", "h"]]])(
    "gives the usage when a ref is missing: %j",
    (argv) => {
      const fake = io({});
      expect(main(argv, fake)).toBe(1);
      expect(fake.logged).toEqual([
        "Usage: npm run check:merges -- --base <git ref> --head <git ref> [--queue]",
      ]);
    },
  );

  it("fails on an option it does not know, or a ref that starts as one", () => {
    const fake = io({});
    expect(main(["node", "--base", "b", "--head", "h", "--other", "x"], fake)).toBe(1);
    expect(main(["node", "--base", "--upload-pack=x", "--head", "h"], fake)).toBe(1);
    expect(fake.logged).toHaveLength(2);
  });

  it("fails when git cannot read the range", () => {
    const fake = io({});
    fake.commitsBetween = () => {
      throw new Error("bad revision");
    };
    expect(main(args, fake)).toBe(1);
    expect(fake.logged).toEqual(["bad revision"]);
  });
});

describe("defaultIo", () => {
  let repo: string | undefined;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("reads the merge queue's merge commit, title and all, from the range", () => {
    repo = mkdtempSync(join(tmpdir(), "merges-"));
    const cwd = repo;
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
    git("commit", "-qam", "chore: tidy the footer");
    git("switch", "-q", "main");
    // A separator between messages would be written in one, so none is used.
    const title = "chore: a\x1eb [skip ci]";
    git("merge", "-q", "--no-ff", "topic", "-m", `Merge pull request #1 from x/topic\n\n${title}`);
    const head = git("rev-parse", "HEAD");
    const topic = git("rev-parse", "topic");

    const io = defaultIo(cwd);
    expect(io.commitsBetween(base, head)).toEqual(
      expect.arrayContaining([
        { hash: head, merge: true },
        { hash: topic, merge: false },
      ]),
    );
    expect(io.commitsBetween(base, head)).toHaveLength(2);
    expect(io.commitsBetween(head, head)).toEqual([]);
    expect(io.messageOf(head)).toContain(title);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["node", "--base", base, "--head", head], io)).toBe(1);
    expect(log).toHaveBeenCalledWith(`${head} (#1) holds a keyword that makes GitHub skip CI.`);
    log.mockRestore();
  });

  // A commit with one parent, under a header commitlint skips: the
  // release reads it (scripts/releaseWithoutMerges.test.ts), so this does.
  it("reads the commits of the range that are not merges, a skipped one with a footer among them", () => {
    repo = mkdtempSync(join(tmpdir(), "merges-"));
    const cwd = repo;
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
    writeFileSync(join(cwd, "a"), "2");
    git("commit", "-qam", 'Revert "chore: x"\n\nBREAKING CHANGE: a footer');
    const head = git("rev-parse", "HEAD");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["node", "--base", base, "--head", head], defaultIo(cwd))).toBe(1);
    expect(log).toHaveBeenCalledWith(`${head} says it breaks, and commitlint skips it.`);
    expect(main(["node", "--base", base, "--head", head, "--queue"], defaultIo(cwd))).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("no merge commit"));
    log.mockRestore();
  });
});

describe("run", () => {
  it("checks the repository it is in, and sets the exit code", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: { argv: string[]; exitCode?: number | string | null } = { argv: ["node"] };
    run(process);
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith(
      "Usage: npm run check:merges -- --base <git ref> --head <git ref> [--queue]",
    );
    log.mockRestore();
  });
});
