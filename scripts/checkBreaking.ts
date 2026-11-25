// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:breaking -- --base <git ref>`: a change to the public
 * API (docs/releasing.md#the-public-api) is not released as a minor
 * version by mistake. The API is written down in
 * semver-public-api-declaration/, one promise a line, each file kept to
 * the code by a test in the package it reads
 * (semver-public-api-declaration/README.md):
 *
 * - A file of semver-public-api-declaration/: a line may go only in a
 *   breaking change, so when one that was there at the base is gone, a
 *   commit since the base must say it breaks (`!` after its type, or a
 *   `BREAKING CHANGE:` footer), whatever its type, as the release makes
 *   any such commit a major version, a `revert:` one too, or say why it
 *   does not (a `Contract-Change: not-breaking <reason>` trailer).
 * - semver-public-api-declaration/frozen/: a line never goes, breaking
 *   or not. A published shape is never edited, nor a published file
 *   removed, and the format a kind of data is written in, the place of
 *   the data in a pod and the version of a database in the browser
 *   never move: an older version of the app could not save, find or
 *   open what a newer one left.
 *
 * The base is where the branch left `<git ref>` (their merge base), so a
 * line that the ref gained since then is not taken for one the branch
 * lost.
 *
 * The commits are read as the release reads them: each message by the
 * release's own parser, with its options, so a `!` or a footer counts
 * where it does for the release; and a commit that a later one truly
 * reverts says nothing, as the release leaves both out
 * (scripts/reverts.ts). A revert that only says so takes nothing back.
 *
 * The release reads every commit since the last release tag, not only
 * the branch's, so when the base check passes, the same check runs again
 * from that tag: a commit merged earlier that said it breaks, and that a
 * commit here reverts, no longer covers a line gone since the release.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { asReleased, gitAt } from "./reverts.ts";

type Parser = { parse(message: string): { notes: unknown[] } };

/**
 * The release's parser, set up as the release sets it up: the copy of
 * conventional-commits-parser that the commit analyzer itself imports,
 * which may be another version than the one at the top of
 * node_modules, with the preset's options, then release.config.mjs's
 * over them, as the analyzer merges them. scripts/releaseConfig.test.ts
 * runs the analyzer on the same messages as saysBreaking, to keep the
 * two in step.
 */
const PARSER = await (async () => {
  const { parserOpts, presetConfig } = (await import(
    new URL("../release.config.mjs", import.meta.url).href
  )) as { parserOpts: object; presetConfig: unknown };
  // Untyped modules: imported by a name TypeScript does not resolve.
  const preset = "conventional-changelog-conventionalcommits";
  const { default: createPreset } = (await import(preset)) as {
    default(config: unknown): { parser: object };
  };
  // Found as Node finds it from the analyzer's own file: the package
  // exports only an ES module, which require.resolve does not take.
  const analyzer = createRequire(import.meta.url).resolve("@semantic-release/commit-analyzer");
  const name = "conventional-commits-parser";
  const dir = createRequire(analyzer)
    .resolve.paths(name)!
    .map((nodeModules) => join(nodeModules, name))
    .find((path) => existsSync(join(path, "package.json"))) as string;
  const { exports } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    exports: { import: string };
  };
  const { CommitParser } = (await import(pathToFileURL(join(dir, exports.import)).href)) as {
    CommitParser: new (options: object) => Parser;
  };
  return new CommitParser({ ...createPreset(presetConfig).parser, ...parserOpts });
})();

/** Files by their path in the repository, each with its text. */
export type Files = ReadonlyMap<string, string>;

/** A commit since the base: its hash, and its whole message. */
export type Commit = { hash: string; message: string };

/** A line of a file at the base that the file no longer has. */
export type LostLine = { file: string; line: string };

const API = "semver-public-api-declaration/";
const FROZEN = `${API}frozen/`;
/** The folder's name until #1034: a commit from before then has the files there. */
const OLD_API = "api/";

/** Whether a path is one of the files that write the public API down. */
export function isApiFile(path: string): boolean {
  return path.startsWith(API) && path.endsWith(".txt");
}

function isFrozen(path: string): boolean {
  return path.startsWith(FROZEN);
}

/** The lines of each file at the base that it no longer has; all of them when it is gone. */
export function lostLines(base: Files, head: Files): LostLine[] {
  const lost: LostLine[] = [];
  for (const [file, text] of base) {
    const now = new Set(linesOf(head.get(file) ?? ""));
    for (const line of linesOf(text)) if (!now.has(line)) lost.push({ file, line });
  }
  return lost;
}

function linesOf(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

/**
 * Whether a commit says it breaks, as semantic-release reads it: its
 * parser, with the release's options, finds a note, from `!` after the
 * type or from a `BREAKING CHANGE:` footer, in a line as the parser
 * splits the message into lines. A message with nothing in it the
 * release skips.
 */
export function saysBreaking(message: string): boolean {
  return message.trim() !== "" && PARSER.parse(message).notes.length > 0;
}

/**
 * The reason a commit gives for a line of semver-public-api-declaration/ it removes without
 * breaking anything, on a line of its own as the release's parser
 * splits a message into lines.
 */
export function notBreakingReason(message: string): string | undefined {
  for (const line of message.split(/\r?\n/)) {
    const reason = /^Contract-Change: not-breaking\s+(\S.*)$/.exec(line)?.[1];
    if (reason !== undefined) return reason;
  }
  return undefined;
}

function subjectOf(commit: Commit): string {
  return `${commit.hash.slice(0, 8)} ${commit.message.split("\n")[0]}`;
}

/** What the check found: problems fail it, notes do not. */
export function verdict(
  lost: readonly LostLine[],
  commits: readonly Commit[],
): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const frozen = lost.filter((l) => isFrozen(l.file));
  const contract = lost.filter((l) => !isFrozen(l.file));
  for (const { file, line } of frozen) {
    problems.push(`${file}: "${line}" is gone, and never may be: ${neverWhy(file)}`);
  }
  const breaking = commits.filter((c) => saysBreaking(c.message));
  const waived = commits.filter((c) => notBreakingReason(c.message) !== undefined);
  if (contract.length > 0 && breaking.length === 0 && waived.length === 0) {
    for (const { file, line } of contract) problems.push(`${file}: "${line}" is gone.`);
    problems.push(
      "A line of semver-public-api-declaration/ went, so the public API changed (docs/releasing.md#the-public-api). If the change is breaking, its commit says so: `!` after its type and a `BREAKING CHANGE:` footer that tells users what to do. If it is not (an old address still opens, a key's old value is still read), add a `Contract-Change: not-breaking <reason>` trailer to the commit.",
    );
  } else if (contract.length > 0) {
    for (const { file, line } of contract) notes.push(`${file}: "${line}" is gone.`);
    for (const commit of breaking) notes.push(`Declared breaking by ${subjectOf(commit)}.`);
    for (const commit of waived) {
      notes.push(`Not breaking, says ${subjectOf(commit)}: ${notBreakingReason(commit.message)}`);
    }
  } else if (lost.length === 0) {
    for (const commit of breaking) {
      notes.push(
        `${subjectOf(commit)} says it breaks, but no line of semver-public-api-declaration/ went. That is right for a feature removed; otherwise drop the \`!\` and the footer.`,
      );
    }
  }
  return { problems, notes };
}

/** What to do instead, for each file of semver-public-api-declaration/frozen/ that holds the data where it is; any other lists what is published. */
const HELD: readonly [file: string, why: string][] = [
  [
    `${FROZEN}formats.txt`,
    "an older version of the app does not save over a format newer than its own, so a format never moves (docs/vocab.md#versioning-policy); add the data as a term outside every shape, or as a new kind in format 1.",
  ],
  [
    `${FROZEN}pod-layout.txt`,
    "an older version of the app looks for the data where it was, so it never moves (docs/releasing.md#what-never-changes); keep the place, and add a new one beside it.",
  ],
  [
    `${FROZEN}pods.txt`,
    "a pod a version of the app wrote is read by every later one, so its snapshot is never edited or removed (docs/releasing.md#what-never-changes); leave it as it is, and let the test add the next one.",
  ],
  [
    `${FROZEN}browser-storage/`,
    "a tab of an older version cannot open a database a newer one raised, so its version never moves (docs/releasing.md#what-never-changes); keep what is new in a database of its own.",
  ],
];

function neverWhy(file: string): string {
  const held = HELD.find(([path]) => file.startsWith(path));
  if (held !== undefined) return held[1];
  return `${file} lists what is published once and for all (docs/releasing.md#what-has-versions-of-its-own); publish a new version instead.`;
}

/** What the check reads. */
export interface BreakingIo {
  /** The merge base of `ref` and HEAD. */
  mergeBase(ref: string): string;
  /** The files of semver-public-api-declaration/ at a commit. */
  filesAt(commit: string): Files;
  /** The files of semver-public-api-declaration/ in the working tree. */
  files(): Files;
  /** The commits from `commit` to HEAD, merges aside, as the release reads them. */
  commitsSince(commit: string): Commit[];
  /** The highest release tag HEAD has, as the release finds it; undefined for none. */
  lastRelease(): string | undefined;
  log(message: string): void;
}

const NO_RELEASE = "No release tag found; checked from the base only.";

const USAGE = "Usage: npm run check:breaking -- --base <git ref>";

/** Exit code: 0 when every line the base had is kept, or its going is declared. */
export function main(argv: readonly string[], io: BreakingIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  if (args.length !== 2 || args[0] !== "--base" || args[1].startsWith("-")) {
    io.log(USAGE);
    return 1;
  }
  try {
    const base = io.mergeBase(args[1]);
    const lost = lostLines(io.filesAt(base), io.files());
    const { problems, notes } = verdict(lost, io.commitsSince(base));
    for (const note of notes) io.log(note);
    for (const problem of problems) io.log(problem);
    if (problems.length > 0) return 1;
    const sinceRelease = releaseProblems(io, base);
    for (const problem of sinceRelease) io.log(problem);
    if (sinceRelease.length > 0) return 1;
    io.log(`The public API keeps every line it had at ${base.slice(0, 8)}, or says why not.`);
    return 0;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

/**
 * What the check finds from the last release tag, which is what the
 * release reads; nothing when it is the base, or there is no tag, which
 * it says.
 */
function releaseProblems(io: BreakingIo, base: string): string[] {
  const tag = io.lastRelease();
  if (tag === undefined) {
    io.log(NO_RELEASE);
    return [];
  }
  const release = io.mergeBase(tag);
  if (release === base) return [];
  const lost = lostLines(io.filesAt(release), io.files());
  const { problems } = verdict(lost, io.commitsSince(release));
  if (problems.length === 0) return [];
  return [
    `Since the last release, ${tag}, as the release reads the commits from there (a commit that a later one reverts says nothing):`,
    ...problems,
  ];
}

/** A release tag: `v` and a version, with no pre-release or build. */
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

/**
 * The highest release among the tags, by its version, as semantic-release
 * finds the last release among the tags HEAD has: not the nearest, which
 * after a merge can be an older one. Numbers compare as numbers, so
 * v1.10.0 is above v1.9.0.
 */
function highestRelease(tags: readonly string[]): string | undefined {
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => RELEASE_TAG.test(tag))
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
}

/** The io of the repository at `repo`. */
export function defaultIo(repo: string): BreakingIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  const paths = (listing: string) => listing.split("\0").filter(isApiFile);
  return {
    mergeBase: (ref) => git("merge-base", "--end-of-options", ref, "HEAD").trim(),
    // Under the folder's new name, so the rename takes no line away.
    filesAt: (commit) => {
      const listed = (folder: string) =>
        git("ls-tree", "-r", "-z", "--name-only", commit, "--", folder)
          .split("\0")
          .map((path) => ({ path: `${API}${path.slice(folder.length)}`, at: path }))
          .filter(({ path }) => isApiFile(path));
      const now = listed(API);
      const files = now.length > 0 ? now : listed(OLD_API);
      return new Map(files.map(({ path, at }) => [path, git("show", `${commit}:${at}`)]));
    },
    // Tracked or new, and still there: a file deleted but not yet staged is gone.
    files: () =>
      new Map(
        paths(git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", API))
          .filter((path) => existsSync(join(repo, path)))
          .map((path) => [path, readFileSync(join(repo, path), "utf8")]),
      ),
    // One commit at a time: a separator could be written in a message.
    commitsSince: (commit) =>
      asReleased(
        git("rev-list", "--no-merges", "--end-of-options", `${commit}..HEAD`)
          .split("\n")
          .filter((hash) => hash !== "")
          .map((hash) => ({
            hash,
            message: git("log", "-1", "--format=%B", "--end-of-options", hash).trim(),
          })),
        gitAt(repo),
      ),
    lastRelease: () => highestRelease(git("tag", "--merged", "HEAD").split("\n")),
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/checkBreaking.ts').then((m) => m.run(process))" -- --base <ref>`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
