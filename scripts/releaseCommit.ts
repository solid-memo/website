// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run release:commit -- last` and `npm run release:commit -- tag <vX.Y.Z>`:
 * whether a commit is one semantic-release made (docs/releasing.md#what-a-release-does).
 * A subject is not enough: any commit can be titled `chore(release): X.Y.Z`,
 * and a pull request's commits stay in main's history after its merge.
 * A release commit is one that semantic-release pushed onto main:
 *
 * - it is on main's first-parent chain, where a pull request's own
 *   commits never are, as the merge queue merges with a merge commit;
 * - its subject is `chore(release): ` and the version, and it has one parent;
 * - github-actions[bot] is its author and its committer, as release.yml
 *   sets them for semantic-release;
 * - it changes nothing but the files a release writes (release.config.mjs).
 *
 * The author and committer are only names, which anyone can set, and
 * package.json is one of a release's files. The first-parent rule is
 * what holds: main takes only the merge queue's merge commits and
 * release.yml's pushes, so a commit made to look like the bot's stays
 * off that chain. These checks do not stand on the names alone.
 *
 * `last`, in release.yml: the newest release commit on main must have a
 * tag, or every release stops (a tag's push failed). A commit that is
 * only titled as one is passed over, with a notice.
 *
 * `tag`, in deploy.yml: the commit a version's tag names must be that
 * version's release commit, or the site is not deployed.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { isRelease, strayFiles } from "./ciGate.ts";

/** Who release.yml makes semantic-release's commits as. */
const BOT = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";

/** A commit as the checks read it. */
export interface Commit {
  sha: string;
  subject: string;
  parents: string[];
  /** `name <email>`. */
  author: string;
  committer: string;
}

/** What the checks read. */
export interface ReleaseCommitIo {
  /** The commits on main's first-parent chain, newest first. */
  firstParents(): Commit[];
  /** The files a commit changes against its parent. */
  changed(sha: string): string[];
  /** The tags that name a commit. */
  tags(sha: string): string[];
  /** The commit a tag names, if it names one. */
  tagged(tag: string): string | undefined;
  log(message: string): void;
}

/** Why a commit on main's first-parent chain is not a release commit, or undefined when it is one. */
function notRelease(io: ReleaseCommitIo, commit: Commit, version?: string): string | undefined {
  if (!isRelease(commit.subject)) return "its subject is not a release's";
  if (version !== undefined && commit.subject !== `chore(release): ${version}`) {
    return `its subject is not chore(release): ${version}`;
  }
  if (commit.parents.length !== 1) return `it has ${commit.parents.length} parents, not one`;
  if (commit.author !== BOT) return `its author is ${commit.author}, not ${BOT}`;
  if (commit.committer !== BOT) return `its committer is ${commit.committer}, not ${BOT}`;
  const stray = strayFiles(io.changed(commit.sha));
  if (stray.length > 0) {
    return `it changes ${stray.join(", ")}, which a release never writes (release.config.mjs)`;
  }
  return undefined;
}

/** Exit code of `last`: 1 when the newest release commit on main has no tag. */
function last(io: ReleaseCommitIo): number {
  for (const commit of io.firstParents()) {
    if (!isRelease(commit.subject)) continue;
    const why = notRelease(io, commit);
    if (why !== undefined) {
      io.log(`::notice::${commit.sha} is titled as a release commit, but is not one: ${why}.`);
      continue;
    }
    if (io.tags(commit.sha).length === 0) {
      io.log(
        `::error::The release commit ${commit.sha} has no tag: tag it by hand before anything else is released (docs/releasing.md#when-a-release-fails).`,
      );
      return 1;
    }
    io.log(`The newest release commit, ${commit.sha}, has its tag.`);
    return 0;
  }
  io.log("No release commit on main yet.");
  return 0;
}

/** Exit code of `tag`: 1 when the tag does not name its version's release commit on main. */
function tag(io: ReleaseCommitIo, name: string): number {
  const refuse = (why: string) => {
    io.log(
      `::error::${name} names no release commit of semantic-release's on main (${why}), so the site is not deployed (docs/releasing.md#when-a-release-fails).`,
    );
    return 1;
  };
  const sha = io.tagged(name);
  if (sha === undefined) return refuse("it names no commit");
  const commit = io.firstParents().find((each) => each.sha === sha);
  if (commit === undefined) return refuse(`${sha} is not on main's first-parent chain`);
  const why = notRelease(io, commit, name.slice(1));
  if (why !== undefined) return refuse(`${sha}: ${why}`);
  io.log(`${name} names ${sha}, its release commit.`);
  return 0;
}

const USAGE = "Usage: npm run release:commit -- last | tag <vX.Y.Z>";

/** Exit code: 0 when the check passes, 1 when it fails, 2 when it is called wrongly. */
export function main(argv: readonly string[], io: ReleaseCommitIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const [command, ...args] = argv.slice(1);
  if (command === "last" && args.length === 0) return last(io);
  const [name] = args;
  if (command === "tag" && args.length === 1 && /^v\d+\.\d+\.\d+$/.test(name!)) {
    return tag(io, name!);
  }
  io.log(USAGE);
  return 2;
}

/** The io of the repository at `repo`, whose main is `main` (a ref). */
export function defaultIo(repo: string, main: string): ReleaseCommitIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  const lines = (text: string) => text.split("\n").filter((line) => line !== "");
  return {
    firstParents: () =>
      lines(
        git("log", "--first-parent", "--format=%H%x1f%P%x1f%an <%ae>%x1f%cn <%ce>%x1f%s", main),
      ).map((line) => {
        const [sha, parents, author, committer, subject] = line.split("\x1f");
        return {
          sha: sha!,
          parents: parents!.split(" ").filter(Boolean),
          author: author!,
          committer: committer!,
          subject: subject!,
        };
      }),
    changed: (sha) => lines(git("diff", "--name-only", `${sha}^`, sha)),
    tags: (sha) => lines(git("tag", "--points-at", sha)),
    tagged: (name) => {
      try {
        return git("rev-parse", "--verify", "--quiet", `refs/tags/${name}^{commit}`);
      } catch {
        return undefined;
      }
    },
    log: (message) => console.log(message),
  };
}

/**
 * The script entry: `node -e "import('./scripts/releaseCommit.ts').then((m) => m.run(process))" -- last`.
 * main is the checkout's HEAD, or RELEASE_MAIN when set (deploy.yml's origin/main).
 */
export function run(process: {
  argv: readonly string[];
  env: Partial<Record<"RELEASE_MAIN", string>>;
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(
    process.argv,
    defaultIo(resolve(import.meta.dirname, ".."), process.env.RELEASE_MAIN ?? "HEAD"),
  );
}
