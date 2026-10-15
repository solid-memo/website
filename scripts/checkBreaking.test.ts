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

function fakeIo(head: string, commits: Commit[], fail?: Error): BreakingIo & { logged: string[] } {
  const logged: string[] = [];
  return {
    logged,
    mergeBase: (ref) => {
      if (fail !== undefined) throw fail;
      return `${ref}-base`;
    },
    filesAt: (at) => new Map([[ROUTES, at === "main-base" ? "home: #/decks\n" : ""]]),
    files: () => new Map([[ROUTES, head]]),
    commitsSince: () => commits,
    log: (message) => logged.push(message),
  };
}

describe("main", () => {
  it("passes when every line is kept", () => {
    const io = fakeIo("home: #/decks\n", []);
    expect(main(["node", "--base", "main"], io)).toBe(0);
    expect(io.logged).toEqual([
      "The public API keeps every line it had at main-bas, or says why not.",
    ]);
  });

  it("fails on a line gone, and says what to do", () => {
    const io = fakeIo("", [commit("feat: x")]);
    expect(main(["node", "--base", "main"], io)).toBe(1);
    expect(io.logged[0]).toBe(`${ROUTES}: "home: #/decks" is gone.`);
  });

  it("logs its notes and passes", () => {
    const io = fakeIo("", [commit("feat!: x\n\nBREAKING CHANGE: y")]);
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
    const io = fakeIo("", [], new Error("fatal: Not a valid object name nowhere"));
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
