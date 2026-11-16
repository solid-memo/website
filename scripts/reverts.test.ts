// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asReleased, type Commit, gitAt, revertOf, undoes, withRevertsChecked } from "./reverts.ts";

// Untyped module: imported by a name TypeScript does not resolve.
const PRESET = "conventional-changelog-conventionalcommits";
const preset = (await (
  (await import(PRESET)) as { default: () => Promise<{ parser: { revertPattern: RegExp } }> }
).default()) as { parser: { revertPattern: RegExp } };

describe("revertOf", () => {
  const messages = [
    'Revert "feat!: drop the old address"\n\nThis reverts commit 0123abcd.',
    "revert: feat: x\n\nThis reverts commit 0123abcd.",
    'revert "feat: x"\n\nthis reverts commit abc.',
    'Revert "feat: x"\n\nThis reverts commit .',
    'Revert "feat: x"',
    "revert: take back the deck filter",
    "fix: This reverts commit abc.",
  ];

  it("reads the header and the hash as the release's preset does", () => {
    for (const message of messages) {
      const match = preset.parser.revertPattern.exec(message);
      expect(revertOf(message), message).toEqual(
        match === null ? undefined : { header: match[1]!.trim(), hash: match[2] },
      );
    }
    expect(revertOf(messages[0]!)).toEqual({
      header: "feat!: drop the old address",
      hash: "0123abcd",
    });
  });
});

describe("in a repository", () => {
  let repo = "";
  // Git run by git (a hook) is given GIT_DIR and the like, which would
  // point every command here at the repository the tests run in.
  const inherited = Object.entries(process.env).filter(([name]) => name.startsWith("GIT_"));
  beforeEach(() => {
    for (const [name] of inherited) delete process.env[name];
    repo = mkdtempSync(join(tmpdir(), "reverts-"));
    git("init", "-q", "-b", "main");
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    for (const [name, value] of inherited) process.env[name] = value;
  });

  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.org", ...args],
      { encoding: "utf8" },
    ).trim();
  /** A commit that writes `text` to the file `a`, and its hash. */
  const commit = (message: string, text: string, file = "a") => {
    writeFileSync(join(repo, file), text);
    git("add", file);
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  /** `git revert` of a commit, and its hash. */
  const revert = (hash: string) => {
    git("-c", "commit.gpgsign=false", "revert", "--no-edit", hash);
    return git("rev-parse", "HEAD");
  };
  const empty = (message: string) => {
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  /** The commits since `base`, newest first, as the release gets them. */
  const since = (base: string): Commit[] =>
    git("rev-list", `${base}..HEAD`)
      .split("\n")
      .map((hash) => ({ hash, message: git("log", "-1", "--format=%B", hash) }));

  const breaking = "feat(api)!: drop the old deck address\n\nBREAKING CHANGE: links break.";
  const header = "feat(api)!: drop the old deck address";

  describe("undoes", () => {
    it("is true of git revert, a root commit's included", () => {
      const root = commit("chore: start", "1");
      const a = commit(breaking, "2");
      const r = revert(a);
      expect(undoes(gitAt(repo), r, a)).toBe(true);
      expect(undoes(gitAt(repo), revert(root), root)).toBe(true);
    });

    it("is false of a commit whose change does not undo it", () => {
      commit("chore: start", "1");
      const a = commit(breaking, "2");
      const e = empty(`Revert "${header}"\n\nThis reverts commit ${a}.`);
      const other = commit(`Revert "${header}"\n\nThis reverts commit ${a}.`, "3", "b");
      expect(undoes(gitAt(repo), e, a)).toBe(false);
      expect(undoes(gitAt(repo), other, a)).toBe(false);
      // Nor does a change undo itself, nor an empty one another.
      expect(undoes(gitAt(repo), a, a)).toBe(false);
      expect(undoes(gitAt(repo), e, empty("chore: nothing"))).toBe(false);
    });

    it("is false of a change that differs from the undoing only in whitespace", () => {
      commit("chore: start", 'const s = "a b";\n');
      const a = commit(breaking, 'const s = "c";\n');
      const message = `Revert "${header}"\n\nThis reverts commit ${a}.`;
      // Inside a string, and at the end of a line.
      const spaced = commit(message, 'const s = "a  b";\n');
      expect(undoes(gitAt(repo), spaced, a)).toBe(false);
      git("reset", "-q", "--hard", a);
      const trailing = commit(message, 'const s = "a b"; \n');
      expect(undoes(gitAt(repo), trailing, a)).toBe(false);
      git("reset", "-q", "--hard", a);
      expect(undoes(gitAt(repo), revert(a), a)).toBe(true);
    });

    it("is false of a commit git cannot find, and of a merge commit", () => {
      commit("chore: start", "1");
      git("switch", "-qc", "topic");
      const a = commit(breaking, "2");
      git("switch", "-q", "main");
      commit("chore: elsewhere", "x", "b");
      git("merge", "-q", "--no-edit", "topic");
      const merge = git("rev-parse", "HEAD");
      const r = revert(a);
      expect(undoes(gitAt(repo), r, "0".repeat(40))).toBe(false);
      expect(undoes(gitAt(repo), r, "")).toBe(false);
      expect(undoes(gitAt(repo), merge, a)).toBe(false);
      expect(undoes(gitAt(repo), r, merge)).toBe(false);
    });
  });

  describe("withRevertsChecked and asReleased", () => {
    it("take a true revert and the commit it undoes out together", () => {
      const base = commit("chore: start", "1");
      const a = commit(breaking, "2");
      const r = revert(a);
      const commits = since(base);
      expect(withRevertsChecked(commits, gitAt(repo))).toEqual(commits);
      expect(asReleased(commits, gitAt(repo))).toEqual([]);
      expect(commits.map(({ hash }) => hash)).toEqual([r, a]);
    });

    it("match a revert that only says so to no commit, and keep the commit it names", () => {
      const base = commit("chore: start", "1");
      const a = commit(breaking, "2");
      const message = `Revert "${header}"\n\nThis reverts commit ${a}.`;
      const e = empty(message);
      const c = commit("feat(api): open decks at the new address", "3", "b");
      const commits = since(base);
      expect(asReleased(commits, gitAt(repo))).toEqual(commits);
      const checked = withRevertsChecked(commits, gitAt(repo));
      const hidden = checked.find(({ hash }) => hash === e)!;
      expect(hidden.message).toBe(`Revert "${header}"\n\nThis reverts commit .`);
      // Still a revert, of nothing.
      expect(revertOf(hidden.message)).toEqual({ header, hash: "" });
      expect(checked.filter(({ hash }) => hash !== e)).toEqual(
        commits.filter(({ hash }) => hash !== e),
      );
      expect(checked.map(({ hash }) => hash)).toEqual([c, e, a]);
    });

    it("keep a commit a revert names outside the range, or by another header", () => {
      const before = commit(breaking, "2");
      const base = commit("chore: start", "1", "b");
      const outside = revert(before);
      const a = commit(breaking, "3");
      git("-c", "commit.gpgsign=false", "revert", "--no-commit", a);
      git("commit", "-q", "-m", `Revert "feat: another header"\n\nThis reverts commit ${a}.`);
      const commits = since(base);
      expect(asReleased(commits, gitAt(repo))).toEqual(commits);
      const checked = withRevertsChecked(commits, gitAt(repo));
      expect(checked.map(({ message }) => revertOf(message)?.hash)).toEqual(["", undefined, ""]);
      expect(commits.map(({ hash }) => hash)).toContain(outside);
    });

    it("keep the commit when its revert is reverted in turn", () => {
      const base = commit("chore: start", "1");
      const a = commit(breaking, "2");
      const r = revert(a);
      // As git revert wrote it before it began to write "Reapply".
      git("-c", "commit.gpgsign=false", "revert", "--no-commit", r);
      git("commit", "-q", "-m", `Revert "Revert "${header}""\n\nThis reverts commit ${r}.`);
      const commits = since(base);
      expect(asReleased(commits, gitAt(repo)).map(({ hash }) => hash)).toEqual([a]);
    });

    it("take out one revert for a commit that two undo, the newer, as the release does", () => {
      const base = commit("chore: start", "1");
      const a = commit(breaking, "2");
      const first = revert(a);
      commit("chore: put it back", "2");
      revert(a);
      const commits = since(base);
      expect(asReleased(commits, gitAt(repo)).map(({ hash }) => hash)).toEqual([
        git("rev-parse", "HEAD~1"),
        first,
      ]);
    });
  });
});
