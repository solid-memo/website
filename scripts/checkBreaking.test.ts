// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BreakingIo,
  type Commit,
  defaultIo,
  isApiFile,
  lostLines,
  main,
  notBreakingReason,
  run,
  saysBreaking,
  verdict,
} from "./checkBreaking.ts";

// semantic-release's own code is in @semantic-release/core, whose exports
// keep lib/ to itself: its git.js is imported by its file, which TypeScript
// does not type.
const GIT = new URL("lib/git.js", import.meta.resolve("@semantic-release/core")).href;
const { getCommits } = (await import(GIT)) as {
  getCommits(from: string, to: string, options: { cwd: string }): Promise<Commit[]>;
};
const { LOG_SEPARATOR } = (await import(
  new URL("../commitlint.config.mjs", import.meta.url).href
)) as { LOG_SEPARATOR: RegExp };

const ROUTES = "api/routes/app.txt";
const PUBLISHED = "api/frozen/published.txt";

const commit = (message: string, hash = "0123456789abcdef"): Commit => ({ hash, message });

describe("isApiFile", () => {
  it("takes the text files of api/, and nothing else", () => {
    expect(isApiFile(ROUTES)).toBe(true);
    expect(isApiFile(PUBLISHED)).toBe(true);
    expect(isApiFile("api/README.md")).toBe(false);
    expect(isApiFile("packages/shacl/node/deckLibrary.golden.txt")).toBe(false);
    expect(isApiFile("docs/api/x.txt")).toBe(false);
  });
});

describe("lostLines", () => {
  it("finds each line the base had and the head has not, blank lines aside", () => {
    const base = new Map([[ROUTES, "home: #/decks\nstudy: #/study\n\n"]]);
    const head = new Map([[ROUTES, "home: #/decks\nstudy: #/learn\ncourse: #/course\n"]]);
    expect(lostLines(base, head)).toEqual([{ file: ROUTES, line: "study: #/study" }]);
  });

  it("finds every line of a file that is gone, and none of a file that is new", () => {
    const base = new Map([[ROUTES, "home: #/decks\n"]]);
    const head = new Map([[PUBLISHED, "/ns/vocab/v1.ttl\n"]]);
    expect(lostLines(base, head)).toEqual([{ file: ROUTES, line: "home: #/decks" }]);
  });
});

describe("saysBreaking", () => {
  it("reads `!` after the type or the scope, or a BREAKING CHANGE footer", () => {
    expect(saysBreaking("feat!: drop the old hashes")).toBe(true);
    expect(saysBreaking("feat(ui)!: drop the old hashes")).toBe(true);
    expect(saysBreaking("feat: drop\n\nBREAKING CHANGE: links break")).toBe(true);
    expect(saysBreaking("feat: drop\n\nBREAKING-CHANGE: links break")).toBe(true);
  });

  it("takes no other commit for one", () => {
    expect(saysBreaking("feat: add a hash")).toBe(false);
    expect(saysBreaking("fix: say why!: it is not")).toBe(false);
    expect(saysBreaking("docs: what a BREAKING CHANGE: footer says")).toBe(false);
    expect(saysBreaking("feat!:no space")).toBe(false);
    expect(saysBreaking("")).toBe(false);
  });

  // The release's parser splits a message into lines only at a line
  // feed (a carriage return before it aside), and reads a footer only at
  // the start of one of those lines.
  it("reads a line where the release's parser does", () => {
    expect(saysBreaking("feat: drop\r\n\r\nBREAKING CHANGE: links break")).toBe(true);
    for (const between of ["\u2028", "\u2029", "\u0085", "\r", "\x1e\x1f"]) {
      const footer = `feat: drop\n\nIt changes.${between}BREAKING CHANGE: links break`;
      expect(saysBreaking(footer), JSON.stringify(between)).toBe(false);
      expect(saysBreaking(`feat: drop\n\nIt changes.${between}feat!: x`)).toBe(false);
    }
  });
});

describe("notBreakingReason", () => {
  it("reads the trailer's reason", () => {
    expect(
      notBreakingReason(
        "refactor: x\n\nContract-Change: not-breaking #/learn still opens\nRefs: #1",
      ),
    ).toBe("#/learn still opens");
  });

  it("wants a reason", () => {
    expect(notBreakingReason("refactor: x\n\nContract-Change: not-breaking")).toBeUndefined();
    expect(notBreakingReason("refactor: x")).toBeUndefined();
  });

  it("reads the trailer only on a line of its own", () => {
    expect(
      notBreakingReason("refactor: x\r\n\r\nContract-Change: not-breaking it still opens\r\n"),
    ).toBe("it still opens");
    for (const between of ["\u2028", "\r"]) {
      expect(
        notBreakingReason(`refactor: x\n\nWhy.${between}Contract-Change: not-breaking y`),
      ).toBeUndefined();
    }
  });
});

describe("verdict", () => {
  const lost = [{ file: ROUTES, line: "study: #/study" }];

  it("passes when nothing went and no commit says it breaks", () => {
    expect(verdict([], [commit("feat: add a screen")])).toEqual({ problems: [], notes: [] });
  });

  it("fails on a contract line gone with no commit that says why", () => {
    const { problems, notes } = verdict(lost, [commit("feat: rename study")]);
    expect(problems[0]).toBe(`${ROUTES}: "study: #/study" is gone.`);
    expect(problems[1]).toMatch(/BREAKING CHANGE:.*Contract-Change: not-breaking/);
    expect(notes).toEqual([]);
  });

  it("passes a contract line gone in a change that says it breaks, and names the commit", () => {
    const { problems, notes } = verdict(lost, [
      commit("feat!: rename study\n\nBREAKING CHANGE: bookmarks break"),
    ]);
    expect(problems).toEqual([]);
    expect(notes).toEqual([
      `${ROUTES}: "study: #/study" is gone.`,
      "Declared breaking by 01234567 feat!: rename study.",
    ]);
  });

  it("passes a contract line gone in a change that says why it does not break", () => {
    const { problems, notes } = verdict(lost, [
      commit("refactor: rename study\n\nContract-Change: not-breaking #/study still opens"),
    ]);
    expect(problems).toEqual([]);
    expect(notes[1]).toBe(
      "Not breaking, says 01234567 refactor: rename study: #/study still opens",
    );
  });

  it("fails on a frozen line gone, whatever the commits say", () => {
    const { problems, notes } = verdict(
      [{ file: PUBLISHED, line: "/ns/shapes/card/v5.ttl sha256:00" }],
      [commit("feat!: edit card 5\n\nBREAKING CHANGE: x\nContract-Change: not-breaking y")],
    );
    expect(notes).toEqual([]);
    expect(problems).toEqual([
      `${PUBLISHED}: "/ns/shapes/card/v5.ttl sha256:00" is gone, and never may be: ${PUBLISHED} lists what is published once and for all (docs/releasing.md#what-has-versions-of-its-own); publish a new version instead.`,
    ]);
  });

  it.each([
    ["api/frozen/formats.txt", "card: written in format 7", "so a format never moves"],
    ["api/frozen/pod-layout.txt", "digest: kept in <instance>digest.ttl", "so it never moves"],
    ["api/frozen/pods.txt", "pods/1.nt sha256:00", "so its snapshot is never edited or removed"],
    [
      "api/frozen/browser-storage/browser.txt",
      "indexedDB: solid-memo-guest-pod version 1",
      "so its version never moves",
    ],
  ])("says of a line gone from %s what to do instead", (file, line, why) => {
    const { problems } = verdict(
      [{ file, line }],
      [commit("feat!: move it\n\nBREAKING CHANGE: x")],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${file}: "${line}" is gone, and never may be: `);
    expect(problems[0]).toContain(why);
    expect(problems[0]).not.toContain("publish a new version");
  });

  it("notes a commit that says it breaks when no line of api/ went", () => {
    const { problems, notes } = verdict(
      [],
      [commit("feat!: remove the trial\n\nBREAKING CHANGE: x")],
    );
    expect(problems).toEqual([]);
    expect(notes).toEqual([
      "01234567 feat!: remove the trial says it breaks, but no line of api/ went. That is right for a feature removed; otherwise drop the `!` and the footer.",
    ]);
  });
});

type Fake = {
  fail?: Error;
  /** The latest release tag. */
  release?: string;
  /** The routes file at a commit, when not the default. */
  at?: Record<string, string>;
  /** The commits since a commit, when not `commits`. */
  since?: Record<string, Commit[]>;
};

function fakeIo(
  head: string,
  commits: Commit[],
  fake: Fake = {},
): BreakingIo & { logged: string[] } {
  const logged: string[] = [];
  return {
    logged,
    mergeBase: (ref) => {
      if (fake.fail !== undefined) throw fake.fail;
      return `${ref}-base`;
    },
    filesAt: (at) =>
      new Map([[ROUTES, fake.at?.[at] ?? (at === "main-base" ? "home: #/decks\n" : "")]]),
    files: () => new Map([[ROUTES, head]]),
    commitsSince: (at) => fake.since?.[at] ?? commits,
    lastRelease: () => fake.release,
    log: (message) => logged.push(message),
  };
}

describe("main", () => {
  it("passes when every line is kept", () => {
    const io = fakeIo("home: #/decks\n", [], { release: "v1" });
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toEqual([
      "The public API keeps every line it had at main-bas, or says why not.",
    ]);
  });

  it("says when there is no release tag to check from", () => {
    const io = fakeIo("home: #/decks\n", []);
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toEqual([
      "No release tag found; checked from the base only.",
      "The public API keeps every line it had at main-bas, or says why not.",
    ]);
  });

  it("fails on a line gone, and says what to do", () => {
    const io = fakeIo("", [commit("feat: x")]);
    expect(main(["node", "--base", "main"], io)).toBe(1);
    expect(io.logged[0]).toBe(`${ROUTES}: "home: #/decks" is gone.`);
  });

  it("logs its notes and passes", () => {
    const io = fakeIo("", [commit("feat!: x\n\nBREAKING CHANGE: y")], { release: "v1" });
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toHaveLength(3);
  });

  it("checks again from the last release tag, as the release reads the commits", () => {
    // The branch lost nothing; a commit merged since v1 lost a line, and
    // the commit that said it breaks is reverted here.
    const io = fakeIo("", [], {
      release: "v1",
      at: { "main-base": "", "v1-base": "home: #/decks\n" },
    });
    expect(main(["node", "--base", "main"], io)).toBe(1);
    expect(io.logged[0]).toBe(
      "Since the last release, v1, as the release reads the commits from there (a commit that a later one reverts says nothing):",
    );
    expect(io.logged[1]).toBe(`${ROUTES}: "home: #/decks" is gone.`);
  });

  it("passes when a commit since the last release says it breaks", () => {
    const io = fakeIo("", [], {
      release: "v1",
      at: { "main-base": "", "v1-base": "home: #/decks\n" },
      since: { "v1-base": [commit("feat!: x\n\nBREAKING CHANGE: y")] },
    });
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toEqual([
      "The public API keeps every line it had at main-bas, or says why not.",
    ]);
  });

  it("checks once when the last release is the base", () => {
    const io = fakeIo("", [commit("feat!: x\n\nBREAKING CHANGE: y")], { release: "main" });
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toHaveLength(3);
  });

  it("wants exactly --base and a ref", () => {
    for (const argv of [
      ["node"],
      ["node", "--base"],
      ["node", "--base", "--check"],
      ["node", "--ref", "main"],
      ["node", "--base", "main", "extra"],
    ]) {
      const io = fakeIo("", []);
      expect(main(argv, io)).toBe(1);
      expect(io.logged).toEqual(["Usage: npm run check:breaking -- --base <git ref>"]);
    }
  });

  it("fails with git's message when git fails", () => {
    const io = fakeIo("", [], { fail: new Error("fatal: Not a valid object name nowhere") });
    expect(main(["node", "--base", "nowhere"], io)).toBe(1);
    expect(io.logged).toEqual(["fatal: Not a valid object name nowhere"]);
  });
});

describe("defaultIo", () => {
  let repo = "";
  // Git run by git (a hook, `git rebase --exec`) is given GIT_DIR and
  // the like, which would point every command here at the repository
  // the tests run in, not the one they make. They go for the test.
  const inherited = Object.entries(process.env).filter(([name]) => name.startsWith("GIT_"));
  beforeEach(() => {
    for (const [name] of inherited) delete process.env[name];
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    for (const [name, value] of inherited) process.env[name] = value;
  });

  // Its author given per command, so no config is written anywhere.
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-C",
        repo,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.org",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8" },
    ).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };

  it("reads the files at the base and now, and the commits since, merges aside", () => {
    repo = mkdtempSync(join(tmpdir(), "breaking-"));
    git("init", "-q", "-b", "main");
    write(ROUTES, "home: #/decks\n");
    write(PUBLISHED, "/ns/vocab/v1.ttl\n");
    write("api/README.md", "Not a promise.\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore: start");
    git("switch", "-q", "-c", "topic");
    write(ROUTES, "home: #/home\n");
    git("commit", "-q", "-am", "feat!: move home\n\nBREAKING CHANGE: bookmarks break");
    git("switch", "-q", "main");
    write("other.txt", "x\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore: elsewhere");
    git("switch", "-q", "topic");
    git("merge", "-q", "--no-edit", "main");
    write("api/new.txt", "new: line\n");
    rmSync(join(repo, PUBLISHED));

    const io = defaultIo(repo);
    const base = io.mergeBase("main");
    expect(base).toBe(git("rev-parse", "main"));
    expect(io.filesAt(base)).toEqual(
      new Map([
        [PUBLISHED, "/ns/vocab/v1.ttl\n"],
        [ROUTES, "home: #/decks\n"],
      ]),
    );
    expect(io.files()).toEqual(
      new Map([
        ["api/new.txt", "new: line\n"],
        [ROUTES, "home: #/home\n"],
      ]),
    );
    expect(io.commitsSince(base)).toEqual([
      {
        hash: git("rev-parse", "topic^1"),
        message: "feat!: move home\n\nBREAKING CHANGE: bookmarks break",
      },
    ]);
  });

  // As the release reads them (scripts/reverts.ts): a revert leaves out
  // the commit it names only when its change undoes that commit's.
  describe("reads the commits as the release does", () => {
    const declared = "feat!: move home\n\nBREAKING CHANGE: bookmarks break";
    const verdictOf = () => {
      const logged: string[] = [];
      const io = { ...defaultIo(repo), log: (line: string) => logged.push(line) };
      return { code: main(["node", "--base", "main"], io), logged };
    };
    const start = () => {
      repo = mkdtempSync(join(tmpdir(), "breaking-"));
      git("init", "-q", "-b", "main");
      write(ROUTES, "home: #/decks\n");
      git("add", ".");
      git("commit", "-q", "-m", "chore: start");
      git("switch", "-q", "-c", "topic");
      write(ROUTES, "home: #/home\n");
      git("commit", "-q", "-am", declared);
      return git("rev-parse", "HEAD");
    };

    it("drops a breaking commit that git revert undoes, so a line gone later needs its own", () => {
      start();
      git("revert", "--no-edit", "HEAD");
      write(ROUTES, "home: #/start\n");
      git("commit", "-q", "-am", "feat: start at home");
      expect(defaultIo(repo).commitsSince(git("rev-parse", "main"))).toEqual([
        { hash: git("rev-parse", "HEAD"), message: "feat: start at home" },
      ]);
      const { code, logged } = verdictOf();
      expect(code).toBe(1);
      expect(logged).toContain(`${ROUTES}: "home: #/decks" is gone.`);
    });

    it("checks from the last release a revert of a breaking commit merged before the branch", () => {
      repo = mkdtempSync(join(tmpdir(), "breaking-"));
      git("init", "-q", "-b", "main");
      write(ROUTES, "home: #/decks\n");
      git("add", ".");
      git("commit", "-q", "-m", "chore: start");
      git("tag", "v1.0.0");
      expect(defaultIo(repo).lastRelease()).toBe("v1.0.0");
      // One pull request, merged: it breaks, and says so.
      write(ROUTES, "home: #/home\n");
      git("commit", "-q", "-am", declared);
      // The next: git revert of that commit, then the same line gone again.
      git("switch", "-q", "-c", "topic");
      git("revert", "--no-edit", "HEAD");
      write(ROUTES, "home: #/home\n");
      git("commit", "-q", "-am", "feat: start at home");
      const { code, logged } = verdictOf();
      expect(code).toBe(1);
      expect(logged).toEqual([
        "Since the last release, v1.0.0, as the release reads the commits from there (a commit that a later one reverts says nothing):",
        `${ROUTES}: "home: #/decks" is gone.`,
        expect.stringContaining("A line of api/ went"),
      ]);
      // Said again, the change is declared.
      git("commit", "-q", "--amend", "-m", declared);
      expect(verdictOf().code).toBe(0);
    });

    // Each message read on its own: a separator git's output could be
    // split on, written in a message, makes no commit of its own.
    it("reads a message whole, whatever it holds", () => {
      repo = mkdtempSync(join(tmpdir(), "breaking-"));
      git("init", "-q", "-b", "main");
      write(ROUTES, "home: #/decks\n");
      git("add", ".");
      git("commit", "-q", "-m", "chore: start");
      git("switch", "-q", "-c", "topic");
      write(ROUTES, "home: #/home\n");
      const message = "feat: move home\n\nIt moves.\x1e\x1ffeat!: x\n\nRefs: #1";
      git("commit", "-q", "-am", message);
      expect(defaultIo(repo).commitsSince(git("rev-parse", "main"))).toEqual([
        { hash: git("rev-parse", "HEAD"), message },
      ]);
      const { code, logged } = verdictOf();
      expect(code).toBe(1);
      expect(logged).toContain(`${ROUTES}: "home: #/decks" is gone.`);
    });

    // The release reads its commits with git-log-parser, from one log it
    // splits at its own separators: it reads a message as the check does,
    // but for one that holds such a separator, which commitlint and
    // check:merges refuse.
    it("reads each commit as the release does, but for a message that holds its separator", async () => {
      repo = mkdtempSync(join(tmpdir(), "breaking-"));
      git("init", "-q", "-b", "main");
      git("commit", "-q", "--allow-empty", "-m", "chore: start");
      const base = git("rev-parse", "HEAD");
      for (const message of [
        "feat!: move home\n\nIt moves.\tYes.\n\nBREAKING CHANGE: bookmarks break\n\nRefs: #1",
        "fix: tidy\n\nIt moves.\x1e\x1ffeat!: x\n\nRefs: #2",
      ])
        git("commit", "-q", "--allow-empty", "-m", message);
      const released = async () =>
        (await getCommits(base, "HEAD", { cwd: repo })).map(({ hash, message }) => ({
          hash,
          message,
        }));
      const checked = defaultIo(repo).commitsSince(base);
      expect(await released()).toEqual(checked);

      const separated = `feat!: move\n\nIt moves.==FIELD==${base}==FIELD==feat: harmless==FIELD==\n\nBREAKING CHANGE: x\n\nRefs: #3`;
      expect(LOG_SEPARATOR.test(separated)).toBe(true);
      git("commit", "-q", "--allow-empty", "-m", separated);
      const [read] = await released();
      expect(read).toEqual({ hash: base, message: "feat: harmless" });
      expect(defaultIo(repo).commitsSince(base)[0]).toEqual({
        hash: git("rev-parse", "HEAD"),
        message: separated,
      });
    });

    it("finds no release in a repository with no release tag", () => {
      start();
      git("tag", "other");
      git("tag", "v2.0.0-beta.1");
      expect(defaultIo(repo).lastRelease()).toBeUndefined();
    });

    it("finds the highest release HEAD has, not the nearest", () => {
      start();
      git("tag", "v1.10.0");
      git("switch", "-q", "-c", "side");
      write("other.txt", "x\n");
      git("add", ".");
      git("commit", "-q", "-m", "fix: on the side");
      git("tag", "v1.9.0");
      git("switch", "-q", "topic");
      write("more.txt", "x\n");
      git("add", ".");
      git("commit", "-q", "-m", "feat: more");
      git("tag", "v3.0.0");
      git("reset", "-q", "--hard", "HEAD~1");
      git("merge", "-q", "--no-edit", "side");
      expect(git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD")).toBe("v1.9.0");
      expect(defaultIo(repo).lastRelease()).toBe("v1.10.0");
    });

    it("keeps a breaking commit that a revert only names, as the release does", () => {
      const named = start();
      const message = `Revert "feat!: move home"\n\nThis reverts commit ${named}.`;
      git("commit", "-q", "--allow-empty", "-m", message);
      expect(defaultIo(repo).commitsSince(git("rev-parse", "main"))).toEqual([
        { hash: git("rev-parse", "HEAD"), message },
        { hash: named, message: declared },
      ]);
      const { code, logged } = verdictOf();
      expect(code).toBe(0);
      expect(logged).toContain(`Declared breaking by ${named.slice(0, 8)} feat!: move home.`);
    });
  });

  it("logs to the console", () => {
    repo = mkdtempSync(join(tmpdir(), "breaking-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(repo).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});

describe("run", () => {
  it("checks the repository it is in, and sets the exit code", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: { argv: string[]; exitCode?: number | string | null } = { argv: ["node"] };
    run(process);
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith("Usage: npm run check:breaking -- --base <git ref>");
    log.mockRestore();
  });
});
