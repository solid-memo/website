// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:merges -- --base <git ref> --head <git ref> [--queue]`:
 * the commits between the two hold nothing that the tools after them
 * would act on and commitlint does not catch
 * (docs/releasing.md#what-a-merge-commit-decides). CI's commits job runs
 * it on a pull request's commits, and with `--queue` on what a merge queue
 * run built.
 *
 * A merge commit's message holds the pull request's title, and it is the
 * commit that lands on main. The check reads the commit itself, so it
 * holds whenever the title was last changed. It refuses a keyword that
 * makes GitHub skip CI (SKIP_KEYWORD, from commitlint.config.mjs) and a
 * line a breaking change's footer starts with (saysBreaking, from
 * checkBreaking.ts).
 *
 * A commit with one parent that commitlint skips (skippedByCommitlint,
 * from the same file), such as a revert or a fixup, is still read by the
 * release, so it may not say it breaks: that takes a commit commitlint
 * reads. It still releases what it otherwise would.
 *
 * A commit with one parent whose message says it reverts a commit (the
 * release's revert pattern, as `git revert` writes it) must undo that
 * commit's change (undoes, from reverts.ts). The release reads any other
 * as a revert of nothing, so the commit it names still counts.
 *
 * No commit may hold what would change how CHANGELOG.md is linted
 * (CHANGELOG_DIRECTIVE, from commitlint.config.mjs): the release writes a
 * commit's subject and footer there, so an HTML comment or a spell
 * checker's directive would fail CI on the release commit. The check
 * reads every commit's whole message for that, the ones commitlint reads
 * included, as commitlint can read only part of a message. Nor may the
 * header or a breaking change's footer, the text the release copies there,
 * hold a link or an image (holdsChangelogLink, from the same file), whose
 * target the link check would read.
 *
 * Nor may any commit hold a character that one reader takes for the end
 * of a line and the release does not (HIDDEN_BREAK, from the same file),
 * which commitlint refuses in the commits it reads, nor the text the
 * release splits git's output at (LOG_SEPARATOR, from the same file).
 * Nor may a commit's author or committer name or email hold either: git
 * writes them in the same output, before the hash and the message, and
 * commitlint never reads them.
 *
 * With `--queue` the range must hold a merge commit, as each run of the
 * queue builds one. The release leaves out merge commits by their
 * parents, so a queue that merged any other way would fail here rather
 * than leave this check reading nothing.
 *
 * A problem names the commit and a pull request's number, but prints
 * nothing else of the message, which is the author's text, into the run's
 * log, where a line can be a workflow command.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { saysBreaking } from "./checkBreaking.ts";
import { gitAt, revertOf, undoes } from "./reverts.ts";

const {
  CHANGELOG_DIRECTIVE,
  HIDDEN_BREAK,
  LOG_SEPARATOR,
  SKIP_KEYWORD,
  holdsChangelogLink,
  skippedByCommitlint,
} = (await import(new URL("../commitlint.config.mjs", import.meta.url).href)) as {
  CHANGELOG_DIRECTIVE: RegExp;
  HIDDEN_BREAK: RegExp;
  LOG_SEPARATOR: RegExp;
  SKIP_KEYWORD: RegExp;
  holdsChangelogLink(message: string): boolean;
  skippedByCommitlint(message: string): boolean;
};

/** What is wrong with a merge commit's message, if anything. */
function problemsOfMerge(message: string): string[] {
  const problems: string[] = [];
  if (SKIP_KEYWORD.test(message)) problems.push("holds a keyword that makes GitHub skip CI");
  if (saysBreaking(message))
    problems.push("holds a line that starts as a breaking change's footer");
  return problems;
}

/** What is wrong with the message of a commit with one parent, if anything. */
function problemsOfCommit(message: string): string[] {
  return skippedByCommitlint(message) && saysBreaking(message)
    ? ["says it breaks, and commitlint skips it"]
    : [];
}

/** What is wrong with a commit's message, if anything. */
export function problemsOf(message: string, merge: boolean): string[] {
  const problems = merge ? problemsOfMerge(message) : problemsOfCommit(message);
  if (CHANGELOG_DIRECTIVE.test(message))
    problems.push("holds an HTML comment or a spell checker's directive");
  if (holdsChangelogLink(message))
    problems.push("holds a link or an image in its header or a breaking change's footer");
  if (HIDDEN_BREAK.test(message))
    problems.push("holds a control character or a line separator other than a line feed");
  if (LOG_SEPARATOR.test(message))
    problems.push("holds the text the release splits git's output at");
  return problems;
}

/** What is wrong with a commit's author and committer names and emails, if anything. */
function problemsOfIdentity(identity: readonly string[]): string[] {
  const problems: string[] = [];
  if (identity.some((part) => HIDDEN_BREAK.test(part)))
    problems.push("has an author or committer whose name or email holds a control character");
  if (identity.some((part) => LOG_SEPARATOR.test(part)))
    problems.push(
      "has an author or committer whose name or email holds the text the release splits git's output at",
    );
  return problems;
}

/** A commit between the two refs. */
export interface RangeCommit {
  hash: string;
  /** Whether it has more than one parent. */
  merge: boolean;
}

/** What the check reads. */
export interface MergesIo {
  /** The commits from `base` (not included) to `head`. */
  commitsBetween(base: string, head: string): RangeCommit[];
  /** A commit's whole message. */
  messageOf(hash: string): string;
  /** A commit's author name and email, then its committer's. */
  identityOf(hash: string): string[];
  /** Whether the change of commit `revert` undoes that of the commit `named` names. */
  undoes(revert: string, named: string): boolean;
  log(message: string): void;
}

const USAGE = "Usage: npm run check:merges -- --base <git ref> --head <git ref> [--queue]";

/** A commit's name in the log: its hash, and the pull request a merge commit names. */
function nameOf(hash: string, message: string, merge: boolean): string {
  const number = merge ? /^Merge pull request (#\d+) /.exec(message)?.[1] : undefined;
  return number === undefined ? hash : `${hash} (${number})`;
}

/** Exit code: 0 when no commit between the two holds what the check refuses. */
export function main(argv: readonly string[], io: MergesIo): number {
  try {
    // `node -e` puts the node binary first and drops the `--`.
    const { base, head, queue } = parseArgs({
      args: argv.slice(1),
      options: {
        base: { type: "string" },
        head: { type: "string" },
        queue: { type: "boolean", default: false },
      },
    }).values;
    if (base === undefined || head === undefined) {
      io.log(USAGE);
      return 1;
    }
    const commits = io.commitsBetween(base, head);
    if (queue && !commits.some(({ merge }) => merge)) {
      io.log(
        "The merge queue built no merge commit, so this check and the release's reading of the range no longer hold (docs/releasing.md#what-a-merge-commit-decides).",
      );
      return 1;
    }
    const problems = commits.flatMap(({ hash, merge }) => {
      const message = io.messageOf(hash);
      const found = [...problemsOf(message, merge), ...problemsOfIdentity(io.identityOf(hash))];
      const revert = merge ? undefined : revertOf(message);
      if (revert !== undefined && !io.undoes(hash, revert.hash)) {
        found.push("says it reverts a commit whose change it does not undo");
      }
      return found.map((problem) => `${nameOf(hash, message, merge)} ${problem}.`);
    });
    for (const problem of problems) io.log(problem);
    if (problems.length > 0) {
      io.log(
        "A merge commit's message holds the pull request's title: change the title, then add the pull request to the queue again. A change that breaks says so in a commit commitlint reads, a revert is made with git revert, a commit whose author or committer is refused is made again under another name or email, and any other commit refused here is reworded (docs/releasing.md#what-a-merge-commit-decides).",
      );
      return 1;
    }
    io.log(`Read ${commits.length} commit(s), and none holds what the check refuses.`);
    return 0;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

/** The io of the repository at `repo`. */
export function defaultIo(repo: string): MergesIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  return {
    undoes: (revert, named) => undoes(gitAt(repo), revert, named),
    // Each line is a commit's hash, then its parents'.
    commitsBetween: (base, head) =>
      git("rev-list", "--parents", "--end-of-options", `${base}..${head}`)
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => {
          const [hash, ...parents] = line.split(" ");
          return { hash: hash!, merge: parents.length > 1 };
        }),
    // One commit at a time: a separator could be written in a message.
    messageOf: (hash) => git("log", "-1", "--format=%B", "--end-of-options", hash),
    // Split at NUL, which git never lets a name or an email hold.
    identityOf: (hash) =>
      git("log", "-1", "--format=%an%x00%ae%x00%cn%x00%ce", "--end-of-options", hash)
        .replace(/\n$/, "")
        .split("\0"),
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/checkMergeMessages.ts').then((m) => m.run(process))" -- --base <ref> --head <ref> [--queue]`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
