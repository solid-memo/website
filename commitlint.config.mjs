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
 *
 * A security fix is made in private (SECURITY.md) before any public
 * issue may describe what it fixes, so it names its GitHub security
 * advisory instead (`Refs: GHSA-xxxx-xxxx-xxxx`), which is published
 * once the fix is deployed.
 *
 * A `chore(release)` header is semantic-release's alone, on the release
 * commit it pushes onto main (docs/releasing.md#what-a-release-does), so
 * a commit of a pull request or a branch may not have it. commitlint
 * would skip a header such as `chore(release): 1.2.3` unlinted, as one of
 * its default ignores takes a version for a release's, so its other
 * defaults are kept but that one.
 */

/** The start of the line commitBody in renovate.json5 ends each Renovate commit with. */
export const RENOVATE_WHY = "Why: renovate.json5 keeps every dependency current";

/**
 * A GitHub security advisory's id: `GHSA-` and three groups of four
 * characters from the alphabet GitHub draws them from.
 */
export const ADVISORY = /\bGHSA(?:-[23456789cfghjmpqrvwx]{4}){3}\b/;

/**
 * The parser reads Renovate's `Why:` line as a footer, and knows no
 * advisory id, so the whole message is searched.
 *
 * @param {{ references: unknown[], raw: string }} commit
 */
function referencesOrRenovate({ references, raw }) {
  const renovate = raw.split("\n").some((line) => line.startsWith(RENOVATE_WHY));
  return [
    references.length > 0 || renovate || ADVISORY.test(raw),
    "the message must name its issue, pull request or discussion, such as `Closes: #42`, or a security fix its advisory, such as `Refs: GHSA-xxxx-xxxx-xxxx` (CONTRIBUTING.md#commit-messages)",
  ];
}

/**
 * The header semantic-release titles its release commit with
 * (release.config.mjs), in any case and with or without a `!`.
 *
 * @param {{ header: string | null }} commit
 */
function notARelease({ header }) {
  return [
    !/^chore\(release\)/i.test(header ?? ""),
    "the header `chore(release)` is semantic-release's, for the release commit it makes on main: use another type or scope (CONTRIBUTING.md#commit-messages)",
  ];
}

/**
 * commitlint's default ignores (@commitlint/is-ignored), but a header
 * that is a version: merges, which CI and `npm run lint:commits` refuse
 * on their own, reverts, reapplies, and fixups. They are matched against
 * the header alone, so a line of the body cannot make a commit skip
 * every rule.
 */
const IGNORED = [
  /^((Merge pull request)|(Merge (.*?) into (.*?)|(Merge branch (.*?)))$)/,
  /^(Merge tag (.*?))$/,
  /^(R|r)evert (.*)/,
  /^(R|r)eapply (.*)/,
  /^(amend|fixup|squash)!/,
  /^(Merged (.*?)(in|into) (.*)|Merged PR (.*): (.*))/,
  /^Merge remote-tracking branch(\s*)(.*)/,
  /^Automatic merge(.*)/,
  /^Auto-merged (.*?) into (.*)/,
];

export default {
  defaultIgnores: false,
  ignores: [
    (/** @type {string} */ message) => {
      const header = message.split(/\r?\n/, 1)[0];
      return IGNORED.some((pattern) => pattern.test(header));
    },
  ],
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "references-or-renovate": referencesOrRenovate,
        "not-a-release": notARelease,
      },
    },
  ],
  rules: {
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "breaking-change-exclamation-mark": [2, "always"],
    "body-empty": [2, "never"],
    "references-or-renovate": [2, "always"],
    "not-a-release": [2, "always"],
  },
};
