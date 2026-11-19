// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * semantic-release's settings (docs/releasing.md): after CI passes on a
 * push to main, .github/workflows/release.yml runs it on main's tip, in
 * a job that holds no key and no token that can write. It reads the
 * commits since the last tag, written as Conventional Commits
 * (CONTRIBUTING.md#commit-messages), merge commits aside, and when one
 * of them is releasable it chooses the next version from their types,
 * writes it into the files that name it, commits them and tags the
 * commit vX.Y.Z. It pushes both to a bare copy of the checkout, which
 * git's url.<copy>.insteadOf puts in place of GitHub's URL, so the
 * notes still link to GitHub (docs/releasing.md#the-deploy-key).
 *
 * The workflow's push job checks the commit and pushes it and its tag
 * to main with the deploy key; its publish job makes the GitHub
 * release, from which Zenodo mints a DOI, with the version's
 * changelog entry as its notes and the version's docs as pages in an
 * archive (scripts/docsArchive.ts,
 * docs/deployment.md#a-releases-docs-as-an-archive), for whoever wants a
 * release's docs as it had them. So no plugin here makes the GitHub
 * release.
 *
 * The release commit is not marked [skip ci]: CI runs on it, and the
 * deploy that follows, which deploys only a commit a version tag names,
 * ships the site that run carries, the build CI tested, with the
 * version from the commit's package.json put in its pages. The release
 * workflow does not run on a release commit: there is nothing since the
 * tag to release.
 *
 * Its message is the subject alone, with no body. The notes are written
 * from the subjects of the commits released, as they are, and GitHub
 * skips CI on a push whose message holds one of its skip keywords
 * anywhere, so notes in the body could stop CI, and with it the deploy,
 * on the release commit. CHANGELOG.md and the GitHub release carry the
 * notes; commitlint refuses the keywords in a commit too
 * (commitlint.config.mjs).
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
 *
 * And no fields: the parser's own fieldPattern reads a line such as
 * `-notes-` as the name of a field and puts the lines after it in that
 * field, so a body could stop every release, or change the version
 * chosen. commitlint reads such a line as text, as `fieldPattern: null`
 * makes the release read it too, so both read a message one way.
 */
export const parserOpts = {
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
  notesPattern: (keywords) => new RegExp(`^(${keywords}):\\s*(.*)`),
  issuePrefixes: [/#(?=\d+\b)/],
  fieldPattern: null,
};

/**
 * The notes' sections, in this order, and the types each one lists: the
 * preset's own, but for `fix`, which it heads "Bug Fixes". The list
 * replaces the preset's whole: a type it leaves out, such as docs: or
 * ci:, is left out of the notes, as the preset hides those too. The
 * version chosen does not depend on it.
 */
export const presetConfig = {
  types: [
    { type: "feat", section: "Features" },
    { type: "feature", section: "Features" },
    { type: "fix", section: "Fixes" },
    { type: "perf", section: "Performance Improvements" },
    { type: "revert", section: "Reverts" },
  ],
};

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    // The commit analyzer and the release-notes generator, given every
    // commit but the merge commits, whose messages hold a pull request's
    // title (scripts/releaseWithoutMerges.ts). Its own commits decide.
    //
    // feat: a minor version, fix:, perf: and revert: a patch, a breaking
    // change (`!` or a BREAKING CHANGE: footer) a major one; the other
    // types release nothing. The preset counts a revert only by the
    // "This reverts commit <sha>." line that git revert writes, so the
    // first rule makes a revert: commit without it release too. The
    // analyzer reads the preset's own rules only when none of these
    // matches, and takes the largest of those that do, so the second
    // keeps a revert: commit that says it breaks a major one, as npm
    // run check:breaking counts it.
    //
    // The plugins leave out a commit that such a line names, and the
    // revert with it, but read only the message: the wrapper lets a
    // revert name a commit only when its change undoes that commit's
    // (scripts/reverts.ts), so a message alone cannot take a breaking
    // change out of the release. npm run check:breaking reads the
    // commits the same way, from its base and from the last release tag.
    [
      "./scripts/releaseWithoutMerges.ts",
      {
        preset: "conventionalcommits",
        parserOpts,
        presetConfig,
        releaseRules: [
          { type: "revert", release: "patch" },
          { type: "revert", breaking: true, release: "major" },
        ],
      },
    ],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md", changelogTitle }],
    // The root package.json's version, and package-lock.json's: the
    // deploy puts it in the site's pages, which the footer reads it from
    // (scripts/siteVersion.ts). The
    // workspace is private, and nothing is published to npm.
    ["@semantic-release/npm", { npmPublish: false }],
    // publiccode.yml's and CITATION.cff's version and date; then the
    // version's docs, as an archive the GitHub release carries, with the
    // drawings release.yml's prepare job made in Chromium before
    // semantic-release ran: --drawn takes them from the drawings' cache
    // and starts no browser. A failure here stops the release before
    // anything is committed.
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "npm run release:version -- ${nextRelease.version} && npm run docs:archive -- ${nextRelease.version} --drawn",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets,
        message: "chore(release): ${nextRelease.version}",
      },
    ],
  ],
};
