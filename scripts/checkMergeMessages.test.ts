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

  // The release writes a commit's subject and its footer into
  // CHANGELOG.md, whose generated entries are exempt from the linters only
  // through directives in the file.
  const directives = [
    "fix(ui): tidy the footer <!-- cspell:enable --> <!-- markdownlint-enable -->",
    "fix: tidy <!-- the footer",
    "fix: tidy --> the footer",
    "fix: tidy --!> the footer",
    "fix: tidy the footer cspell:enable",
    "fix: tidy the footer spell-checker:locale de",
    "fix: tidy the footer xcspell:enable",
    "fix: tidy the footer x_cspell: enable",
  ];

  it.each(directives)("refuses a title with a directive: %s", (title) => {
    expect(problemsOf(merge(title), true)).toEqual([
      "holds an HTML comment or a spell checker's directive",
    ]);
  });

  it.each(directives)("refuses a directive in a commit commitlint skips: %s", (title) => {
    expect(problemsOf(`Revert "${title}"`, false)).toEqual([
      "holds an HTML comment or a spell checker's directive",
    ]);
  });

  it("refuses a directive in a skipped commit's body, and says both when it breaks too", () => {
    const body = "fixup! chore: x\n\nthe footer <!-- x";
    expect(problemsOf(body, false)).toEqual([
      "holds an HTML comment or a spell checker's directive",
    ]);
    expect(problemsOf(`${body}\n\nBREAKING CHANGE: a footer`, false)).toHaveLength(2);
  });

  it("refuses a directive in the part of a message commitlint would not read", () => {
    const message =
      "fix(ui)!: tidy the footer\n\nKeep it tidy.\n\nRefs: #1\n\nBREAKING CHANGE: x------------------------ >8 ------------------------\nfixup! <!-- cspell:enable --> <!-- markdownlint-enable -->";
    expect(problemsOf(message, false)).toEqual([
      "holds an HTML comment or a spell checker's directive",
    ]);
  });

  it("refuses a control character or a line separator in any commit, skipped or merged", () => {
    const hidden = "holds a control character or a line separator other than a line feed";
    for (const character of ["\u2028", "\r", "\x1e"]) {
      expect(problemsOf(`fixup! chore: x\n\nWhy.${character}More.`, false)).toEqual([hidden]);
      expect(problemsOf(`fix: x\n\nWhy.${character}More.\n\nRefs: #1`, false)).toEqual([hidden]);
      expect(problemsOf(merge(`fix: x ${character} y`), true)).toEqual([hidden]);
    }
    expect(problemsOf("fix: x\r\n\r\nWhy.\tMore.\r\n\r\nRefs: #1", false)).toEqual([]);
  });

  it("refuses the text the release splits git's output at in any commit, skipped or merged", () => {
    const separated = "holds the text the release splits git's output at";
    for (const separator of ["==FIELD==", "==END=="]) {
      expect(problemsOf(`fixup! chore: x\n\nWhy.${separator}More.`, false)).toEqual([separated]);
      expect(problemsOf(`fix: x\n\nWhy.${separator}More.\n\nRefs: #1`, false)).toEqual([separated]);
      expect(problemsOf(merge(`fix: x ${separator} y`), true)).toEqual([separated]);
    }
  });

  it("refuses a directive in a commit commitlint reads", () => {
    expect(problemsOf("fix: tidy <!-- the footer\n\nRefs: #1", false)).toEqual([
      "holds an HTML comment or a spell checker's directive",
    ]);
  });

  it("passes a commit commitlint reads that says it breaks, and what only looks like a directive", () => {
    expect(problemsOf("fix!: tidy\n\nBREAKING CHANGE: the footer\n\nRefs: #1", false)).toEqual([]);
    expect(problemsOf("fix: the misspell: rule, a -> b\n\nRefs: #1", false)).toEqual([]);
  });

  // The release writes a commit's header and a breaking change's footer
  // into CHANGELOG.md as Markdown, and the docs job checks its links.
  const link = "holds a link or an image in its header or a breaking change's footer";

  it.each([
    "fix(studio): keep the order, as [the Studio page](docs/no-such-page.md) says",
    "fix(studio): keep the order, as [the Studio page](docs/studio.md#no-such-heading) says",
    "fix: show ![a picture](docs/no-such-image.png)",
    "fix: keep the order, as [the Studio page][studio] says",
    "fix: keep the order, as <file:docs/studio.md> says",
    'fix: show <img srcset="docs/no-such-image.png">',
    'fix: keep the order, as <a title=">" href="docs/x.md">the page</a> says',
    "fix: keep [x]: docs/x.md",
  ])("refuses a link or an image in a header: %s", (header) => {
    expect(problemsOf(`${header}\n\nRefs: #1`, false)).toEqual([link]);
    expect(problemsOf(`Revert "${header}"`, false)).toEqual([link]);
  });

  it("refuses a link in the header the parser finds after gpg: or blank lines", () => {
    for (const before of ["gpg: Signature made today\n", "\n"]) {
      expect(
        problemsOf(
          `${before}fix(studio): keep [the page](docs/no-such.md) in order\n\nRefs: #1`,
          false,
        ),
      ).toEqual([link]);
    }
  });

  it("refuses a link in a breaking change's footer, on any of its lines", () => {
    expect(
      problemsOf("fix!: tidy\n\nKeep it.\n\nBREAKING CHANGE: see [the page](docs/x.md)", false),
    ).toEqual([link]);
    expect(
      problemsOf(
        "fix!: tidy\n\nKeep it.\n\nBREAKING CHANGE: see [the page]\n[the page]: docs/x.md",
        false,
      ),
    ).toEqual([link]);
    expect(
      problemsOf("fix!: tidy\n\nKeep it.\n\nBREAKING CHANGE: see [r]\n\n    [r]: docs/x.md", false),
    ).toEqual([link]);
  });

  it("passes a link in the body, and brackets and parentheses that are no link", () => {
    expect(problemsOf("fix: tidy\n\nSee [the page](docs/x.md).\n\nRefs: #1", false)).toEqual([]);
    expect(problemsOf("fix: keep [front] and (back), arr[0] (x)\n\nRefs: #1", false)).toEqual([]);
    expect(problemsOf(merge("fix: keep [front] (docs/x.md)"), true)).toEqual([]);
  });

  it("says both when both are there", () => {
    expect(problemsOf(merge("BREAKING CHANGE: tidy [skip ci]"), true)).toHaveLength(2);
  });
});

describe("main", () => {
  function io(
    messages: Record<string, string>,
    single: readonly string[] = [],
    undone: readonly string[] = [],
    identities: Record<string, string[]> = {},
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
      identityOf: (hash) => identities[hash] ?? ["t", "t@example.org", "t", "t@example.org"],
      undoes: (revert, named) => undone.includes(`${revert} ${named}`),
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
        f: 'Revert "the title\'s text <!-- x"',
      },
      ["d", "e", "f"],
    );
    expect(main(args, fake)).toBe(1);
    expect(fake.logged).toHaveLength(5);
    expect(fake.logged[0]).toMatch(/^a \(#1\) holds a line/);
    expect(fake.logged[1]).toMatch(/^c \(#1\) holds a keyword/);
    expect(fake.logged[2]).toMatch(/^d says it breaks/);
    expect(fake.logged[3]).toMatch(/^f holds an HTML comment/);
    expect(fake.logged[4]).toContain("change the title");
    expect(fake.logged.join("\n")).not.toContain("the title's text");
  });

  it("fails on a revert whose change does not undo the commit it names", () => {
    const fake = io(
      {
        r: 'Revert "feat!: x"\n\nThis reverts commit a1.',
        s: "revert: feat!: y\n\nThis reverts commit a2.",
        t: 'Revert "feat: z"\n\nThis reverts commit a3.',
        u: 'Revert "feat: z"',
        m: merge('Revert "feat!: x"\n\nThis reverts commit a1.'),
      },
      ["r", "s", "t", "u"],
      ["t a3"],
    );
    expect(main(args, fake)).toBe(1);
    expect(fake.logged.slice(0, -1)).toEqual([
      "r says it reverts a commit whose change it does not undo.",
      "s says it reverts a commit whose change it does not undo.",
    ]);
    expect(fake.logged.at(-1)).toContain("git revert");
  });

  it("names only the commit when its message names no pull request", () => {
    const fake = io({ a: "Merge branch 'z' (#7) \n\nBREAKING CHANGE: x" });
    expect(main(args, fake)).toBe(1);
    expect(fake.logged[0]).toMatch(/^a holds a line/);
  });

  it.each([
    ["an author's name", ["a==FIELD==b", "t@example.org", "t", "t@example.org"]],
    ["an author's email", ["t", "t==END==@example.org", "t", "t@example.org"]],
    ["a committer's name", ["t", "t@example.org", "==FIELD==", "t@example.org"]],
    ["a committer's email", ["t", "t@example.org", "t", "t@example.org==FIELD=="]],
  ])("fails on a commit whose identity holds the release's separator: %s", (_, identity) => {
    const fake = io({ a: "fix: a bug" }, ["a"], [], { a: identity });
    expect(main(args, fake)).toBe(1);
    expect(fake.logged[0]).toBe(
      "a has an author or committer whose name or email holds the text the release splits git's output at.",
    );
    expect(fake.logged.at(-1)).toContain("another name or email");
    expect(fake.logged.join("\n")).not.toContain("==");
  });

  it("fails on a commit whose identity holds a control character, and passes a tab", () => {
    const fake = io({ a: "fix: a bug", b: "fix: a bug" }, ["a", "b"], [], {
      a: ["t\x1fu", "t@example.org", "t", "t@example.org"],
      b: ["t\tu", "t@example.org", "t", "t@example.org"],
    });
    expect(main(args, fake)).toBe(1);
    expect(fake.logged.slice(0, -1)).toEqual([
      "a has an author or committer whose name or email holds a control character.",
    ]);
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

  // The PoC of GHSA-773g-964f-cx3x: an author's name that holds the
  // separator, with an honest message.
  it("reads each commit's author and committer, and refuses the separator in one", () => {
    repo = mkdtempSync(join(tmpdir(), "merges-"));
    const cwd = repo;
    const git = (args: string[], env: Record<string, string> = {}) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...env },
      }).trim();
    git(["init", "-q", "-b", "main"]);
    writeFileSync(join(cwd, "a"), "1");
    git(["add", "a"]);
    git(["commit", "-qm", "chore: start"]);
    const base = git(["rev-parse", "HEAD"]);
    git(["commit", "-q", "--allow-empty", "-m", "fix: an ordinary commit"]);
    const decoy = git(["rev-parse", "HEAD"]);
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
      "feat: a thing",
      "",
      "x",
    ].join("==FIELD==");
    writeFileSync(join(cwd, "a"), "2");
    git(["commit", "-qam", "feat!: drop a line\n\nBREAKING CHANGE: it is gone."], {
      GIT_AUTHOR_NAME: name,
      GIT_COMMITTER_EMAIL: "c@example.org",
    });
    const head = git(["rev-parse", "HEAD"]);

    const io = defaultIo(cwd);
    expect(io.identityOf(head)).toEqual([name, "t@example.org", "t", "c@example.org"]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["node", "--base", base, "--head", head], io)).toBe(1);
    expect(log).toHaveBeenCalledWith(
      `${head} has an author or committer whose name or email holds the text the release splits git's output at.`,
    );
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining(decoy));
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

describe("defaultIo's undoes", () => {
  let repo: string | undefined;

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("passes git revert, and fails a revert that only says so", () => {
    repo = mkdtempSync(join(tmpdir(), "merges-"));
    const cwd = repo;
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
    writeFileSync(join(cwd, "a"), "2");
    git("commit", "-qam", "feat!: x\n\nBREAKING CHANGE: y");
    const named = git("rev-parse", "HEAD");
    git("revert", "--no-edit", "HEAD");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["node", "--base", base, "--head", "HEAD"], defaultIo(cwd))).toBe(0);
    git(
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      `Revert "feat!: x"\n\nThis reverts commit ${named}.`,
    );
    const head = git("rev-parse", "HEAD");
    expect(main(["node", "--base", base, "--head", head], defaultIo(cwd))).toBe(1);
    expect(log).toHaveBeenCalledWith(
      `${head} says it reverts a commit whose change it does not undo.`,
    );
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
