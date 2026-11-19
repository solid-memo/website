// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Change } from "./releaseChanges.ts";
import {
  type Commit,
  defaultIo,
  type FileChange,
  main,
  type ReleaseCommitIo,
  run,
} from "./releaseCommit.ts";

const BOT = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";

function commit(sha: string, subject: string, overrides: Partial<Commit> = {}): Commit {
  return { sha, subject, parents: [`${sha}^`], author: BOT, committer: BOT, ...overrides };
}

/**
 * An io over these first-parent commits, the files each changes, and the
 * tags; and, for a release commit not yet on main, main's tip, the
 * commits off main, their messages and their files' text, the tags on
 * main (v1.0.0 unless told) and the time (2026-11-19, unless told).
 */
function fake(
  commits: Commit[],
  options: {
    changed?: Record<string, string[]>;
    tags?: Record<string, string>;
    head?: string;
    others?: Commit[];
    messages?: Record<string, string>;
    changes?: Record<string, FileChange[]>;
    merged?: string[];
    now?: string;
  } = {},
) {
  const messages: string[] = [];
  const tags = options.tags ?? {};
  const all = [...commits, ...(options.others ?? [])];
  const io: ReleaseCommitIo = {
    firstParents: () => commits,
    head: () => options.head ?? commits[0]!.sha,
    commit: (sha) => all.find((each) => each.sha === sha)!,
    message: (sha) => options.messages?.[sha] ?? all.find((each) => each.sha === sha)!.subject,
    changes: (sha) => options.changes?.[sha] ?? [],
    changed: (sha) => options.changed?.[sha] ?? ["package.json", "CHANGELOG.md"],
    tags: (sha) => Object.keys(tags).filter((name) => tags[name] === sha),
    tagged: (name) => tags[name],
    merged: () => options.merged ?? ["v1.0.0"],
    now: () => new Date(options.now ?? "2026-11-19T12:00:00Z"),
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
    `::error::${tag} names no release commit of semantic-release's on main (${why}), so it is refused (docs/releasing.md#when-a-release-fails).`;

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

const { changelogTitle } = (await import(
  new URL("../release.config.mjs", import.meta.url).href
)) as {
  changelogTitle: string;
};

const ENTRY =
  "## [1.0.1](https://github.com/solid-memo/website/compare/v1.0.0...v1.0.1) (2026-11-19)\n\n* **solid:** keep the deck";

/** The five files of a release of 1.0.1 on 2026-11-19, as releaseChanges.test.ts holds them. */
function released(): FileChange[] {
  return releasedAs("1.0.1");
}

/** The five files of a release of `version` after 1.0.0, on `date`. */
function releasedAs(version: string, date = "2026-11-19"): FileChange[] {
  const entry = ENTRY.replaceAll("1.0.1", version).replace("2026-11-19", date);
  const files: Change[] = [
    {
      path: "package.json",
      before: '{\n  "version": "1.0.0"\n}\n',
      after: `{\n  "version": "${version}"\n}\n`,
    },
    {
      path: "package-lock.json",
      before:
        '{\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "version": "1.0.0"\n    }\n  }\n}\n',
      after: `{\n  "version": "${version}",\n  "packages": {\n    "": {\n      "version": "${version}"\n    }\n  }\n}\n`,
    },
    {
      path: "publiccode.yml",
      before: 'softwareVersion: 1.0.0\nreleaseDate: "2026-01-01"\n',
      after: `softwareVersion: ${version}\nreleaseDate: "${date}"\n`,
    },
    {
      path: "CITATION.cff",
      before: 'version: "1.0.0"\ndate-released: "2026-01-01"\n',
      after: `version: "${version}"\ndate-released: "${date}"\n`,
    },
    {
      path: "CHANGELOG.md",
      before: `${changelogTitle}\n\n## 1.0.0\n`,
      after: `${changelogTitle}\n\n${entry}\n\n## 1.0.0\n`,
    },
  ];
  return files.map((file) => ({ ...file, modified: true }));
}

describe("main next", () => {
  const refusal = (why: string) =>
    `::error::v1.0.1 names no release commit that may be pushed onto main (${why}), so nothing is pushed (docs/releasing.md#the-deploy-key).`;
  const tip = commit("a", "fix: keep the deck");
  const next = (overrides: Partial<Commit> = {}, options: Parameters<typeof fake>[1] = {}) =>
    fake([tip], {
      tags: { "v1.0.1": "r" },
      others: [commit("r", "chore(release): 1.0.1", { parents: ["a"], ...overrides })],
      changed: { r: released().map((change) => change.path) },
      changes: { r: released() },
      ...options,
    });

  it("passes a release commit on main's tip with nothing but a release's changes", () => {
    const { io, messages } = next();
    expect(main(["node", "next", "v1.0.1"], io)).toBe(0);
    expect(messages).toEqual(["v1.0.1 names r, a release commit onto main's tip."]);
  });

  it("refuses a tag that names no commit", () => {
    const { io, messages } = next({}, { tags: {} });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("it names no commit")]);
  });

  it("refuses a commit whose parent is not main's tip", () => {
    for (const parents of [["z"], ["a", "z"]]) {
      const { io, messages } = next({ parents });
      expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
      expect(messages).toEqual([refusal("r's parent is not main's tip, a")]);
    }
  });

  it("refuses a commit that is not semantic-release's", () => {
    const { io, messages } = next({ author: "Someone <someone@example.org>" });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([
      refusal(`r: its author is Someone <someone@example.org>, not ${BOT}`),
    ]);
  });

  // GitHub skips CI on a push whose message holds a skip keyword anywhere.
  it("refuses a commit whose message is more than its subject", () => {
    const { io, messages } = next({}, { messages: { r: "chore(release): 1.0.1\n\n[skip ci]" } });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("r's message is more than its subject")]);
  });

  it("refuses a commit that adds, removes or changes the mode of a file", () => {
    const changes = released().map((change) =>
      change.path === "package.json" ? { ...change, modified: false } : change,
    );
    const { io, messages } = next({}, { changes: { r: changes } });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("r adds, removes or changes the mode of package.json")]);
  });

  // The prepare job chooses the tag; main's tags choose what it may be.
  it("refuses a version that does not follow the highest release tag on main", () => {
    const why = (version: string, highest: string) =>
      `${version} is not the next patch, minor or major release after ${highest}, the highest release tag on main`;
    for (const [merged, highest] of [
      [["v1.0.0"], "v1.0.0"],
      [["v0.9.0", "v1.0.1", "v1.0.0", "v1.0.0-rc.1"], "v1.0.1"],
      [["v0.10.0", "v1.0.0", "v0.9.9"], "v1.0.0"],
      [["latest", "v1.0.0", "v01.2.0"], "v1.0.0"],
    ] as const) {
      for (const tag of ["v99.0.0", "v1.0.0", "v0.9.1", "v1.0.3", "v1.2.0", "v3.0.0"]) {
        const forged = fake([tip], {
          tags: { [tag]: "r" },
          others: [commit("r", `chore(release): ${tag.slice(1)}`, { parents: ["a"] })],
          merged: [...merged],
        });
        expect(main(["node", "next", tag], forged.io)).toBe(1);
        expect(forged.messages).toEqual([
          `::error::${tag} names no release commit that may be pushed onto main (${why(tag.slice(1), highest)}), so nothing is pushed (docs/releasing.md#the-deploy-key).`,
        ]);
      }
    }
    const below = next({}, { merged: ["v1.0.1", "v1.10.0", "v1.9.0"] });
    expect(main(["node", "next", "v1.0.1"], below.io)).toBe(1);
    expect(below.messages).toEqual([refusal(why("1.0.1", "v1.10.0"))]);
  });

  it("passes the next patch, minor or major release after the highest release tag on main", () => {
    for (const [merged, tag] of [
      [["v1.0.0"], "v1.0.1"],
      [["v0.9.3", "v0.10.0"], "v0.10.1"],
      [["v0.9.3", "v0.10.0"], "v0.11.0"],
      [["v0.9.3", "v0.10.0"], "v1.0.0"],
    ] as const) {
      const version = tag.slice(1);
      const passes = fake([tip], {
        tags: { [tag]: "r" },
        others: [commit("r", `chore(release): ${version}`, { parents: ["a"] })],
        merged: [...merged],
        changes: { r: releasedAs(version) },
        changed: { r: released().map((change) => change.path) },
      });
      expect(main(["node", "next", tag], passes.io)).toBe(0);
      expect(passes.messages).toEqual([`${tag} names r, a release commit onto main's tip.`]);
    }
  });

  it("refuses a release when main has no release tag", () => {
    const { io, messages } = next({}, { merged: ["latest", "v1.0"] });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([refusal("main has no release tag for it to follow")]);
  });

  // The prepare job writes the date; the day the check runs pins it.
  it("refuses a date that is no day of the calendar, or not today or a day either side", () => {
    for (const now of ["2026-11-18T00:00:00Z", "2026-11-20T23:59:59Z"]) {
      const { io } = next({}, { now });
      expect(main(["node", "next", "v1.0.1"], io)).toBe(0);
    }
    const late = next({}, { now: "2026-11-21T00:00:00Z" });
    expect(main(["node", "next", "v1.0.1"], late.io)).toBe(1);
    expect(late.messages).toEqual([
      refusal(
        "r: CHANGELOG.md: its new entry's date, 2026-11-19, is not today, 2026-11-21, or a day either side",
      ),
    ]);
    const forged = next({}, { changes: { r: releasedAs("1.0.1", "2026-13-45") } });
    expect(main(["node", "next", "v1.0.1"], forged.io)).toBe(1);
    expect(forged.messages).toEqual([
      refusal("r: CHANGELOG.md: its new entry's date, 2026-13-45, is no day of the calendar"),
    ]);
  });

  it("refuses a commit that changes more than a release writes", () => {
    const changes = released().map((change) =>
      change.path === "package.json"
        ? { ...change, after: '{\n  "version": "1.0.1",\n  "scripts": {}\n}\n' }
        : change,
    );
    const { io, messages } = next({}, { changes: { r: changes } });
    expect(main(["node", "next", "v1.0.1"], io)).toBe(1);
    expect(messages).toEqual([
      refusal("r: package.json: changes more than the version and the date"),
    ]);
  });
});

describe("main notes", () => {
  it("prints the changelog entry the tag's commit added", () => {
    const { io, messages } = fake([commit("r", "chore(release): 1.0.1")], {
      tags: { "v1.0.1": "r" },
      changes: { r: released() },
    });
    expect(main(["node", "notes", "v1.0.1"], io)).toBe(0);
    expect(messages).toEqual([ENTRY]);
  });

  it("fails for a tag with no commit, or a commit that added no entry", () => {
    const changelog = released().filter((change) => change.path === "CHANGELOG.md");
    const { io, messages } = fake([commit("r", "chore(release): 1.0.1")], {
      tags: { "v1.0.1": "r", "v1.0.2": "s" },
      changes: {
        s: [{ ...changelog[0]!, after: changelog[0]!.before.replace("1.0.0", "0.9.0") }],
      },
    });
    for (const tag of ["v1.0.1", "v1.0.2", "v1.0.3"]) {
      expect(main(["node", "notes", tag], io)).toBe(1);
    }
    expect(messages).toEqual(
      ["v1.0.1", "v1.0.2", "v1.0.3"].map(
        (tag) => `::error::${tag} names no commit that added an entry to CHANGELOG.md.`,
      ),
    );
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
      ["node", "next", "v1.0.1-rc.1"],
      ["node", "notes"],
      ["node", "other"],
      ["node", "toString", "v1.0.1"],
    ]) {
      const { io, messages } = fake([]);
      expect(main(argv, io)).toBe(2);
      expect(messages).toEqual([
        "Usage: npm run release:commit -- last | tag | next | notes <vX.Y.Z>",
      ]);
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
      `::error::v1.0.1 names no release commit of semantic-release's on main (${fake} is not on main's first-parent chain), so it is refused (docs/releasing.md#when-a-release-fails).`,
    ]);
    expect(main(["node", "tag", "v1.0.0"], io())).toBe(0);
    expect(main(["node", "tag", "v9.9.9"], io())).toBe(1);
  });

  // A branch named like a version's tag is not that tag: the tag is read
  // as refs/tags/<tag> only, whichever commit the branch is on.
  it("reads a version's tag, not a branch of the same name", () => {
    const release = git(["rev-parse", "v1.0.0^{commit}"]);
    git(["branch", "v1.0.0", "feature^"]);
    expect(main(["node", "tag", "v1.0.0"], io())).toBe(0);
    expect(messages).toEqual([`v1.0.0 names ${release}, its release commit.`]);
    git(["branch", "v1.0.1", "main^"]);
    expect(main(["node", "tag", "v1.0.1"], io())).toBe(1);
    expect(messages[1]).toContain("(it names no commit)");
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

  it("reads a commit off main, its whole message and the text of the files it changes", () => {
    const tip = git(["rev-parse", "main"]);
    git(["switch", "-q", "--detach"]);
    write("package.json", '{"version":"1.0.1"}\n');
    write("added.txt", "new\n");
    chmodSync(join(repo, "app.js"), 0o755);
    git(["add", "."]);
    git(["commit", "-q", "-m", "chore(release): 1.0.1", "-m", "A body."], bot);
    const sha = git(["rev-parse", "HEAD"]);
    git(["tag", "v1.0.1", sha]);
    git(["tag", "latest", tip]);
    const real = io();
    expect(real.head()).toBe(tip);
    // main's own tags only: not the tag on the commit off main.
    expect(real.merged()).toEqual(["latest", "v1.0.0"]);
    expect(real.now()).toBeInstanceOf(Date);
    expect(real.commit(sha)).toEqual({
      sha,
      parents: [tip],
      author: BOT,
      committer: BOT,
      subject: "chore(release): 1.0.1",
    });
    expect(real.message(sha)).toBe("chore(release): 1.0.1\n\nA body.");
    expect(real.changes(sha)).toEqual([
      { path: "added.txt", modified: false, before: "", after: "" },
      { path: "app.js", modified: false, before: "", after: "" },
      {
        path: "package.json",
        modified: true,
        before: '{"version":"1.0.0"}\n',
        after: '{"version":"1.0.1"}\n',
      },
    ]);
  });

  // A name may hold any character but NUL, a line feed, < and >, so the
  // fields are read apart at NUL: a name with another separator in it
  // stays one name.
  it("reads a name that holds a separator as one name", () => {
    write("package.json", '{"version":"1.0.2"}\n');
    git(["commit", "-qam", "chore(release): 1.0.2"], {
      ...bot,
      GIT_AUTHOR_NAME: "x\x1fgithub-actions[bot]",
    });
    const [commit] = io("HEAD").firstParents();
    expect(commit).toEqual({
      sha: git(["rev-parse", "HEAD"]),
      parents: [git(["rev-parse", "HEAD^"])],
      author: "x\x1fgithub-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
      committer: BOT,
      subject: "chore(release): 1.0.2",
    });
    const all = io("HEAD").firstParents();
    expect(all.map(({ sha }) => sha)).toEqual(
      git(["rev-list", "--first-parent", "HEAD"]).split("\n"),
    );
    expect(all.at(-1)?.subject).toBe("feat: start");
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
    expect(log).toHaveBeenCalledWith(
      "Usage: npm run release:commit -- last | tag | next | notes <vX.Y.Z>",
    );
    log.mockRestore();
  });
});
