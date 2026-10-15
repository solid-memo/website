# Releasing

How Solid Memo's versions are chosen, what a version promises, and what
a release does. Versions are released by
[semantic-release](https://semantic-release.gitbook.io/), not by hand:
after CI passes on a push to `main`, it reads the commits since the last
version and, when one of them is releasable, releases the next version.
Only a version is deployed ([deployment.md](deployment.md)): once CI
passes on the release commit, the site runs it, and a push to `main`
that releases nothing waits for the next version. So the site always
runs a version the releases page lists, and
[CHANGELOG.md](../CHANGELOG.md) says what changed since the last one.

## The scheme

The app follows [Semantic Versioning 2.0.0](https://semver.org/):
`MAJOR.MINOR.PATCH`, tagged `vMAJOR.MINOR.PATCH` (`v1.0.0`). The first
version is 1.0.0, and it is stable: the app and its data formats can be
relied on, and a change that breaks them bumps the major version. No
0.x version was released.

Each commit says what kind of change it is, in its
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
type ([CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)), and the
release takes the largest bump among the commits since the last
version:

| Bump | When | Commits | Example |
|---|---|---|---|
| Major (1.4.2 → 2.0.0) | Anything breaking ([below](#what-counts-as-breaking)) | `!` after the type, or a `BREAKING CHANGE:` footer | A deck format 8 the app writes; a configuration variable renamed |
| Minor (1.4.2 → 1.5.0) | A new feature | `feat` | A new screen; a new deck in the library; a new configuration variable |
| Patch (1.4.2 → 1.4.3) | Fixes, and changes nobody has to act on | `fix`, `perf`, `revert` (or GitHub's `Revert "…"`) | A bug fixed; a translation corrected; a dependency the app ships updated |
| None | Nothing users see | `docs`, `test`, `refactor`, `style`, `build`, `ci`, `chore` | A page of the docs; a test; a development tool updated |

A push with only commits of the last kind releases nothing; their
changes go out with the next version that does. The commits made before
Conventional Commits were adopted almost never have a type, and none
has one that releases, so they count for nothing.

The version is the root [`package.json`](../package.json)'s `version`,
which the footer shows beside the commit a build was made from
([Footer.tsx](../packages/ui/src/ui/Footer.tsx),
[configuration.md](configuration.md)). The workspace packages are
private, not published to npm, and stay at `0.0.0`: they are parts of
one app, not libraries with versions of their own
([architecture.md](architecture.md)). Before the first release wrote
1.0.0 into it, the root's version was `0.0.0` too, which names no
version: 0.1.0 was never released, so no build shows it.

## The public API

Semantic Versioning asks a project to say what its versions promise:
its public API. Solid Memo's is what its users, other apps that read
the same pods and the people who run their own copy rely on:

- **The data in pods**: where it lives (the folders, the document names
  and the type index registrations) and the format versions the app
  writes and reads ([data-model.md](data-model.md),
  [migrations.md](migrations.md)).
- **Deck files**, as the app exports and imports them
  ([data-model.md](data-model.md#decks-as-files)).
- **The published addresses**: the vocabulary and the shapes under
  `/ns/`, the vendored shapes under `/vendor/`, and the library under
  `/decks/` ([deployment.md](deployment.md)). A published shape or deck
  version is versioned on its own as well
  ([below](#what-has-versions-of-its-own)).
- **The app's and the Studio's addresses**: the hashes that open a
  screen (`#/decks?instance=…`, `#/studio/…`), which people bookmark
  and share.
- **What the app keeps in the browser**: its storage keys, and the
  IndexedDB database that holds a guest's pod.
- **What those who run their own copy set and run**: the `VITE_*`
  variables ([configuration.md](configuration.md)), the build command
  and the folder it writes ([deployment.md](deployment.md)).
- **The features users rely on.**

Everything else may change in any version: the workspace packages'
exports, which nothing outside the repository imports
([architecture.md](architecture.md)), the screens' layout, wording and
styles, and whatever these docs do not name.

## What counts as breaking

Solid Memo keeps its data in its users' pods, not on a server of its
own, so the data is what has to stay readable: by this app's older and
newer versions, by other apps that read the same pod, and by people who
run their own copy. A change to [the public API](#the-public-api) is
breaking when one of them has to act or loses something:

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
- **An address that stops working**: a published file removed or
  moved, or a hash the app or the Studio no longer opens.
- **What the browser kept, lost**: a storage key or the guest pod's
  database renamed, or what they hold no longer read.
- **A feature removed** that users rely on.

A new vocabulary term that no shape names is not breaking
([vocab.md](vocab.md#versioning-policy)); neither is a new deck in the
library, nor a new version of a deck. A published shape is never
edited, so a term that a shape gains, even an optional one, is in the
shape's next version: a new format version the app writes, and so
breaking. A change that is
breaking says so in its commit, with `!` and a `BREAKING CHANGE:` footer
that tells users what to do, and it is agreed in an issue first
([CONTRIBUTING.md](../CONTRIBUTING.md#open-an-issue-first)).

## How CI holds to it

The public API is written down in [`api/`](../api/README.md), one
promise a line: the formats the app writes and reads, where the data
lives in a pod, the hashes, what the app keeps in the browser, what a
copy of one's own relies on, and, in `api/frozen/`, the published
documents and the vocabulary's terms. Each file is written by a test in
the package whose code it reads, so a change to the code that changes a
promise fails that test until the file is written again
(`npm run test:unit -- <the test> -u`), in the same commit.

`npm run check:breaking -- --base <git ref>`
([checkBreaking.ts](../scripts/checkBreaking.ts)) compares these files
with the ones at the change's base, where it left `<git ref>`. CI's
`library` job runs it on every pull request, in the merge queue and on
every push to `main`, so before any release ([testing.md](testing.md#continuous-integration)):

- **A line gone** fails the check unless a commit since the base says
  the change breaks (`!` and its footer), or says why it does not, in a
  trailer: `Contract-Change: not-breaking <reason>`. Such a reason is
  that the old line still holds: an old hash that still opens its
  screen, a key whose old value is still read.
- **A line of `api/frozen/` gone** fails the check, whatever the
  commits say: a published address keeps answering, a published shape
  is never edited, a term is never taken back.
- **A commit that says it breaks** while no line went is noted, and
  passes: removing a feature changes no file.

A line added is a promise added, and needs nothing. What no file can
hold is left to review: a feature removed, or a reader that keeps its
format but reads less of it.

## What has versions of its own

The app's version is one of several. The data that other apps and
pods rely on is versioned on its own, by its own rules, and none of them
follows the app's number:

| What | Its version | Rules |
|---|---|---|
| The vocabulary | `v1` in its IRI, and `owl:versionInfo` (1.19) in [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) | Terms are only added ([vocab.md](vocab.md#versioning-policy)) |
| The shapes | `ns/shapes/<class>/v<N>.ttl`, one file per format version | A published version is never edited ([shapes.md](shapes.md)) |
| Format versions | `sm:formatVersion` on every subject the app writes | [migrations.md](migrations.md) |
| The library's decks | `decks/<name>/v<N>.ttl` | A published version is never edited ([deck-library.md](deck-library.md#publishing-a-new-version)) |

A new format version the app writes is a breaking change of the app,
and so a major version; a new vocabulary term or a new deck version is
not. The commit's subject names what it adds, so the changelog does
too: "write deck format 8", "add a term to vocabulary 1.20".

## The changelog

[CHANGELOG.md](../CHANGELOG.md) is written by the release: each
version's entry goes under the file's header, newest first, with the
`feat` commits under "Features", the `fix` commits under "Bug Fixes",
and so on, each line a commit's subject with its scope and a link to the
commit. A breaking change is listed first, under "BREAKING CHANGES",
with its footer's text. The commits of the other types are left out.

So the changelog is as good as the commits' subjects. A subject says
what changed for users, other apps or people who run their own copy,
in plain words. Nobody edits an entry by hand: a mistake in one stays,
and the next version's entry can say what it should have said. The
header is release.config.mjs's `changelogTitle`, and the two must stay
the same ([releaseConfig.test.ts](../scripts/releaseConfig.test.ts)
checks it). At the end of the file, a section written by hand sums up
what the first version, 1.0.0, contains, which its generated entry
lists only in part.

## What a release does

[release.yml](../.github/workflows/release.yml) runs when CI has passed
on a push to `main` in this repository, as the deploy does, and runs
semantic-release ([release.config.mjs](../release.config.mjs)) on
`main`'s tip. When `main` has moved on since the commit CI passed on,
it releases the tip if CI has passed on it too, and otherwise leaves it
to the tip's own run, once CI passes there. When there is something to
release, semantic-release:

1. chooses the version from the commits since the last tag
   ([The scheme](#the-scheme)), and writes its notes;
2. writes the notes into CHANGELOG.md;
3. sets the version in the root `package.json` and `package-lock.json`,
   and the version and today's date in [`publiccode.yml`](../publiccode.yml)
   (`softwareVersion`, `releaseDate`) and [`CITATION.cff`](../CITATION.cff)
   (`version`, `date-released`), with `npm run release:version`
   ([releaseVersion.ts](../scripts/releaseVersion.ts));
4. commits those five files to `main` as `chore(release): X.Y.Z`, with
   the notes as the body, and pushes the commit with the deploy key
   ([below](#the-deploy-key));
5. tags that commit `vX.Y.Z` and pushes the tag;
6. makes a GitHub release of the tag, "Solid Memo X.Y.Z", with the
   notes. Zenodo, connected to the repository, archives each GitHub
   release and gives it a DOI. The concept DOI,
   [10.5281/zenodo.23351087](https://doi.org/10.5281/zenodo.23351087),
   always resolves to the latest release, and is the one in
   `CITATION.cff` and the README.

The release commit is not marked to skip CI. CI runs on it, and once
it passes, the deploy builds that commit, the one the tag names, and
puts the new version on the site, its footer included; it deploys no
other commit ([deployment.md](deployment.md)). The release workflow
runs again too, finds no commit since the tag, and releases nothing.
CI's run on a release commit has a concurrency group of its own, so a
newer push to `main` cannot replace it while it waits, and hold back
the deploy ([testing.md](testing.md#continuous-integration)).

Releases go one at a time (concurrency group `release`), and a running
one is never canceled. GitHub keeps only one run waiting in the group,
so a newer one replaces a run already waiting; whichever goes ahead
releases the tip, as above. A fork, or a copy without the deploy key,
runs the workflow and releases nothing.

A release made by mistake is not taken back: a tag is never moved or
deleted once pushed. A mistake is fixed in the next version.

## The deploy key

The ruleset on `main` requires a pull request for every change, merged
through the merge queue ([testing.md](testing.md#the-merge-queue)), so
semantic-release needs a way past it to push the release commit. The
workflow's own token could be let past it too, but a push made with
that token starts no workflow, so CI and the deploy would never run on
the release commit, and since only a release commit is deployed, the
site would never get a new version. The release pushes with a deploy
key instead: an SSH key with write access to this repository alone,
which GitHub lets a ruleset's bypass list name, and whose pushes start
workflows as anyone's do. Only the release workflow can use it.

The maintainer sets it up once, before the workflow first runs on
`main`, so that the merge that adds it releases 1.0.0 straight away:

1. Make a key pair with no passphrase, outside the repository:

   ```sh
   ssh-keygen -t ed25519 -N "" -C "solid-memo release" -f release-key
   ```

2. Add `release-key.pub` as a deploy key of the repository, with write
   access (Settings › Deploy keys › Add deploy key, "Allow write
   access").
3. Add the private key, `release-key`, as the repository secret
   `SEMANTIC_RELEASE_KEY` (Settings › Secrets and variables › Actions).
   Then delete both files.
4. Add "Deploy keys" to the bypass list of the ruleset on `main`
   (Settings › Rules), so that the release commit needs no pull request.
5. Add a ruleset for tags matching `refs/tags/v*` that restricts their
   creation, update and deletion (Settings › Rules › Rulesets › New
   ruleset › New tag ruleset: enforcement Active, target `v*`), with "Deploy keys" and the Repository
   admin role on its bypass list. The deploy deploys the commit a
   version tag names, so without it anyone with write access could tag
   a commit and have it deployed; the admin's bypass is for tagging by
   hand ([below](#when-a-release-fails)).

Without the secret, the workflow says so and releases nothing; once
it is set, run the workflow by hand ([below](#when-a-release-fails)) to
release what is waiting. To
change the key, add the new one as a deploy key, replace the secret,
then delete the old deploy key.

## When a release fails

The workflow's run says which step failed and why, and nothing opens
an issue or comments on one. Fix the cause, then run the workflow by
hand (Actions › Release › Run workflow, from `main`): it releases
`main`'s tip once CI has passed on it, and refuses before that. The
next push to `main` that passes CI also tries again.

- **Before the push** (a wrong configuration, a file the release could
  not write): nothing was pushed, and the next run releases as if
  nothing had happened.
- **The push was refused**: `main` moved on while the release ran, or
  the deploy key or the bypass is missing. Nothing was tagged; the next
  run releases from the new tip.
- **The release commit is on `main`, but not its tag** (the tag's push
  failed): semantic-release, finding no tag, would release the same
  version again on top of it, so every run of the workflow stops before
  it, with an error that names the commit, until the commit is tagged.
  Tag it by hand, then make its GitHub release as below:

  ```sh
  git switch main && git pull
  git tag vX.Y.Z <release-commit>
  git push origin vX.Y.Z
  ```

  The deploy after CI on the release commit found no tag, so it
  deployed nothing: run it by hand (Actions › Deploy to GitHub Pages ›
  Run workflow, from `main`), and it deploys the version just tagged
  ([deployment.md](deployment.md)).

- **CI failed on the release commit** (a flaky test, say): the version
  is released but not deployed. Re-run CI's failed jobs on that commit;
  once it passes, the deploy follows as usual. Or run the deploy by
  hand, which checks the version itself.

- **After the tag** (the GitHub release could not be made): the release
  commit and the tag are on `main`, so a new run finds nothing to
  release. Make the GitHub release from the tag by hand, with the
  version's entry in CHANGELOG.md as its notes:

  ```sh
  gh release create vX.Y.Z --title "Solid Memo X.Y.Z" --notes-file notes.md
  ```

A tag is never moved or deleted, even one whose release went wrong:
Zenodo and anyone who fetched it may already hold it.
