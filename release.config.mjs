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
 * The GitHub release carries the version's docs, as pages in an archive
 * (scripts/docsArchive.ts, docs/deployment.md#a-releases-docs-as-an-archive),
 * for whoever wants a release's docs as it had them.
 *
 * The release commit is not marked [skip ci]: CI runs on it, and the
 * deploy that follows, which deploys only a commit a version tag names,
 * ships the site that run carries, the build CI tested, with the
 * version from the commit's package.json put in its pages. The release
 * workflow does not run on a release commit: there is nothing since the
 * tag to release.
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

/**
 * The archive of the version's docs, which prepareCmd writes with
 * `npm run docs:archive` (scripts/docsArchive.ts's archivePath), and the
 * GitHub release carries. A glob, as the plugin does not fill in the
 * version in a path; the release job's checkout holds no other archive.
 */
export const docsArchive = {
  path: "release-assets/docs-*.tar.gz",
  label: "Documentation ${nextRelease.version} (HTML)",
};

/**
 * How the commit analyzer and the release-notes generator find a
 * breaking change's footer: `BREAKING CHANGE:` or `BREAKING-CHANGE:` at
 * the start of a line, in capitals and with its colon, as commitlint
 * asks for it and `npm run check:breaking` reads it (saysBreaking in
 * scripts/checkBreaking.ts). The parser's own pattern ignores case and
 * needs no colon, so a line of a body that began "breaking change of the
 * app" released 2.0.0, which breaks nothing (#84). `!` after the type
 * is read by the preset, as before.
 *
 * And how they find an issue a commit refers to: `#` and a number. The
 * parser's own prefix, `#`, takes any word after it, so the notes of
 * 5.0.0 and 5.2.0 say they close #rrggbb, #9ba6b2 and #aab4bf, colors
 * their commits' bodies named. The parser takes a RegExp's source as a
 * prefix, and reads the word after it as the issue.
 */
export const parserOpts = {
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
  notesPattern: (keywords) => new RegExp(`^(${keywords}):\\s*(.*)`),
  issuePrefixes: [/#(?=\d+\b)/],
};

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
      {
        preset: "conventionalcommits",
        parserOpts,
        releaseRules: [{ type: "revert", release: "patch" }],
      },
    ],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits", parserOpts }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md", changelogTitle }],
    // The root package.json's version, and package-lock.json's: the
    // deploy puts it in the site's pages, which the footer reads it from
    // (scripts/siteVersion.ts). The
    // workspace is private, and nothing is published to npm.
    ["@semantic-release/npm", { npmPublish: false }],
    // publiccode.yml's and CITATION.cff's version and date; then the
    // version's docs, drawn in Chromium, as an archive the GitHub release
    // carries. A failure here stops the release before anything is
    // pushed.
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "npm run release:version -- ${nextRelease.version} && npm run docs:archive -- ${nextRelease.version}",
      },
    ],
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
    // With an asset, the plugin makes the release as a draft, uploads the
    // asset, and only then publishes it, so the deploy, which refuses a
    // draft, never finds the release without its docs.
    [
      "@semantic-release/github",
      {
        assets: [docsArchive],
        releaseNameTemplate: "Solid Memo ${nextRelease.version}",
        successCommentCondition: false,
        failCommentCondition: false,
      },
    ],
  ],
};
