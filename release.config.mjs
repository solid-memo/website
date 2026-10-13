// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * semantic-release's settings (docs/releasing.md): after CI passes on a
 * push to main, .github/workflows/release.yml runs it on main's tip. It
 * reads the commits since the last tag, written as Conventional Commits
 * (CONTRIBUTING.md#commit-messages), and when one of them is releasable
 * it chooses the next version from their types, writes it into the
 * files that name it, commits them to main, tags the commit vX.Y.Z and
 * makes a GitHub release of it, from which Zenodo mints a DOI.
 *
 * The release commit is not marked [skip ci]: CI runs on it, and the
 * deploy that follows, which deploys only a commit a version tag names,
 * builds the site and the footer's version from it. Run again on
 * its own commit, semantic-release finds nothing since the tag, and
 * releases nothing.
 */

/**
 * CHANGELOG.md's header, which the changelog plugin keeps at the top
 * and writes each version's notes under, newest first. The file must
 * start with exactly this (scripts/releaseConfig.test.ts checks it):
 * a header that drifted would have the notes written above it. The
 * notes are written by the tools, from commit subjects, so markdownlint
 * and cspell skip them, up to the first version's summary at the
 * bottom, which turns both back on.
 */
export const changelogTitle = `# Changelog

What changed in Solid Memo from one version to the next, newest first.
Each version's entry is written by semantic-release when it releases
the version, from the messages of the commits it contains, which follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
The versions follow [Semantic Versioning](https://semver.org/), as
[docs/releasing.md](docs/releasing.md) applies it to an app that keeps
its data in pods. The first version, 1.0.0, is summed up in full at the
end of the file.

This file covers the app. The vocabulary, the shapes and the library's
decks are versioned on their own, each version published once and never
changed: see [docs/vocab.md](docs/vocab.md),
[docs/shapes.md](docs/shapes.md) and
[docs/deck-library.md](docs/deck-library.md).

<!-- The entries from here to the first version's summary are written by semantic-release. -->
<!-- Their lists start with "*"; the summary's, as everywhere else, with "-". -->
<!-- markdownlint-configure-file { "MD004": { "style": "dash" } } -->
<!-- markdownlint-disable -->
<!-- cspell:disable -->`;

/** The files a release commits: each names the version, or lists it. */
export const assets = [
  "package.json",
  "package-lock.json",
  "CHANGELOG.md",
  "publiccode.yml",
  "CITATION.cff",
];

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    // feat: a minor version, fix:, perf: and revert: a patch, a breaking
    // change (`!` or a BREAKING CHANGE: footer) a major one; the other
    // types release nothing. The preset counts a revert only by the
    // "This reverts commit <sha>." line that git revert writes, so the
    // rule makes a revert: commit without it release too.
    [
      "@semantic-release/commit-analyzer",
      { preset: "conventionalcommits", releaseRules: [{ type: "revert", release: "patch" }] },
    ],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md", changelogTitle }],
    // The root package.json's version, and package-lock.json's: the
    // footer reads it (packages/vocab/tooling/siteBuild.ts). The
    // workspace is private, and nothing is published to npm.
    ["@semantic-release/npm", { npmPublish: false }],
    // publiccode.yml's and CITATION.cff's version and date.
    ["@semantic-release/exec", { prepareCmd: "npm run release:version -- ${nextRelease.version}" }],
    [
      "@semantic-release/git",
      {
        assets,
        message: "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}",
      },
    ],
    // No comments on the issues and pull requests a release includes, and
    // no issue opened when a release fails: the workflow's run says so,
    // and the token needs no more than to write the repository's contents.
    [
      "@semantic-release/github",
      {
        releaseNameTemplate: "Solid Memo ${nextRelease.version}",
        successCommentCondition: false,
        failCommentCondition: false,
      },
    ],
  ],
};
