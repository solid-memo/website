// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The semantic-release plugin that chooses the next version and writes
 * its notes (release.config.mjs, docs/releasing.md#what-a-merge-commit-decides):
 * the commit analyzer and the release-notes generator, given every
 * commit since the last version but the merge commits.
 *
 * semantic-release reads merge commits too, and the merge queue's holds
 * the pull request's title, which commitlint never sees. The pull
 * request's own commits, which it lints, are in the range all the same,
 * so what they say still counts. One it skips, such as a revert, stays
 * in too, as a revert still releases, and `npm run check:merges` keeps
 * it from saying it breaks.
 *
 * A revert leaves out the commit it names, and itself, only when its
 * change undoes that commit (scripts/reverts.ts): the plugins match a
 * revert by its message alone, so any other revert is handed on with no
 * hash to match. It still releases a patch, and the commit it names
 * counts as if it were not there, a breaking change among them.
 *
 * A merge commit is told by its parents, whatever its message says, so
 * this does not rest on the wording GitHub gives it. The parser's
 * `mergePattern` would not do: it makes the line after a merge's subject
 * the commit's header, so a title could choose the version that way.
 *
 * The plugins read each commit as git holds it, by its hash, not as
 * semantic-release read it: that comes from one run of git log split at
 * a text that a commit's author or committer could hold, and so could
 * name another commit or message. When the two differ, nothing is
 * released.
 *
 * The range ends where semantic-release read it, the first time a step
 * asks. Once @semantic-release/git has made the release commit, it moves
 * `nextRelease.gitHead` to that commit and writes the notes again, with
 * the commits it read before: a range to the new head would hold the
 * release commit too, which semantic-release never read.
 *
 * A default export, as semantic-release takes the plugin by its path
 * (scripts/releaseWithoutMerges.test.ts loads it the same way).
 */
import { type Git, gitAt, withRevertsChecked } from "./reverts.ts";

/** A commit as the plugins read it, every field read from git by its hash. */
type ReadCommit = { hash: string; message: string; committerDate: Date };

type Release = { gitHead?: string | undefined; [field: string]: unknown };

type Context = {
  commits: readonly { hash: string; message: string }[];
  cwd: string;
  /** The commit each release is at, among what else semantic-release says of it. */
  lastRelease?: Release | undefined;
  nextRelease?: Release | undefined;
};

/** The head each run read its commits up to, by its repository and last release. */
const readHeads = new Map<string, string>();

/**
 * The commit semantic-release read the range up to: the release's head,
 * or HEAD, when a step first asks, and the same commit at every step
 * after, whatever the head has moved to since.
 */
function readTo(context: Context, git: Git): string {
  const run = `${context.cwd}\0${context.lastRelease?.gitHead ?? ""}`;
  const known = readHeads.get(run);
  if (known !== undefined) return known;
  const to = context.nextRelease?.gitHead ?? "HEAD";
  const head = git(["rev-parse", "--verify", "--end-of-options", `${to}^{commit}`]).trim();
  readHeads.set(run, head);
  return head;
}

/**
 * The commits since the last release, newest first, as git holds them:
 * the range semantic-release reads (lib/get-commits.js), each commit
 * told a merge by its parents.
 */
function rangeOf(context: Context, git: Git): { hash: string; merge: boolean }[] {
  const to = readTo(context, git);
  const from = context.lastRelease?.gitHead;
  return git(["rev-list", "--parents", "--end-of-options", from ? `${from}..${to}` : to])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [hash, ...parents] = line.split(" ");
      return { hash: hash!, merge: parents.length > 1 };
    });
}

/**
 * A commit read from git by its hash. The date comes first, in a form
 * with no line feed, and the message, the one field of free text, last,
 * so no text in it can pass for another field.
 */
function readCommit(git: Git, hash: string): ReadCommit {
  const [date, ...message] = git(["log", "-1", "--format=%cI%n%B", "--end-of-options", hash]).split(
    "\n",
  );
  return { hash, message: message.join("\n").trim(), committerDate: new Date(date!) };
}

/**
 * Whether semantic-release read the commits git holds: the same hashes,
 * each once, and each with git's message. It reads them all from one
 * run of git log, which it splits at a text (`==FIELD==`) that a commit
 * could hold where no check reads it, such as its author's name.
 */
function readAsGitHolds(context: Context, commits: readonly ReadCommit[]): boolean {
  const messages = new Map(commits.map(({ hash, message }) => [hash, message]));
  return (
    context.commits.length === commits.length &&
    new Set(context.commits.map(({ hash }) => hash)).size === commits.length &&
    context.commits.every(({ hash, message }) => messages.get(hash) === message.trim())
  );
}

/**
 * The commits the plugins read: those since the last release, read from
 * git by their hashes, merges aside, and only true reverts matched to a
 * commit. A range that semantic-release read otherwise, or one git
 * cannot read, stops the release.
 */
function asRead<C extends Context>(context: C): C {
  const git = gitAt(context.cwd);
  const range = rangeOf(context, git);
  const read = range.map(({ hash }) => readCommit(git, hash));
  if (!readAsGitHolds(context, read)) {
    throw new Error(
      "The commits semantic-release read since the last release are not the ones git holds, so nothing is released (docs/releasing.md#when-a-release-fails).",
    );
  }
  const merges = new Set(range.filter(({ merge }) => merge).map(({ hash }) => hash));
  const commits = read.filter(({ hash }) => !merges.has(hash));
  return { ...context, commits: withRevertsChecked(commits, git) };
}

// Untyped modules: imported by a name TypeScript does not resolve.
const ANALYZER = "@semantic-release/commit-analyzer";
const NOTES_GENERATOR = "@semantic-release/release-notes-generator";

export default {
  async analyzeCommits<C extends Context>(config: unknown, context: C): Promise<string | null> {
    const { analyzeCommits } = (await import(ANALYZER)) as {
      analyzeCommits(config: unknown, context: unknown): Promise<string | null>;
    };
    return analyzeCommits(config, asRead(context));
  },
  async generateNotes<C extends Context>(config: unknown, context: C): Promise<string> {
    const { generateNotes } = (await import(NOTES_GENERATOR)) as {
      generateNotes(config: unknown, context: unknown): Promise<string>;
    };
    return generateNotes(config, asRead(context));
  },
};
