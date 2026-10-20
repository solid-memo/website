// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClosesIo,
  type Commit,
  closesAnIssue,
  defaultIo,
  isOneStep,
  main,
  parseArgs,
  run,
  verdict,
  prose,
} from "./checkClosesIssue.ts";

const commit = (message: string, hash = "0123456789abcdef"): Commit => ({ hash, message });

const TEMPLATE = readFileSync(
  join(import.meta.dirname, "../.github/pull_request_template.md"),
  "utf8",
);

describe("closesAnIssue", () => {
  it("reads every keyword GitHub closes an issue for, with a colon or without, in any case", () => {
    for (const keyword of ["close", "closes", "closed", "fix", "fixes", "fixed"]) {
      expect(closesAnIssue(`${keyword} #95`)).toBe(true);
    }
    for (const keyword of ["resolve", "resolves", "resolved", "Closes:", "CLOSES:", "Fixes:"]) {
      expect(closesAnIssue(`${keyword} #95`)).toBe(true);
    }
    expect(closesAnIssue("fix: keep the title\n\nWhy.\n\nCloses: #95")).toBe(true);
  });

  it("reads an issue in another repository, or by its address", () => {
    expect(closesAnIssue("Closes solid-memo/website#95")).toBe(true);
    expect(closesAnIssue("Fixes: https://github.com/solid-memo/website/issues/95")).toBe(true);
    expect(closesAnIssue("Fixes: https://github.com/solid-memo/website/pull/95")).toBe(false);
  });

  it("takes no other reference for one", () => {
    expect(closesAnIssue("Refs: #95")).toBe(false);
    expect(closesAnIssue("Closes: #")).toBe(false);
    expect(closesAnIssue("Closes: 95")).toBe(false);
    expect(closesAnIssue("Closes the gap in #95")).toBe(false);
    expect(closesAnIssue("Encloses #95")).toBe(false);
    expect(closesAnIssue("prefixes #95")).toBe(false);
    expect(closesAnIssue("Closes\n#95")).toBe(false);
  });
});

describe("prose", () => {
  it("leaves out HTML comments, one left open included", () => {
    expect(prose("a <!-- Closes: #1 --> b\n<!--\nFixes #2\n-->c")).toBe("a  b\nc");
    expect(prose("a <!-- Closes: #1")).toBe("a ");
  });

  it("leaves out code spans and fenced code blocks, one left open included", () => {
    expect(prose("now `Closes: #1`, not ``Refs: `#1` ``.")).toBe("now , not .");
    expect(prose("a\n```text\nFixes #2\n```\nb\n~~~\nFixes #3\n~~~\nc")).toBe("a\nb\nc");
    expect(prose("a\n````\n```\nFixes #2\n````\nb")).toBe("a\nb");
    expect(prose("a\n```\nFixes #2")).toBe("a\n");
  });

  it("keeps a lone backtick and the text after it", () => {
    expect(prose("a ` b\n\nCloses: #1")).toBe("a ` b\n\nCloses: #1");
  });
});

describe("isOneStep", () => {
  const box = "- [x] **One step.** This pull request does not finish its issue.";

  it("takes a checked One step box with a Refs line", () => {
    expect(isOneStep(`Refs: #95\n\n${box}`)).toBe(true);
    expect(isOneStep(`Refs #95\n\n${box.replace("[x]", "[X]")}`)).toBe(true);
  });

  it("wants both the box checked and the issue named", () => {
    expect(isOneStep(`Refs: #95\n\n${box.replace("[x]", "[ ]")}`)).toBe(false);
    expect(isOneStep(`Refs: #\n\n${box}`)).toBe(false);
    expect(isOneStep("Refs: #95")).toBe(false);
  });
});

describe("verdict", () => {
  const plain = [commit("fix: keep the title\n\nWhy.\n\nRefs: #95")];

  it("passes a body that closes its issue", () => {
    expect(verdict("Why.\n\nCloses: #95", plain)).toEqual({
      note: "The pull request's body closes its issue.",
    });
  });

  it("passes a commit that closes its issue, with no body or a plain one", () => {
    const closing = [...plain, commit("fix: end it\n\nWhy.\n\nFixes #95", "fedcba9876543210")];
    const note = "fedcba98 fix: end it closes its issue.";
    expect(verdict(undefined, closing)).toEqual({ note });
    expect(verdict("Refs: #95", closing)).toEqual({ note });
  });

  it("passes one step of an issue", () => {
    expect(verdict("Refs: #95\n\n- [x] **One step.** Not the last.", plain)).toEqual({
      note: "The pull request is one step of its issue, which stays open (Refs:).",
    });
  });

  it("passes a security fix whose commit names its advisory", () => {
    const fix = [commit("fix: keep it\n\nWhy.\n\nRefs: GHSA-fhp3-h74x-mhrr", "0123456789abcdef")];
    expect(verdict(undefined, fix)).toEqual({
      note: "01234567 fix: keep it names its security advisory, which closes no issue.",
    });
    expect(
      verdict(undefined, [commit("fix: keep it\n\nWhy.\n\nRefs: GHSA-1234")]).problem,
    ).toBeDefined();
  });

  it("fails a pull request that only refers to its issue", () => {
    const { problem } = verdict("Refs: #95", plain);
    expect(problem).toMatch(/^Neither the pull request's body nor any commit closes an issue\./);
    expect(problem).toContain("`Closes: #NN`");
    expect(verdict(undefined, plain).problem).toMatch(/^Neither any commit closes an issue\./);
  });

  it("does not take a keyword or a One step box in a comment or in code", () => {
    const step = "- [x] **One step.** Not the last.";
    for (const body of [
      "<!-- Closes: #95 -->\nRefs: #95",
      "The hint now reads `Closes: #42`.\n\nRefs: #95",
      "```\nFixes #12\n```\n\nRefs: #95",
      `Refs: #95\n\n<!--\n${step}\n-->`,
      `Refs: #95\n\n\`\`\`\n${step}\n\`\`\``,
    ]) {
      expect(verdict(body, plain).problem).toBeDefined();
    }
  });

  it("does not take the template's hints, in a comment, for a closing keyword", () => {
    expect(verdict(TEMPLATE, plain).problem).toBeDefined();
    expect(verdict(TEMPLATE.replace("Closes: #\n", "Closes: #95\n"), plain).problem).toBe(
      undefined,
    );
  });

  it("takes the template's One step box, checked, with Refs", () => {
    const step = TEMPLATE.replace("Closes: #\n", "Refs: #95\n").replace(
      "- [ ] **One step.**",
      "- [x] **One step.**",
    );
    expect(step).not.toBe(TEMPLATE);
    expect(verdict(step, plain).problem).toBe(undefined);
  });
});

describe("parseArgs", () => {
  it("takes a base, and a body file or not, in either order", () => {
    expect(parseArgs(["--base", "origin/main"])).toEqual({ base: "origin/main", head: "HEAD" });
    expect(parseArgs(["--body-file", "body.md", "--head", "def", "--base", "abc"])).toEqual({
      base: "abc",
      head: "def",
      bodyFile: "body.md",
    });
  });

  it("refuses anything else", () => {
    expect(parseArgs([])).toBe(undefined);
    expect(parseArgs(["--body-file", "body.md"])).toBe(undefined);
    expect(parseArgs(["--base"])).toBe(undefined);
    expect(parseArgs(["--base", "--body-file"])).toBe(undefined);
    expect(parseArgs(["--base", "a", "--base", "b"])).toBe(undefined);
    expect(parseArgs(["--head", "a"])).toBe(undefined);
    expect(parseArgs(["--base", "a", "--to", "b"])).toBe(undefined);
  });
});

describe("main", () => {
  const io = (overrides: Partial<ClosesIo> = {}) => {
    const lines: string[] = [];
    const value: ClosesIo = {
      mergeBase: (ref, head) => `base-of-${ref}-and-${head}`,
      commitsSince: () => [commit("fix: keep the title\n\nWhy.\n\nRefs: #95")],
      readFile: () => "Closes: #95",
      log: (message) => lines.push(message),
      ...overrides,
    };
    return { value, lines };
  };

  it("shows the usage for arguments it does not know", () => {
    const { value, lines } = io();
    expect(main(["node", "--base"], value)).toBe(1);
    expect(lines).toEqual([
      "Usage: npm run check:closes -- --base <git ref> [--head <git ref>] [--body-file <path>]",
    ]);
  });

  it("reads the body and the commits since where the head left the base", () => {
    const readFile = vi.fn(() => "Closes: #95");
    const commitsSince = vi.fn(() => []);
    const { value, lines } = io({ readFile, commitsSince });
    expect(main(["node", "--base", "main", "--body-file", "body.md"], value)).toBe(0);
    expect(readFile).toHaveBeenCalledWith("body.md");
    expect(commitsSince).toHaveBeenCalledWith("base-of-main-and-HEAD", "HEAD");
    expect(main(["node", "--base", "main", "--head", "abc", "--body-file", "b"], value)).toBe(0);
    expect(commitsSince).toHaveBeenLastCalledWith("base-of-main-and-abc", "abc");
    expect(lines).toEqual([
      "The pull request's body closes its issue.",
      "The pull request's body closes its issue.",
    ]);
  });

  it("fails when nothing closes an issue", () => {
    const { value, lines } = io();
    expect(main(["node", "--base", "main"], value)).toBe(1);
    expect(lines[0]).toMatch(/^Neither any commit closes an issue\./);
  });

  it("fails, and says why, when git or the file cannot be read", () => {
    const { value, lines } = io({
      readFile: () => {
        throw new Error("ENOENT: body.md");
      },
    });
    expect(main(["node", "--base", "main", "--body-file", "body.md"], value)).toBe(1);
    expect(lines).toEqual(["ENOENT: body.md"]);
  });
});

describe("defaultIo", () => {
  let repo = "";
  // Git hooks run with GIT_DIR, GIT_INDEX_FILE and the like, which would
  // point every command here at the repository the tests run in, not the
  // one they make. They go for the test.
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

  it("reads the commits since the base, merges aside, and a file", () => {
    repo = mkdtempSync(join(tmpdir(), "closes-"));
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "chore: start");
    git("switch", "-q", "-c", "topic");
    git("commit", "-q", "--allow-empty", "-m", "fix: end it\n\nWhy.\n\nCloses: #95");
    git("switch", "-q", "main");
    git("commit", "-q", "--allow-empty", "-m", "chore: elsewhere");
    git("switch", "-q", "topic");
    git("merge", "-q", "--no-edit", "main");
    writeFileSync(join(repo, "body.md"), "Refs: #95\n");

    const io = defaultIo(repo);
    const base = io.mergeBase("main", "HEAD");
    expect(base).toBe(git("rev-parse", "main"));
    const closing = {
      hash: git("rev-parse", "topic^1"),
      message: "fix: end it\n\nWhy.\n\nCloses: #95",
    };
    expect(io.commitsSince(base, "HEAD")).toEqual([closing]);
    // From the first commit to the head before the merge: main's commit is not the branch's.
    const start = git("rev-list", "--max-parents=0", "HEAD");
    expect(io.mergeBase(start, "topic^1")).toBe(start);
    expect(io.commitsSince(start, "topic^1")).toEqual([closing]);
    expect(io.readFile(join(repo, "body.md"))).toBe("Refs: #95\n");
  });

  it("logs to the console", () => {
    repo = mkdtempSync(join(tmpdir(), "closes-"));
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
    expect(log).toHaveBeenCalledWith(
      "Usage: npm run check:closes -- --base <git ref> [--head <git ref>] [--body-file <path>]",
    );
    log.mockRestore();
  });
});
