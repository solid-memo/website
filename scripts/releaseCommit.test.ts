// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Commit, defaultIo, main, type ReleaseCommitIo, run } from "./releaseCommit.ts";

const BOT = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";

function commit(sha: string, subject: string, overrides: Partial<Commit> = {}): Commit {
  return { sha, subject, parents: [`${sha}^`], author: BOT, committer: BOT, ...overrides };
}

/** An io over these first-parent commits, the files each changes, and the tags. */
function fake(
  commits: Commit[],
  options: { changed?: Record<string, string[]>; tags?: Record<string, string> } = {},
) {
  const messages: string[] = [];
  const tags = options.tags ?? {};
  const io: ReleaseCommitIo = {
    firstParents: () => commits,
    changed: (sha) => options.changed?.[sha] ?? ["package.json", "CHANGELOG.md"],
    tags: (sha) => Object.keys(tags).filter((name) => tags[name] === sha),
    tagged: (name) => tags[name],
    log: (message) => messages.push(message),
  };
  return { io, messages };
}

describe("main last", () => {
  it("passes when the newest release commit has its tag", () => {
    const { io, messages } = fake(
      [commit("c", "Merge pull request #2"), commit("b", "chore(release): 1.0.1")],
      { tags: { "v1.0.1": "b" } },
    );
    expect(main(["node", "last"], io)).toBe(0);
    expect(messages).toEqual(["The newest release commit, b, has its tag."]);
  });

  it("fails when the newest release commit has no tag", () => {
    const { io, messages } = fake([commit("b", "chore(release): 1.0.1")]);
    expect(main(["node", "last"], io)).toBe(1);
    expect(messages).toEqual([
      "::error::The release commit b has no tag: tag it by hand before anything else is released (docs/releasing.md#when-a-release-fails).",
    ]);
  });

  it("passes over a commit that is only titled as a release commit", () => {
    const { io, messages } = fake(
      [
        commit("e", "chore(release): 1.0.5", { author: "Someone <someone@example.org>" }),
        commit("d", "chore(release): 1.0.4", { committer: "GitHub <noreply@github.com>" }),
        commit("c", "chore(release): 1.0.3", { parents: ["x", "y"] }),
        commit("b", "chore(release): 1.0.2"),
        commit("a", "chore(release): 1.0.1"),
      ],
      { changed: { b: ["package.json", "apps/web/src/main.ts"] }, tags: { "v1.0.1": "a" } },
    );
    expect(main(["node", "last"], io)).toBe(0);
    expect(messages).toEqual([
      `::notice::e is titled as a release commit, but is not one: its author is Someone <someone@example.org>, not ${BOT}.`,
      `::notice::d is titled as a release commit, but is not one: its committer is GitHub <noreply@github.com>, not ${BOT}.`,
      "::notice::c is titled as a release commit, but is not one: it has 2 parents, not one.",
      "::notice::b is titled as a release commit, but is not one: it changes apps/web/src/main.ts, which a release never writes (release.config.mjs).",
      "The newest release commit, a, has its tag.",
    ]);
  });

  it("passes on a main with no release commit yet", () => {
    const { io, messages } = fake([commit("a", "feat: start")]);
    expect(main(["node", "last"], io)).toBe(0);
    expect(messages).toEqual(["No release commit on main yet."]);
  });
});

describe("main tag", () => {
  const refusal = (tag: string, why: string) =>
    `::error::${tag} names no release commit of semantic-release's on main (${why}), so the site is not deployed (docs/releasing.md#when-a-release-fails).`;

  it("passes a tag on its version's release commit on main", () => {
    const { io, messages } = fake([commit("a", "chore(release): 1.0.1")], {
      tags: { "v1.0.1": "a" },
    });
    expect(main(["node", "tag", "v1.0.1"], io)).toBe(0);
    expect(messages).toEqual(["v1.0.1 names a, its release commit."]);
  });

  it("refuses a tag that names no commit", () => {
    const { io, messages } = fake([commit("a", "chore(release): 1.0.1")]);
    expect(main(["node", "tag", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("v1.0.1", "it names no commit")]);
  });

  it("refuses a tag on a commit off main's first-parent chain", () => {
    const { io, messages } = fake([commit("a", "chore(release): 1.0.0")], {
      tags: { "v1.0.1": "z" },
    });
    expect(main(["node", "tag", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("v1.0.1", "z is not on main's first-parent chain")]);
  });

  it("refuses a tag on another version's commit, or on one that is not a release's", () => {
    const { io, messages } = fake(
      [commit("b", "fix: keep the title"), commit("a", "chore(release): 1.0.0")],
      { tags: { "v1.0.1": "a", "v1.0.2": "b" } },
    );
    expect(main(["node", "tag", "v1.0.1"], io)).toBe(1);
    expect(main(["node", "tag", "v1.0.2"], io)).toBe(1);
    expect(messages).toEqual([
      refusal("v1.0.1", "a: its subject is not chore(release): 1.0.1"),
      refusal("v1.0.2", "b: its subject is not a release's"),
    ]);
  });

  it("refuses a tag on a release commit that changes more than a release writes", () => {
    const { io, messages } = fake([commit("a", "chore(release): 1.0.1")], {
      changed: { a: ["package.json", "scripts/check.ts"] },
      tags: { "v1.0.1": "a" },
    });
    expect(main(["node", "tag", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([
      refusal(
        "v1.0.1",
        "a: it changes scripts/check.ts, which a release never writes (release.config.mjs)",
      ),
    ]);
  });
});

describe("main's usage", () => {
  it("is told for a call it does not know", () => {
    for (const argv of [
      ["node"],
      ["node", "last", "extra"],
      ["node", "tag"],
      ["node", "tag", "1.0.1"],
      ["node", "tag", "v1.0.1-rc.1"],
      ["node", "tag", "v1.0.1", "v1.0.2"],
      ["node", "other"],
    ]) {
      const { io, messages } = fake([]);
      expect(main(argv, io)).toBe(2);
      expect(messages).toEqual(["Usage: npm run release:commit -- last | tag <vX.Y.Z>"]);
    }
  });
});

// A pull request whose own commit is titled as a release, and whose
// last commit undoes what that commit changed, merged with a merge
// commit, as the merge queue merges.
describe("defaultIo, on a repository with a pull request's commit titled as a release", () => {
  let repo: string;
  const bot = {
    GIT_AUTHOR_NAME: "github-actions[bot]",
    GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  };
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    }).trim();
  const at = (date: string) => ({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  const write = (file: string, text: string) => writeFileSync(join(repo, file), text);
  let messages: string[];
  const io = (ref = "main") => {
    const real = defaultIo(repo, ref);
    return { ...real, log: (message: string) => messages.push(message) };
  };

  beforeEach(() => {
    messages = [];
    repo = mkdtempSync(join(tmpdir(), "release-commit-"));
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "test@example.org"]);
    git(["config", "user.name", "Test"]);
    git(["config", "commit.gpgsign", "false"]);
    git(["config", "tag.gpgsign", "false"]);
    write("app.js", "ok\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "feat: start"], at("2026-10-29T09:00:00Z"));
    write("package.json", '{"version":"1.0.0"}\n');
    git(["add", "."]);
    git(["commit", "-q", "-m", "chore(release): 1.0.0", "-m", "The notes."], {
      ...bot,
      ...at("2026-10-29T10:00:00Z"),
    });
    git(["tag", "-a", "v1.0.0", "-m", "v1.0.0"]);
    git(["switch", "-qc", "feature"]);
    write("app.js", "changed\n");
    git(["commit", "-qam", "chore(release): 1.0.1", "-m", "Refs: #1"], at("2026-10-29T11:00:00Z"));
    write("app.js", "ok\n");
    git(["commit", "-qam", "fix: tidy", "-m", "Refs: #1"], at("2026-10-29T11:01:00Z"));
    git(["switch", "-q", "main"]);
    git(
      ["merge", "-q", "--no-ff", "feature", "-m", "Merge pull request #1"],
      at("2026-10-29T12:00:00Z"),
    );
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("finds semantic-release's commit as the last release, not the pull request's", () => {
    expect(main(["node", "last"], io())).toBe(0);
    expect(messages).toEqual([
      `The newest release commit, ${git(["rev-parse", "v1.0.0^{}"])}, has its tag.`,
    ]);
  });

  it("refuses to deploy the pull request's commit once it is tagged", () => {
    const fake = git(["rev-parse", "feature^"]);
    git(["tag", "v1.0.1", fake]);
    expect(main(["node", "tag", "v1.0.1"], io())).toBe(1);
    expect(messages).toEqual([
      `::error::v1.0.1 names no release commit of semantic-release's on main (${fake} is not on main's first-parent chain), so the site is not deployed (docs/releasing.md#when-a-release-fails).`,
    ]);
    expect(main(["node", "tag", "v1.0.0"], io())).toBe(0);
    expect(main(["node", "tag", "v9.9.9"], io())).toBe(1);
  });

  it("stops on semantic-release's commit when its tag is missing", () => {
    git(["tag", "-d", "v1.0.0"]);
    expect(main(["node", "last"], io())).toBe(1);
  });

  it("passes over a commit on main titled as a release that someone else made", () => {
    write("package.json", '{"version":"1.0.2"}\n');
    git(["commit", "-qam", "chore(release): 1.0.2", "-m", "Refs: #2"]);
    const made = git(["rev-parse", "HEAD"]);
    expect(main(["node", "last"], io("HEAD"))).toBe(0);
    expect(messages[0]).toBe(
      `::notice::${made} is titled as a release commit, but is not one: its author is Test <test@example.org>, not ${BOT}.`,
    );
  });
});

describe("run", () => {
  it("sets the exit code, with main as HEAD or RELEASE_MAIN", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (const env of [{}, { RELEASE_MAIN: "FETCH_HEAD" }]) {
      const process = {
        argv: ["node"],
        env,
        exitCode: undefined as number | string | null | undefined,
      };
      run(process);
      expect(process.exitCode).toBe(2);
    }
    expect(log).toHaveBeenCalledWith("Usage: npm run release:commit -- last | tag <vX.Y.Z>");
    log.mockRestore();
  });
});
