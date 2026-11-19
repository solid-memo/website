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
 * `tag`, in deploy.yml and in release.yml's publish and docs jobs: the
 * commit a version's tag names must be that version's release commit,
 * or the site is not deployed and the release is not made. The tag is
 * read as refs/tags/<tag> only, so a branch of the same name is never
 * taken for it.
 *
 * `next`, in release.yml's push job, which holds the deploy key: the
 * commit a version's tag names, fetched from the bundle the prepare job
 * made with no key, is pushed onto main only when it is a release
 * commit whose parent is main's tip, whose message is its subject
 * alone, and whose files are main's with nothing but the version, the
 * date and one changelog entry written in (scripts/releaseChanges.ts).
 * The bundle chooses neither the version nor the date: the version must
 * be the next patch, minor or major release after the highest release
 * tag on main, read from main's own tags, and the date must be the day
 * the check runs, or a day either side.
 *
 * `notes`, in release.yml's publish and docs jobs: prints the changelog
 * entry the tag's commit added, which is the release's notes.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { isRelease, strayFiles } from "./ciGate.ts";
import { addedEntry, type Change, unexpectedChanges } from "./releaseChanges.ts";
import { isReleaseVersion } from "./releaseVersion.ts";

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

/** A file a commit changes, and whether it stays a regular file it was (git's status M, mode 100644). */
export interface FileChange extends Change {
  modified: boolean;
}

/** What the checks read. */
export interface ReleaseCommitIo {
  /** The commits on main's first-parent chain, newest first. */
  firstParents(): Commit[];
  /** main's tip. */
  head(): string;
  /** A commit, by its SHA. */
  commit(sha: string): Commit;
  /** A commit's whole message, with no trailing newline. */
  message(sha: string): string;
  /** The files a commit changes against its parent, with their text. */
  changes(sha: string): FileChange[];
  /** The files a commit changes against its parent. */
  changed(sha: string): string[];
  /** The tags that name a commit. */
  tags(sha: string): string[];
  /** The commit a tag names, if it names one. */
  tagged(tag: string): string | undefined;
  /** The tags on main's tip or in its history. */
  merged(): string[];
  /** The time the check runs at. */
  now(): Date;
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
      `::error::${name} names no release commit of semantic-release's on main (${why}), so it is refused (docs/releasing.md#when-a-release-fails).`,
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

/** A release's version as its three numbers. */
type Version = [bigint, bigint, bigint];

/** Whether version `a` is above version `b`: numbers compare as numbers, so 1.10.0 is above 1.9.0. */
function above(a: Version, b: Version): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

/**
 * The highest release among the tags, by its version, as semantic-release
 * finds the last release among the tags main has; undefined when there
 * is none.
 */
function highestRelease(tags: readonly string[]): Version | undefined {
  return tags
    .filter((tag) => tag.startsWith("v") && isReleaseVersion(tag.slice(1)))
    .map((tag) => tag.slice(1).split(".").map(BigInt) as Version)
    .reduce<Version | undefined>(
      (highest, version) => (highest === undefined || above(version, highest) ? version : highest),
      undefined,
    );
}

/** The versions that may follow `version`: its next patch, minor and major release. */
function successors([major, minor, patch]: Version): string[] {
  return [`${major}.${minor}.${patch + 1n}`, `${major}.${minor + 1n}.0`, `${major + 1n}.0.0`];
}

/** Exit code of `next`: 1 when the tag's commit is not a release commit to push onto main's tip. */
function next(io: ReleaseCommitIo, name: string): number {
  const refuse = (why: string) => {
    io.log(
      `::error::${name} names no release commit that may be pushed onto main (${why}), so nothing is pushed (docs/releasing.md#the-deploy-key).`,
    );
    return 1;
  };
  const sha = io.tagged(name);
  if (sha === undefined) return refuse("it names no commit");
  const version = name.slice(1);
  const highest = highestRelease(io.merged());
  if (highest === undefined) return refuse("main has no release tag for it to follow");
  if (!successors(highest).includes(version)) {
    return refuse(
      `${version} is not the next patch, minor or major release after v${highest.join(".")}, the highest release tag on main`,
    );
  }
  const commit = io.commit(sha);
  const head = io.head();
  if (commit.parents.join(" ") !== head)
    return refuse(`${sha}'s parent is not main's tip, ${head}`);
  const why = notRelease(io, commit, version);
  if (why !== undefined) return refuse(`${sha}: ${why}`);
  if (io.message(sha) !== commit.subject)
    return refuse(`${sha}'s message is more than its subject`);
  const changes = io.changes(sha);
  const odd = changes.filter((change) => !change.modified).map((change) => change.path);
  if (odd.length > 0)
    return refuse(`${sha} adds, removes or changes the mode of ${odd.join(", ")}`);
  const problems = unexpectedChanges(changes, version, io.now());
  if (problems.length > 0) return refuse(`${sha}: ${problems.join("; ")}`);
  io.log(`${name} names ${sha}, a release commit onto main's tip.`);
  return 0;
}

/** Exit code of `notes`: 1 when the tag's commit added no changelog entry. */
function notes(io: ReleaseCommitIo, name: string): number {
  const sha = io.tagged(name);
  const changelog = sha && io.changes(sha).find((change) => change.path === "CHANGELOG.md");
  const entry = changelog && addedEntry(changelog.before, changelog.after);
  if (!entry) {
    io.log(`::error::${name} names no commit that added an entry to CHANGELOG.md.`);
    return 1;
  }
  io.log(entry);
  return 0;
}

const COMMANDS = { tag, next, notes } as const;

const USAGE = "Usage: npm run release:commit -- last | tag | next | notes <vX.Y.Z>";

/** Exit code: 0 when the check passes, 1 when it fails, 2 when it is called wrongly. */
export function main(argv: readonly string[], io: ReleaseCommitIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const [command, ...args] = argv.slice(1);
  if (command === "last" && args.length === 0) return last(io);
  const [name] = args;
  if (
    Object.hasOwn(COMMANDS, command ?? "") &&
    args.length === 1 &&
    /^v\d+\.\d+\.\d+$/.test(name!)
  ) {
    return COMMANDS[command as keyof typeof COMMANDS](io, name!);
  }
  io.log(USAGE);
  return 2;
}

/**
 * Five fields to a commit, each ended by NUL, which git never lets a
 * name, an email or a subject hold, so no text in one can pass for
 * another.
 */
const FORMAT = "--format=%H%x00%P%x00%an <%ae>%x00%cn <%ce>%x00%s%x00";

/** The commits `git log` printed in FORMAT. */
function commits(output: string): Commit[] {
  const fields = output.split("\0");
  const result: Commit[] = [];
  for (let at = 0; at + 5 <= fields.length; at += 5) {
    const [sha, parents, author, committer, subject] = fields.slice(at, at + 5);
    result.push({
      sha: sha!.trim(),
      parents: parents!.split(" ").filter(Boolean),
      author: author!,
      committer: committer!,
      subject: subject!,
    });
  }
  return result;
}

/** The io of the repository at `repo`, whose main is `main` (a ref). */
export function defaultIo(repo: string, main: string): ReleaseCommitIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  const lines = (text: string) => text.split("\n").filter((line) => line !== "");
  return {
    firstParents: () => commits(git("log", "--first-parent", FORMAT, main)),
    head: () => git("rev-parse", "--verify", `${main}^{commit}`),
    commit: (sha) => commits(git("log", "-1", FORMAT, sha))[0]!,
    message: (sha) => git("log", "-1", "--format=%B", sha),
    changes: (sha) =>
      lines(git("diff", "--raw", "--no-renames", "--no-abbrev", `${sha}^`, sha)).map((line) => {
        const [modes, path] = line.split("\t") as [string, string];
        const [oldMode, newMode, , , status] = modes.slice(1).split(" ");
        const modified = status === "M" && oldMode === "100644" && newMode === "100644";
        // Untrimmed, and as large as package-lock.json.
        const text = (rev: string) =>
          execFileSync("git", ["-C", repo, "show", `${rev}:${path}`], {
            encoding: "utf8",
            maxBuffer: 256 * 1024 * 1024,
          });
        return modified
          ? { path, modified, before: text(`${sha}^`), after: text(sha) }
          : { path, modified, before: "", after: "" };
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
    merged: () => lines(git("tag", "--list", "--merged", main)),
    now: () => new Date(),
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
