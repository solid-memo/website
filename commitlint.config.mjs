// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * commitlint's rules for commit messages (CONTRIBUTING.md#commit-messages):
 * Conventional Commits 1.0.0, as @commitlint/config-conventional checks
 * them, which semantic-release reads to choose each version
 * (docs/releasing.md). CI's commits job lints a pull request's commits,
 * and `npm run lint:commits` a branch's, since it left main.
 *
 * The defaults stand, the length of the body's and footer's lines aside:
 * a body is wrapped near 72 columns by hand (docs/style.md#commits), but
 * a URL, a command or Renovate's list of updates (commitBody in
 * renovate.json5), one update a line with its release notes' address,
 * runs as long as it needs. The subject's first word is lowercase
 * ("add", "keep"), the default; a name may follow it in its own case.
 *
 * A breaking change says so twice (docs/releasing.md#what-counts-as-breaking):
 * `!` after its type or scope, and a `BREAKING CHANGE:` footer that
 * tells users what to do. Either one without the other is refused.
 *
 * Every commit records its decision and links its discussion (criterion
 * 6 of the Standard for Public Code, docs/standard-for-public-code.md):
 * it has a body that says why, and names an issue, a pull request or a
 * discussion by its number anywhere in the message (`Closes: #72`,
 * `Fixes #69`, `Refs: #68`). A Renovate update cannot name its pull
 * request, which has no number when the commit is written; its body
 * ends with the line that RENOVATE_WHY starts (commitBody in renovate.json5)
 * instead, and its merge commit names the pull request. Every other rule
 * still holds for it, so the release reads its header.
 */

/** The start of the line commitBody in renovate.json5 ends each Renovate commit with. */
export const RENOVATE_WHY = "Why: renovate.json5 keeps every dependency current";

/**
 * The parser reads Renovate's `Why:` line as a footer, so the whole
 * message is searched.
 *
 * @param {{ references: unknown[], raw: string }} commit
 */
function referencesOrRenovate({ references, raw }) {
  const renovate = raw.split("\n").some((line) => line.startsWith(RENOVATE_WHY));
  return [
    references.length > 0 || renovate,
    "the message must name its issue, pull request or discussion, such as `Closes: #42` (CONTRIBUTING.md#commit-messages)",
  ];
}

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "references-or-renovate": referencesOrRenovate } }],
  rules: {
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "breaking-change-exclamation-mark": [2, "always"],
    "body-empty": [2, "never"],
    "references-or-renovate": [2, "always"],
  },
};
