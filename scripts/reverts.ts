// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Which commits really take another back (docs/releasing.md#reverts).
 *
 * The release's commit analyzer and release-notes generator leave out a
 * commit that a later one says it reverts, and the revert with it. They
 * read only the message: the preset's revert pattern, a header such as
 * `Revert "<header>"` and a line `This reverts commit <hash>.`. A revert
 * counts here only when its change undoes the commit it names, by the
 * verbatim patch ids of the two changes (whitespace counts), so a
 * message alone cannot take a commit, such as one that breaks, out of
 * the release. Patch ids leave out line numbers, so a change that puts
 * the same lines back at another place, with the same context, also
 * counts as undoing the commit; check:breaking's comparison of api/
 * still finds a line of api/ that is gone.
 *
 * releaseWithoutMerges.ts hands the plugins every other revert with its
 * hash taken out of that line, so they still read it as a revert, which
 * releases a patch, but match it to no commit. checkBreaking.ts reads the
 * range as the release then does, and checkMergeMessages.ts refuses a
 * revert whose change does not undo the commit it names.
 */
import { execFileSync } from "node:child_process";

/** A commit: its hash, and its whole message. */
export type Commit = { hash: string; message: string };

/** git in a repository: its output, given the arguments and what it reads. */
export type Git = (args: readonly string[], input?: string) => string;

/** git in the repository at `repo`. Its errors are thrown, not printed. */
export function gitAt(repo: string): Git {
  return (args, input) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      input,
      stdio: "pipe",
      maxBuffer: 1 << 28,
    });
}

/**
 * conventional-changelog-conventionalcommits's revertPattern, which the
 * release's parser applies to a commit's whole message: the header the
 * revert names, then the hash.
 */
const REVERT_PATTERN = /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i;

/** The commit a message says it reverts, as the release reads it. */
export function revertOf(message: string): { header: string; hash: string } | undefined {
  const match = REVERT_PATTERN.exec(message);
  return match === null ? undefined : { header: match[1]!.trim(), hash: match[2]! };
}

/** The tree a commit's change starts from; undefined for a merge commit. */
function parentOf(git: Git, commit: string): string | undefined {
  const [, ...parents] = git(["rev-list", "--parents", "-n", "1", "--end-of-options", commit])
    .trim()
    .split(" ");
  if (parents.length > 1) return undefined;
  // A root commit starts from the empty tree.
  return parents[0] ?? git(["hash-object", "-t", "tree", "--stdin"], "").trim();
}

/**
 * The patch id of the change from one commit's tree to another's; "" for
 * no change. Verbatim: whitespace counts, as it does in the code, so a
 * change that differs from another only in its spaces is not the same.
 */
function patchId(git: Git, from: string, to: string): string {
  const diff = git(["diff-tree", "-p", "--binary", "--no-commit-id", from, to]);
  return git(["patch-id", "--verbatim"], diff).split(" ")[0]!;
}

/** Whether the change of `revert` is the change of `named` undone. */
export function undoes(git: Git, revert: string, named: string): boolean {
  try {
    const revertParent = parentOf(git, revert);
    const namedParent = parentOf(git, named);
    if (revertParent === undefined || namedParent === undefined) return false;
    const id = patchId(git, revertParent, revert);
    return id !== "" && id === patchId(git, named, namedParent);
  } catch {
    // A commit git cannot find is one no change undoes.
    return false;
  }
}

/**
 * The reverts among the commits that the release may match to the commit
 * they name: that commit is among them, by its whole hash and its header,
 * as the release matches it, and the revert's change undoes it. By the
 * revert's hash, the named commit's.
 */
function trueReverts(commits: readonly Commit[], git: Git): Map<string, string> {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const reverts = new Map<string, string>();
  for (const { hash, message } of commits) {
    const revert = revertOf(message);
    if (revert === undefined) continue;
    const named = byHash.get(revert.hash);
    if (named === undefined || headerOf(named.message) !== revert.header) continue;
    if (undoes(git, hash, named.hash)) reverts.set(hash, named.hash);
  }
  return reverts;
}

function headerOf(message: string): string {
  return message.trim().split(/\r?\n/)[0]!.trim();
}

/**
 * The commits, each revert whose change does not undo the commit it
 * names given with no hash in its `This reverts commit` line: the
 * release still reads it as a revert, but leaves no commit out for it.
 */
export function withRevertsChecked<C extends Commit>(commits: readonly C[], git: Git): C[] {
  const reverts = trueReverts(commits, git);
  return commits.map((commit) => {
    if (reverts.has(commit.hash) || revertOf(commit.message) === undefined) return commit;
    const message = commit.message.replace(
      REVERT_PATTERN,
      (line: string, _: string, hash: string) => `${line.slice(0, line.length - hash.length - 1)}.`,
    );
    return { ...commit, message };
  });
}

/**
 * The commits the release reads, newest first, as it chooses the version
 * and writes the notes: each one a later revert undoes left out, and the
 * revert with it, as the plugins' filter does (conventional-commits-filter).
 * A revert that is itself reverted takes nothing back.
 */
export function asReleased<C extends Commit>(commits: readonly C[], git: Git): C[] {
  const reverts = trueReverts(commits, git);
  const waiting = new Map<string, string>();
  const gone = new Set<string>();
  for (const { hash } of commits) {
    const revert = waiting.get(hash);
    if (revert !== undefined) {
      waiting.delete(hash);
      gone.add(hash).add(revert);
      continue;
    }
    const named = reverts.get(hash);
    if (named !== undefined && !waiting.has(named)) waiting.set(named, hash);
  }
  return commits.filter(({ hash }) => !gone.has(hash));
}
