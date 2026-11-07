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
 * A merge commit is told by its parents, whatever its message says, so
 * this does not rest on the wording GitHub gives it. The parser's
 * `mergePattern` would not do: it makes the line after a merge's subject
 * the commit's header, so a title could choose the version that way.
 *
 * A default export, as semantic-release takes the plugin by its path
 * (scripts/releaseWithoutMerges.test.ts loads it the same way).
 */
import { execFileSync } from "node:child_process";

type Context = { commits: readonly { hash: string }[]; cwd: string };

/** The context with the merge commits left out. A hash git cannot read stops the release. */
function withoutMerges<C extends Context>(context: C): C {
  const merges = execFileSync("git", ["rev-list", "--no-walk", "--merges", "--stdin"], {
    cwd: context.cwd,
    input: context.commits.map(({ hash }) => `${hash}\n`).join(""),
    encoding: "utf8",
    // In the error that stops the release, not on the terminal as well.
    stdio: "pipe",
    maxBuffer: 1 << 28,
  }).split("\n");
  return { ...context, commits: context.commits.filter(({ hash }) => !merges.includes(hash)) };
}

// Untyped modules: imported by a name TypeScript does not resolve.
const ANALYZER = "@semantic-release/commit-analyzer";
const NOTES_GENERATOR = "@semantic-release/release-notes-generator";

export default {
  async analyzeCommits(config: unknown, context: Context): Promise<string | null> {
    const { analyzeCommits } = (await import(ANALYZER)) as {
      analyzeCommits(config: unknown, context: unknown): Promise<string | null>;
    };
    return analyzeCommits(config, withoutMerges(context));
  },
  async generateNotes(config: unknown, context: Context): Promise<string> {
    const { generateNotes } = (await import(NOTES_GENERATOR)) as {
      generateNotes(config: unknown, context: unknown): Promise<string>;
    };
    return generateNotes(config, withoutMerges(context));
  },
};
