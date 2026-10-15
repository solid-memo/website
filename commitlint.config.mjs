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
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "breaking-change-exclamation-mark": [2, "always"],
  },
};
