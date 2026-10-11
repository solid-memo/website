# Releasing

How Solid Memo's versions are numbered, what a version promises, and
how the maintainer tags one. Every push to `main` that passes CI is
deployed ([deployment.md](deployment.md)), so a version does not ship
anything new: it names a commit that is already live, and says in
[CHANGELOG.md](../CHANGELOG.md) what changed since the last one.

## The scheme

The app follows [Semantic Versioning 2.0.0](https://semver.org/):
`MAJOR.MINOR.PATCH`, tagged `vMAJOR.MINOR.PATCH` (`v0.1.0`). It is in
beta, so the major version is 0, and SemVer's rule for 0.x applies:
anything may change. Within 0.x the project still keeps a promise:

| Bump | When | Example |
|---|---|---|
| Minor (0.1.0 → 0.2.0) | Anything breaking ([below](#what-counts-as-breaking)), or a new feature | A deck format 7; a new screen; a new configuration variable |
| Patch (0.1.0 → 0.1.1) | Fixes, and changes nobody has to act on | A bug fixed; a translation corrected; a dependency updated |

Version 1.0.0 will say that the app and its data formats are stable
enough to be relied on; the maintainer decides when. From then on a
breaking change bumps the major version.

The version is the root [`package.json`](../package.json)'s `version`.
The workspace packages are private, not published to npm, and stay at
`0.0.0`: they are parts of one app, not libraries with versions of their
own ([architecture.md](architecture.md)). The footer shows the commit a
build was made from ([Footer.tsx](../packages/ui/src/ui/Footer.tsx)).

## What counts as breaking

Solid Memo keeps its data in its users' pods, not on a server of its
own, so the data is what has to stay readable: by this app's older and
newer versions, by other apps that read the same pod, and by people who
run their own copy. A change is breaking when one of them has to act or
loses something:

- **A new format version the app writes** ([migrations.md](migrations.md)).
  The app brings older data up to it, but an older version of the app
  then refuses to save over what the newer one wrote
  (`writtenByNewerApp`, [data-model.md](data-model.md)), and an older
  app refuses a deck file in the newer format (`deckFileTooNew`).
- **Data the app stops reading**: dropping the migration from an older
  format, so a pod that was never updated can no longer be opened.
- **A move of the data in the pod**: another folder, another type index
  registration, other document names ([data-model.md](data-model.md)).
- **A change for those who run their own copy**: a configuration variable
  renamed or removed, a changed build command or output folder
  ([deployment.md](deployment.md)).
- **A feature removed** that users rely on.

Adding an optional term that older readers ignore and lose nothing by
is not breaking ([vocab.md](vocab.md#versioning-policy)); neither is a
new deck in the library, nor a new version of a deck.

## What has versions of its own

The app's version is one of several. The data that other apps and
pods rely on is versioned on its own, by its own rules, and none of them
follows the app's number:

| What | Its version | Rules |
|---|---|---|
| The vocabulary | `v1` in its IRI, and `owl:versionInfo` (1.18) in [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) | Terms are only added ([vocab.md](vocab.md#versioning-policy)) |
| The shapes | `ns/shapes/<class>/v<N>.ttl`, one file per format version | A published version is never edited ([shapes.md](shapes.md)) |
| Format versions | `sm:formatVersion` on every subject the app writes | [migrations.md](migrations.md) |
| The library's decks | `decks/<name>/v<N>.ttl` | A published version is never edited ([deck-library.md](deck-library.md#publishing-a-new-version)) |

An app version's changelog says which of these it added: "Writes deck
format 7", "Vocabulary 1.19".

## The changelog

[CHANGELOG.md](../CHANGELOG.md) follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). A pull
request that changes what users, other apps or people who run their own
copy see adds a line under `## [Unreleased]`, in one of the groups
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` and `Security`. A
line says what changed for them, in plain words, and links the docs
page or the issue. A breaking change starts with **Breaking:**.
Dependency updates, refactors and test changes are left out, unless
users notice them.

## Tagging a version

The maintainer tags versions by hand; nothing tags them automatically.

1. Check that CI passed on the commit of `main` to release.
2. In CHANGELOG.md, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   add an empty `## [Unreleased]` above it, and update the links at the
   bottom of the file.
3. Set the version in the root `package.json` (and the root entry of
   `package-lock.json`, with `npm install --package-lock-only`), and the
   version and date in [`CITATION.cff`](../CITATION.cff) (`version`,
   `date-released`) and [`publiccode.yml`](../publiccode.yml)
   (`softwareVersion`, `releaseDate`).
4. Commit that as `Release X.Y.Z`, through a pull request like any other
   change, and let CI pass.
5. Tag the merged commit and push the tag:

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m "Solid Memo X.Y.Z"
   git push origin vX.Y.Z
   ```

6. Make a GitHub release from the tag, with the version's changelog
   section as its notes:

   ```sh
   gh release create vX.Y.Z --title "Solid Memo X.Y.Z" --notes "…"
   ```

A tag is never moved or deleted once pushed. A mistake is fixed in the
next patch version.
