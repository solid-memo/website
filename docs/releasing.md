# Releasing

How Solid Memo's versions are chosen, what a version promises, and what
a release does. [semantic-release](https://semantic-release.gitbook.io/)
releases each version; nobody releases one by hand. After CI passes on a
push to `main`, and once the merge queue is empty, it reads the commits
since the last version and releases the next one when any of them is
releasable. Only a version is deployed
([deployment.md](deployment.md)): the site runs a release commit once CI
passes on it, and a push to `main` that releases nothing waits for the
next version. [CHANGELOG.md](../CHANGELOG.md) says what each version
changed.

## The scheme

The app follows [Semantic Versioning 2.0.0](https://semver.org/):
`MAJOR.MINOR.PATCH`, tagged `vMAJOR.MINOR.PATCH` (`v1.0.0`). The first
version, 1.0.0, is stable: a change that breaks the app or its data
formats bumps the major version. No 0.x version was released.

Each commit's
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
type says what kind of change it is
([CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)). A release
takes the largest bump among the commits since the last version:

| Bump | When | Commits | Example |
|---|---|---|---|
| Major (1.4.2 → 2.0.0) | Anything breaking ([below](#what-counts-as-breaking)) | `!` after the type, or a `BREAKING CHANGE:` footer, whatever the type, `revert` included | A format the app stops reading; a configuration variable renamed |
| Minor (1.4.2 → 1.5.0) | A new feature | `feat` | A new screen; a new deck in the library; a new configuration variable |
| Patch (1.4.2 → 1.4.3) | Fixes, and changes nobody has to act on | `fix`, `perf`, `revert` unless it says it breaks (or GitHub's `Revert "…"`) | A bug fixed; a translation corrected; a dependency the app ships updated |
| None | Nothing users see | `docs`, `test`, `refactor`, `style`, `build`, `ci`, `chore` | A page of the docs; a test; a development tool updated |

A push with only commits of the last kind releases nothing, and the next
release ships their changes. Commits from before the project adopted
Conventional Commits have no releasing type and count for nothing.

The version is the root [`package.json`](../package.json)'s `version`,
which the footer shows beside the build's commit
([Footer.tsx](../packages/ui/src/ui/Footer.tsx),
[configuration.md](configuration.md)). The workspace packages are
private, unpublished parts of one app and stay at `0.0.0`
([architecture.md](architecture.md)). The root's version was `0.0.0` too
until the first release wrote 1.0.0; no build shows 0.1.0, which was
never released.

## The public API

Solid Memo's public API, what Semantic Versioning has its versions
promise, is what its users, other apps that read the same pods and
those who run their own copy rely on:

- **The data in pods**: where it lives (the folders, the document names
  and the type index registrations) and the format versions the app
  writes and reads ([data-model.md](data-model.md),
  [migrations.md](migrations.md)).
- **Deck files**, as the app exports and imports them
  ([data-model.md](data-model.md#decks-as-files)).
- **The published addresses**: the vocabulary and the shapes under
  `/ns/`, the vendored shapes under `/vendor/`, and the library under
  `/decks/` ([deployment.md](deployment.md)). Published shapes and decks
  have versions of their own
  ([below](#what-has-versions-of-its-own)).
- **The app's and the Studio's addresses**: the hashes that open a
  screen (`#/decks?instance=…`, `#/studio/…`).
- **What the app keeps in the browser**: its storage keys, and the
  IndexedDB database that holds a guest's pod.
- **What those who run their own copy set and run**: the `VITE_*`
  variables ([configuration.md](configuration.md)), the build command
  and the folder it writes.
- **The features users rely on.**

Everything else may change in any version: the workspace packages'
exports, which nothing outside the repository imports
([architecture.md](architecture.md)), the screens' layout, wording and
styles, and whatever these docs don't name. So may the docs the site
serves at `/docs/` (a page renamed, split or merged,
[deployment.md](deployment.md#what-the-artifact-contains)),
`robots.txt`, `sitemap.xml` and a release's docs archive
([deployment.md](deployment.md#a-releases-docs-as-an-archive)).

## What counts as breaking

A change to [the public API](#the-public-api) is breaking when this
app's older or newer versions, another app that reads the same pod, or
someone who runs their own copy has to act or loses something:

- **Data the app stops reading**: dropping the migration from an older
  format, so a pod never updated can no longer be opened.
- **A change for those who run their own copy**: a configuration variable
  renamed or removed, a changed build command or output folder
  ([deployment.md](deployment.md)).
- **An address that stops working**: a file published under `/ns/`,
  `/vendor/` or `/decks/` removed or moved, or a hash the app or the
  Studio no longer opens.
- **What the browser kept, lost**: a storage key or the guest pod's
  database renamed, or what they hold no longer read.
- **A feature removed** that users rely on.

A new prerequisite for building a copy isn't breaking when the build
names it and a setting builds without it: `npm run build` draws the
docs' diagrams in Chromium, and `DOCS_DIAGRAMS=skip` builds without them,
on any machine and in any CI ([configuration.md](configuration.md#docs_diagrams)). The commit that
brings one in names it in its subject, so the release notes say what a
copy now needs.

A new vocabulary term that no shape names isn't breaking
([vocab.md](vocab.md#versioning-policy)), nor is a new deck or deck
version. Some changes are never made, in a breaking version or any
other ([below](#what-never-changes)). A breaking change is agreed in an issue
first ([CONTRIBUTING.md](../CONTRIBUTING.md#open-an-issue-first)) and
says so in its commit, with `!` and a `BREAKING CHANGE:` footer that
tells users what to do.

The release reads the footer only as written: `BREAKING CHANGE:` or
`BREAKING-CHANGE:` at the start of a line, in capitals and with its
colon, as commitlint and `npm run check:breaking` read it
([release.config.mjs](../release.config.mjs)'s `parserOpts`). A body
line that begins "breaking change" in a sentence isn't a footer.
`npm run check:breaking` reads a message with the release's own parser,
the copy the commit analyzer imports, and its options. So it finds a
`!` or a footer where the release does. The parser ends a line only at
a line feed. Another reader could take
some other characters for the end of a line. So commitlint, and
`npm run check:merges` for every commit, refuse a control character
other than a tab or a line feed, a carriage return that isn't right
before a line feed, and a Unicode line or paragraph separator.
semantic-release reads its commits from one `git log`, split at
`==FIELD==` between a commit's fields and `==END==` after its last. A
commit's author and committer name and email are among those fields,
and so is its message, so text in one could read as another field, or
as another commit. So the release's plugin
([releaseWithoutMerges.ts](../scripts/releaseWithoutMerges.ts)) reads
each commit's message from git by its hash, and releases nothing when
what semantic-release read differs from what git holds. commitlint
and `npm run check:merges` refuse both separators in a message too, and
`npm run check:merges` refuses them, and a control character, in every
commit's author and committer name and email, which commitlint never
reads.

The release reads every other line of a body as text too, as commitlint
does. A line such as `-notes-` used to name a field to the release's
parser, so one in a body could stop every release or change the version
it chose. `parserOpts` sets `fieldPattern: null`, and
[releaseConfig.test.ts](../scripts/releaseConfig.test.ts) checks that
such a line changes neither the version nor the notes.

### What never changes

Several versions of Solid Memo can use one pod: a fork, a copy someone
runs themselves, a tab opened before a deploy. So that each keeps
working on what another saved, three things never move, whatever a
commit says:

- **The format a kind of data is written in.** An app refuses to save
  over a format newer than its own (`writtenByNewerApp`,
  [data-model.md](data-model.md)), so a format raised would shut every
  earlier version out of what a later one saved. Every release since
  6.0.0 writes the same formats. Data added later needs no new format
  ([vocab.md](vocab.md#versioning-policy) says where it goes), and a new
  kind of data starts at format 1.
- **Where the data is in a pod**: the folders, the document names, the
  type index registrations and the links followed from a WebID. An
  older version looks for the data where it was.
- **The version of a database in the browser**, the guest pod's and
  the session's. A tab of an older version can't open a database a
  newer one raised.

What is published never changes either: a shape, a vocabulary term, a
deck version ([below](#what-has-versions-of-its-own)).

A later version also reads no less of a pod than the version that
wrote it. Each pod the app has written is kept as a snapshot, in
`packages/lib/vocab/fixtures/pods/<n>.nt`, with what the app read of it
then beside it (`<n>.records.json`). One scenario writes a pod that
holds every kind of data, each with every term its shape names. When
the app writes that pod differently, the result is the next snapshot,
and the earlier ones stay. For each snapshot, the current app reads
every value the records hold, and saving them back leaves each document
saying what it said
([podSnapshots.roundtrip.test.ts](../packages/adapters/solid/src/podSnapshots.roundtrip.test.ts)).
`api/frozen/pods.txt` holds each file's hash, so a snapshot edited or
removed fails `check:breaking` whatever a commit says.

### What a merge commit decides

Nothing. The merge queue's merge commit holds the pull request's title
in its message, and commitlint reads neither. So the release leaves out
every commit with more than one parent, when it chooses the version and
when it writes the notes
([releaseWithoutMerges.ts](../scripts/releaseWithoutMerges.ts)). A
pull request's own commits are all in the range and count as usual, so
a change that breaks says so in a commit: a title that says it breaks
releases nothing.

The queue also refuses a pull request whose title holds what the tools
after it would act on. CI's `commits` job reads each merge commit the
queue built (`npm run check:merges`), and fails on one of GitHub's
keywords that skip CI, or on a line that starts `BREAKING CHANGE:` or
`BREAKING-CHANGE:`. GitHub reads those keywords from the commit a push
leaves at the tip of `main`, so a title that held one would stop CI, and
with it the release and the deploy, for that commit. To fix a refused
pull request, change its title and add it to the queue again. The job
fails too on a queue run that built no merge commit, as this all rests
on the queue merging with one.

A commit with one parent that commitlint skips, such as a revert or a
`fixup!`, is read by the release as any other, so a revert still
releases. It may not say it breaks: on a pull request and in the queue,
`npm run check:merges` fails on such a commit that has the `!` or the
footer. A change that breaks says so in a commit commitlint reads.

### Reverts

A revert that `git revert` writes names the commit it takes back, in a
line `This reverts commit <hash>.`, and the release leaves out both the
revert and that commit. The release's plugins match the two by the
message alone. So the release also checks with git that the revert's
change undoes the commit's change, and it ignores the line when the
change doesn't. The two changes are compared by their patch ids,
verbatim: whitespace counts, so a change that differs from the undoing
only in its spaces doesn't undo it
([reverts.ts](../scripts/reverts.ts), called by
[releaseWithoutMerges.ts](../scripts/releaseWithoutMerges.ts)). Patch
ids leave out line numbers, so a change that puts the same lines back
at another place, with the same context, counts as undoing the commit
too. `npm run check:breaking` still compares `api/` itself and finds a
line of it that is gone. A revert that doesn't undo its commit still
releases a patch, and the commit it names counts as usual, a breaking
one too. `npm run check:breaking` reads the commits in the
same way, so a breaking commit that a revert undoes no longer declares
a line of `api/` gone, and one that a revert only names still does. Its
base can be later than the last release, so it checks again from the
last release tag, the commits the release reads
([below](#how-ci-holds-to-it)). On a
pull request and in the queue, `npm run check:merges` fails on a commit
that says it reverts a commit whose change it doesn't undo: make the
revert with `git revert`, or reword it as a `revert:` commit without
that line.

The check can refuse a revert that `git revert` wrote, in two cases.
When a rebase rewrites the commit that the revert names, the hash in
its line no longer names a commit on the branch. When the revert's
conflicts are resolved by hand, its change is no longer that commit's
change undone. After a rebase, revert the commit as it is on the branch
now. After resolving conflicts, reword the commit without the
`This reverts commit` line: the commit it took back then still counts
in the release, and a breaking one still needs its declaration.

The notes are written from commits' messages, and `CHANGELOG.md` keeps
its generated entries out of Markdown and spelling lint with directives
in the file. So no commit may hold an HTML comment's `<!--`, `-->` or
`--!>`, or a spell checker's directive, anywhere in its message. An
entry that held one would turn a linter back on, and CI would fail on the release commit
after the tag. commitlint refuses a message that holds one, and
`npm run check:merges` reads every commit's whole message for one too,
merge commits and commits commitlint skips included, as commitlint can
miss part of a message.

## How CI holds to it

[`api/`](../api/README.md) holds the public API, one promise a line: the
formats the app reads, the hashes,
what the app keeps in the browser and what a copy relies on. `api/frozen/` holds
[what never changes](#what-never-changes): the formats the app writes,
where data lives in a pod, the databases' versions, the
published documents and the vocabulary's terms. Each file is written by
a test in the package whose code it reads, so a change to a promise
fails that test until the file is written again (`npm run test:unit --
<the test> -u`), in the same commit.

`npm run check:breaking -- --base <git ref>`
([checkBreaking.ts](../scripts/checkBreaking.ts)) compares these files
with the ones at `<git ref>`, the change's base. CI's `library` job runs
it on every pull request, in the merge queue and on every push to
`main` ([testing.md](testing.md#continuous-integration)):

- **A line gone** fails the check, unless a commit since the base says
  the change breaks (`!` and its footer), or gives a trailer
  `Contract-Change: not-breaking <reason>`. The reason is that the old
  line still holds: an old hash still opens its screen, or a key's old
  value is still read. A commit that a later one reverts counts only
  as the release counts it ([above](#reverts)).
- **A line gone since the last release** fails the check in the same
  way, read from the last release tag to `HEAD`, the commits the
  release reads. The last release is found as semantic-release finds
  it: the highest version among the `v<major>.<minor>.<patch>` tags
  that `HEAD` has, not the nearest one. So a breaking commit merged
  before the base, and reverted since, no longer covers a line that
  went again after it. With no release tag yet, the check says so
  ("No release tag found; checked from the base only.") and reads from
  the base alone.
- **A line of `api/frozen/` gone** fails the check, whatever the
  commits say. A format written never moves, nor does the data in a
  pod. A published address keeps answering, a published shape
  is never edited, a term is never taken back.
- **A commit that says it breaks** while no line went is noted, and
  passes: removing a feature changes no file.

A line added needs nothing. Review covers what no file can hold, such
as a feature removed.

The same job runs earlier releases' own code against the change
(`npm run check:exchange`,
[exchangePods.ts](../scripts/exchangePods.ts)). The snapshots show
that the change reads what earlier code wrote; only an earlier
release's code can show that it still reads and saves what the change
writes. A pod is exchanged with the first release that has the
exchange's runner
([podExchange.ts](../packages/adapters/solid/src/testing/podExchange.ts)),
and with the first release of each major version after it, each
checked out from its tag with its own dependencies:

1. The release writes a pod, with its own scenario.
2. The change uses it as a learner would the day after. Nothing the pod
   said of a subject may be gone.
3. The release reads it and saves it back. Every value it reads, the
   change read the same; no save is refused; each document says what it
   said.

The first exchange is with the change itself, so the runner is tried
before any release has it. A release's side of the exchange is run as
that release has it, for good. So the steps keep their names, as do
the two variables that name the step and the folder, and the three
files a pod and its records are passed in.

## What has versions of its own

The data that other apps and pods rely on has versions of its own, by
its own rules, and none follows the app's number:

| What | Its version | Rules |
|---|---|---|
| The vocabulary | `v1` in its IRI, and `owl:versionInfo` (1.29) in [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) | Terms are only added ([vocab.md](vocab.md#versioning-policy)) |
| The shapes | `ns/shapes/<class>/v<N>.ttl`, one file per format version | A published version is never edited, and a class gets no further version ([shapes.md](shapes.md)) |
| The bounds | `ns/bounds/<kind>.ttl`, one file for every version of a kind | A document's address keeps answering; a bound may move, as it changes what the app reads, not the data's format ([shapes.md](shapes.md#bounds)) |
| Format versions | `sm:formatVersion` on every subject the app writes | The format a kind is written in never moves ([above](#what-never-changes), [migrations.md](migrations.md)) |
| The library's decks | `decks/<name>/v<N>.ttl` | A published version is never edited ([deck-library.md](deck-library.md#publishing-a-new-version)) |

The commit's subject names what it adds, so the changelog does too:
"add a term to vocabulary 1.21", "add version 3 of the capitals deck".

## The changelog

The release writes [CHANGELOG.md](../CHANGELOG.md), each version's
entry under the file's header, newest first. `feat` commits go under
"Features", `fix` commits under "Fixes", and so on, each line a
commit's subject with its scope and a link to the commit. A breaking
change comes first, under "BREAKING CHANGES", with its footer's text.
Commits of the other types are left out.

After each commit's link, a line lists the issues its message refers
to, as `closes`, whatever word comes before them. Each `#` followed by
a number counts as an issue ([release.config.mjs](../release.config.mjs)'s
`parserOpts`). A `#` before any word used to count, so the entries of
5.0.0 and 5.2.0 say they close CSS colors, such as `#9ba6b2` (#281).
The site's footer links to the changelog on `main`
([Footer.tsx](../packages/ui/src/ui/Footer.tsx)).

The notes keep a commit's header and a breaking change's footer as
Markdown, so a link or an image there stays one in `CHANGELOG.md`.
commitlint and `npm run check:merges` refuse there
`[text](target)`, `![alt](target)`, `[text][ref]`, a reference's
definition `[ref]:` wherever it stands, a `file:` address, and an HTML
tag with any attribute, its name read as HTML reads it. The body may
link, as the notes leave it out. CI's `docs` job leaves `CHANGELOG.md`
out of its link check too ([testing.md](testing.md#documentation)), so
an entry already released can't fail every later pull request.

A subject says, in plain words, what changed for users, other apps or
people who run their own copy. Nobody edits an entry by hand: a mistake
stays, and the next version's entry can correct it. The header is
`release.config.mjs`'s `changelogTitle`, and
[releaseConfig.test.ts](../scripts/releaseConfig.test.ts) checks that
the two match. At the end of the file, a section written by hand sums up
what 1.0.0 contains, which its generated entry lists only in part.

## Highlights for users

A release worth announcing can bring highlights: a sentence or two on
what it brings users, written by hand in every app language. The app
shows the highlights a browser hasn't shown yet in a card at the top of
the deck list, newest first, until it's closed
([user-guide.md](user-guide.md#your-decks)). A patch or an internal
change brings none.

A highlight has an id, not a version, which semantic-release picks only
as it releases. The browser keeps the ids it has shown
(`solid-memo:seenHighlights`, [privacy.md](privacy.md)). A first visit,
or a browser that kept none, keeps them all without showing any.

To add one:

1. Add `{ id, text }` at the top of `HIGHLIGHTS` in
   [highlights.ts](../packages/ui/src/ui/highlights.ts). The id is
   kebab-case, such as `landing-login`, and is never reused or renamed:
   a renamed highlight shows again.
2. Add its text as `whatsNew.highlight.<the id in camelCase>`, such as
   `whatsNew.highlight.landingLogin`, to `en.json` and every other
   language's file ([i18n.md](i18n.md#messages)).

[highlights.test.ts](../packages/ui/src/ui/highlights.test.ts) holds
the ids to kebab-case, each once, and each text to its key.
[i18n.test.tsx](../packages/ui/src/ui/i18n.test.tsx) holds every
language to the keys English has. A highlight shown long ago can be
taken out of the list and the message files.

## What each stage checks

A change to `main` meets CI up to four times on its way to the site;
its tree is tested once. For each run, CI's `gate` job
(`npm run ci:gate`, [ciGate.ts](../scripts/ciGate.ts)) either tests
the tree, with every job running and blocking, or reuses the run that
already tested it: it skips the jobs that test and takes over what the
reused run made.

| Stage | What runs, and blocks |
|---|---|
| A pull request | every job |
| The merge queue (`merge_group`) | every job but `dependency-review`, a pull request's alone, at full strength; a flaky check is fixed here, not retried |
| A push to `main` the merge queue passed | the queue's run is reused: its site and Turbo's cache are taken over |
| A push to `main` that skipped the queue | every job, as in the queue |
| A release commit | when CI passed its parent on `main`, the run that tested the parent is reused and the commit's own files are linted; otherwise every job |
| A run by hand | every job but `dependency-review`, as in the queue |

So a tree is tested once per push to its pull request and once more in
the merge queue, on top of `main` and the pull requests ahead of it.
Interop ([testing.md](testing.md)), which runs the advisory servers'
suites after a push to `main`, skips a release commit too.

**Test a tree once, at full strength, before it lands.** The merge queue
builds exactly the commit `main` moves to
([testing.md](testing.md#the-merge-queue)). The gate asks GitHub's API
whether a `merge_group` run passed that commit. When one did, the push
run tests nothing, and its `reuse` job keeps the queue run's `site`
artifact as its own. It also saves the queue run's `turbo-cache`
artifact as `main`'s Turbo cache, which every pull request starts
from. When the queue tests
several pull requests at once, each is its own commit with its own run,
on top of those ahead of it, and `main` moves to the last. A run is
found by its commit, never by its pull request.

**Know when a change skipped the queue.** A change can reach `main`
without the queue through a ruleset bypass, such as a merge from a
security advisory's private fork, where Actions don't run. Its push run
is its first CI and runs every job. The release follows that run only
once it passes ([below](#what-a-release-does)).

**A release commit isn't tested again.** A release commit changes only
the five files `release.config.mjs` lists (`assets`): `CHANGELOG.md`,
`CITATION.cff`, `package.json`, `package-lock.json` and
`publiccode.yml`. Its run reuses the run that tested its parent and
takes over its site, which the deploy ships
([deployment.md](deployment.md#the-build-ci-tested)). The gate fails the
run if the commit changes any other file or has more than one parent.
The `release-files` job lints the five files as `npm run check` does,
and checks `publiccode.yml` with its parser; nothing that tests code
runs again, the user journeys included. When CI hasn't passed the parent
on `main` (a release commit pushed by hand), every job runs.

The journeys report the deploy publishes at `journeys.solid-memo.com`
([deployment.md](deployment.md#the-journeys-report)) still has every
browser's results: a reusing run takes the journeys from the run it
reuses (`tested-by`). That's the queue's run of the commit or of a
release commit's parent, or the parent's own push run when it skipped
the queue. GitHub keeps a run's artifacts for 7 days. When
an artifact the run would take over has expired, as for a release made
late by hand, the gate runs every job instead.

On `main`, CI's `warm` jobs save the caches a skipped job would have
saved, which every pull request reads. `warm` looks up each server's
images, the journeys' server's, the journeys' browsers, Chromium's
headless shell and the browsers' system libraries. `warm-images` and
`warm-browsers` pull, build or download only what's missing and save
it. `warm-pip` installs the Python tools, so pip's caches are saved
where `main` lacks them
([testing.md](testing.md#continuous-integration)). The site that's
deployed is built without them: CI's `site` job restores nothing from
GitHub's cache and attests what it built, which the deploy checks, as
`deployment.md` says.

A `workflow_dispatch` run of the deploy runs `npm run check` itself and
needs no CI run.

## What a release does

Like the deploy, [release.yml](../.github/workflows/release.yml) runs
when CI has passed on a push to `main` in this repository. Its
`prepare` job runs semantic-release
([release.config.mjs](../release.config.mjs)) on `main`'s tip. When
`main` has moved on since the commit CI passed on, it releases the tip
only if CI has passed on it too, and otherwise leaves it to the tip's
own run. When there is something to release, semantic-release:

1. chooses the version from the commits since the last tag
   ([The scheme](#the-scheme)), and writes its notes;
2. writes the notes into CHANGELOG.md;
3. sets the version in the root `package.json` and `package-lock.json`,
   and the version and today's date in
   [`publiccode.yml`](../publiccode.yml) (`softwareVersion`,
   `releaseDate`) and [`CITATION.cff`](../CITATION.cff) (`version`,
   `date-released`), with `npm run release:version`
   ([releaseVersion.ts](../scripts/releaseVersion.ts));
4. renders the version's docs as pages, with every diagram the
   `prepare` job drew in Chromium before it ran
   (`npm run docs:archive -- --draw`), into
   `release-assets/docs-X.Y.Z.tar.gz`, with
   `npm run docs:archive -- X.Y.Z --drawn`, which starts no browser
   ([deployment.md](deployment.md#a-releases-docs-as-an-archive)). git
   ignores the archive, so the release commit leaves it out;
5. commits the five files of steps 2 and 3 as `chore(release): X.Y.Z`,
   with no body, and tags that commit `vX.Y.Z`, in a copy of the
   repository on the runner, not on GitHub
   ([below](#the-deploy-key)). The notes are left out of the message:
   they copy the subjects of the commits released, and a skip keyword
   such as `[skip ci]` in one would stop CI, and so the deploy, on the
   release commit.

Then the workflow's `push` job checks that the commit holds nothing but
the release's changes, and pushes it to `main` and its tag at once with
the deploy key. Its `publish` job makes a
GitHub release of the tag, "Solid Memo X.Y.Z", with the version's
CHANGELOG.md entry as its notes and the archive of its docs,
"Documentation X.Y.Z (HTML)". It attests the archive as made by the
release workflow on `main` (`actions/attest`), makes the release as a
draft, which the deploy refuses, uploads the archive, then publishes
the release.

Zenodo archives each of the repository's GitHub releases and gives it
a DOI. The concept DOI,
[10.5281/zenodo.23351087](https://doi.org/10.5281/zenodo.23351087),
always resolves to the latest release and is in `CITATION.cff` and the
README. [`.zenodo.json`](../.zenodo.json) holds the metadata
Zenodo gives each archived release: the title, the description, the
author, the license, the keywords, and links to the repository and to
solid-memo.com (Zenodo never took `CITATION.cff`'s `url`). When the file
is there, Zenodo ignores `CITATION.cff` ([Zenodo's
help](https://help.zenodo.org/docs/github/describe-software/zenodo-json/)).
Its links replace Zenodo's link to the release's tag; the version,
taken from the tag, still names the entry. `.zenodo.json`
names no version, so a release writes nothing into it.

`CITATION.cff` and `.zenodo.json` say the same things, and nothing
checks that they agree: a change to one, such as a new keyword, goes
into the other in the same pull request, and into `publiccode.yml`
where it says the same.

Once CI passes on the release commit, whose message holds no keyword
that skips CI, the deploy ships the site that run carries, with the new
version in its pages and footer ([deployment.md](deployment.md#the-build-ci-tested)),
and deploys no other commit. The release workflow doesn't run on a
release commit. CI's run on a release commit has a concurrency group of
its own, so a newer push to `main` can't replace it while it waits
([testing.md](testing.md#continuous-integration)).

While the merge queue for `main` has entries, a push run releases
nothing. A release commit moves `main` under the queue, and GitHub
builds every queued pull request again on top of it
([testing.md](testing.md#the-merge-queue)), so each release would cost a
full run per entry. Before the job that releases, the workflow's
`queue` job asks GitHub's GraphQL API how many entries the queue holds
(`mergeQueue(branch: "main") { entries { totalCount } }`), and the
release goes ahead only when it holds none. That job holds no secret
and no environment, and its token can only read. When the query fails,
the job fails, and the run with it: it neither releases nor holds back
in silence.

So the push run of the last pull request to leave the queue releases
every commit since the last tag, as one version: during a busy queue,
several merges come out as one release and one deploy. If that last
entry fails, or is removed from the queue, no push follows it, and
`main`'s commits wait for the next merge, or for a run by hand, which
releases `main`'s tip whatever the queue holds.

Releases go one at a time, and the workflow doesn't cancel a running
one to start another. The concurrency group, `release`, is the whole
workflow's, so no run's `prepare` job starts between another run's
`prepare` and `push`. GitHub keeps only one run waiting in the group: a
newer one replaces it, and whichever goes ahead releases the tip. A run
that can't release, such as the one CI's run on a release commit
starts, takes a group of its own, so it never replaces a run waiting
to release. A fork, or a copy without the deploy key, runs the workflow
and releases nothing.

A release made by mistake isn't taken back
([below](#when-a-release-fails)); the next version fixes the mistake.

2.0.0 is one such release: no commit in it breaks anything, and nobody
has to act to move from 1.2.0 to 2.0.0. At the time, semantic-release
read a body line that began "breaking change", in lowercase and with no
colon, as a breaking footer, and its changelog entry lists the rest of
that line under "BREAKING CHANGES". The release now reads the footer
only as written ([what counts as breaking](#what-counts-as-breaking)),
and the version after 2.0.0 says so (#84).

### Runs from forks

The repository requires approval for all outside contributors' workflow
runs: under Settings › Actions › General, "Approval for running fork
pull request workflows from contributors" is set to "Require approval
for all external contributors". The maintainer reads what a pull
request changes under `.github/` before approving its run, so the checks
of a fork's pull request don't start until the maintainer has approved
them. A copy of the repository that takes pull requests from forks needs
the same setting.

## The deploy key

The ruleset on `main` requires every change to come as a pull request
through the merge queue ([testing.md](testing.md#the-merge-queue)). The
release commit gets past it with a deploy key: an SSH key with write
access to this repository alone, which a ruleset's bypass list can name,
and whose pushes start workflows. A push with the workflow's own token
starts no workflow, so CI and the deploy wouldn't run on the release
commit.

Only the release workflow can use the key. Its private key is a secret
of the `release` environment, which allows only `main`, and release.yml
is the only workflow on `main` that names `release`. Only a job that
names an environment reads its secret, in a run on a branch the
environment allows; any workflow in the repository, on any branch, can
read a repository secret. With one, anyone with write access could
push past the ruleset and tag a version to be deployed. That holds only once no repository secret of
the same name is left: a job whose environment lacks a secret reads the
repository's.

The maintainer sets it up once, before the workflow first runs on
`main`, so that the merge that adds it releases 1.0.0:

1. Make a key pair with no passphrase, outside the repository:

   ```sh
   ssh-keygen -t ed25519 -N "" -C "solid-memo release" -f release-key
   ```

2. Add `release-key.pub` as a deploy key of the repository, with write
   access (Settings › Deploy keys › Add deploy key, "Allow write
   access").
3. Make the environment `release` (Settings › Environments › New
   environment), or open it if a run made it already (open to every
   branch). Under "Deployment branches and tags", choose
   "Selected branches and tags" and add only the branch `main`. Add
   the private key, `release-key`, as its environment secret
   `SEMANTIC_RELEASE_KEY`. Then delete both files, and any repository
   secret of that name (Settings › Secrets and variables › Actions).
4. Add "Deploy keys" to the bypass list of the ruleset on `main`
   (Settings › Rules), so that the release commit needs no pull request.
5. Add a ruleset for tags matching `refs/tags/v*` that restricts their
   creation, update and deletion (Settings › Rules › Rulesets › New
   ruleset › New tag ruleset: enforcement Active, target `v*`). Its
   bypass list holds "Deploy keys" and the Repository admin role, the
   admin's for tagging by hand ([below](#when-a-release-fails)). The
   deploy deploys the commit a version tag names, so without this
   ruleset anyone with write access could have a commit deployed.

"Deploy keys" in a bypass list lets every deploy key with write access
past it, so this key stays the repository's only deploy key with write
access: any other is added without "Allow write access".

GitHub hands a job its environment's secrets when the job starts, and
the runner keeps them for the whole job, so every step of a job that
names `release` can read the key, not only the steps that name it. So
the release is three jobs, and only the one that pushes holds the key:

- **`prepare`** runs semantic-release, with no environment, no secret
  and a token that can only read. Its checkout keeps no credentials.
  Before semantic-release runs, the job clones the checkout into a bare
  copy, points git at the copy in place of GitHub's URL
  (`url.<copy>.insteadOf`), and refuses https in the checkout
  (`protocol.https.allow never`). semantic-release fetches from the
  copy, checks that it can push to it, and pushes the release commit
  and its tag there. Its notes still link to GitHub, since the URL it
  reads is GitHub's. The job keeps the commit and its tag as a git
  bundle, and the docs' archive, as artifacts of the run. The git notes
  semantic-release writes stay behind: it reads a tag without them as
  on the default channel, the only one.
- **`push`** names the `release` environment, and holds the key. It
  installs nothing and loads no package. It checks out `main`, sets up
  Node, downloads the bundle and runs `main`'s own scripts, which import
  none. It fetches only the tag from the bundle, and
  `npm run release:commit -- next vX.Y.Z`
  ([releaseCommit.ts](../scripts/releaseCommit.ts)) checks the commit
  the tag names:
  - its parent is `main`'s tip;
  - its version is the next patch, minor or major release after the
    highest release tag on `main`, which the job reads from `main`'s
    own tags, not from the bundle;
  - it's that version's release commit, by `github-actions[bot]`, as
    the deploy checks;
  - its message is its subject alone;
  - it changes only the five files, each a regular file before and
    after, and each is `main`'s with nothing but the version, the date
    and one changelog entry written in
    ([releaseChanges.ts](../scripts/releaseChanges.ts));
  - the date in the entry's heading is a day of the calendar, and the
    day the check runs (UTC) or a day either side.

  Then it pushes the commit to `main` and the tag in one
  `git push --atomic`, which isn't forced. A `main` that moved on, or a
  tag that's already there, refuses the whole push, so `main` never
  holds the commit without its tag. Only that step writes the key where
  git reads it: a file that git's `ssh` reads (`GIT_SSH_COMMAND`), with
  GitHub's host keys from its API, removed when the step ends.
- **`publish`** makes the GitHub release, with no environment and no
  secret; its token can write the repository's contents and attest. It
  checks that the tag names its version's release commit on `main`
  (`npm run release:commit -- tag`), and takes the changelog entry that
  commit added as the notes (`npm run release:commit -- notes`). It
  attests the archive, makes the release as a draft, attaches the
  archive, and only then publishes the release.

So a package that semantic-release or the docs' archive loads can't
read the key, whatever it does. The most it could do is shape the
release commit. The push job pushes only a commit with nothing but a
release's changes in it, with a version that follows `main`'s highest
release tag and the run's date, give or take a day. So what it could
choose is the text of the changelog entry, and which of the three next
versions the release takes. The push job doesn't compare that bump with the
commits' types, since the parser that reads them is a package. CI runs
on the commit before the deploy.

What the `prepare` job runs is still kept to what the release needs,
since the job's output is pushed with the key:

- The docs' diagrams are drawn in Chromium before semantic-release
  runs (`npm run docs:archive -- --draw`), each checked as the site's
  build checks it (`checkSvg`, and the font's notice). The archive
  semantic-release renders takes them from the drawings' cache with
  `--drawn`, drawing nothing. A drawing that fails its checks fails the
  release before anything is pushed.
- The artifacts are kept for 7 days. Re-running only a failed `push`
  or `publish` job works within them; after that, the download fails,
  and the maintainer re-runs all the run's jobs, or runs the workflow
  by hand.
- `npm ci --ignore-scripts` runs no package's install script.
  Chromium comes from the Chromium action, which downloads
  its headless shell and checks the file against the SHA-256 committed in
  [.github/actions/headless-shell](../.github/actions/headless-shell/action.yml).
  Playwright's own download checks no hash, so it isn't used, and
  `npm run check:shell` holds the pin to Playwright's version.
- `npm audit signatures` runs next (`npm run audit:signatures`), before
  Chromium is downloaded and before semantic-release runs. It fails
  unless every installed version from a registry has the registry's
  valid signature, and any attestation it has, such as its provenance,
  verifies ([testing.md](testing.md#the-workflows)). Only an answer the
  registry couldn't give or that npm couldn't read is asked for again,
  twice at most. It checks the registry's
  record of each version, not the lockfile's hashes or the files
  installed. A valid signature proves a version is one the registry
  published, not that it's safe: a hijacked maintainer account still
  publishes a validly signed version.
- Nothing comes from GitHub's cache: not npm's cache, not Chromium,
  and not its system libraries, which come from Ubuntu's signed mirror
  (the Chromium action's `cache: false`). Any job on `main` can write
  `main`'s cache entries, so a file restored from them could carry code
  from the least trusted of those jobs into this one. The rule covers
  every workflow, not only this one: no job that holds a token that can
  write, an OIDC token, a secret or an environment restores anything
  from the cache. That includes npm's cache, which `setup-node` restores
  on its own unless a step sets `package-manager-cache: false`.
  [scripts/releaseWorkflow.test.ts](../scripts/releaseWorkflow.test.ts)
  checks every workflow for it. This workflow sets
  `cache-mode: none`, so no job of it can read or write the cache at
  all: `docs-render` runs a tag's packages in a run on `main`, and
  could otherwise write `main`'s entries for another job to restore.
  The release workflow's `docs-render` job restores nothing either, as
  what it renders is attested. It installs Chromium and its libraries with its
  own step, not the Chromium action: that action comes from the tag's
  checkout, and an older tag's copy restores them from the cache or downloads
  the shell unchecked. The step checks the shell against the same
  SHA-256, so it fails for a tag whose Playwright wants another build,
  and takes the libraries from Ubuntu's signed mirror
  (`npx playwright install-deps`). A release whose archive is missing
  is attached again before the next update to Playwright that moves
  the shell is merged; after it, main pins a build that tag's
  Playwright doesn't want, and the job can't attach that tag's docs.
  The download is the same step as the headless-shell action's, which
  `npm run check:shell` checks too.

The `prepare` job renders the repository's docs, with the drawings
kept, to pack the archive, and it loads Vite. These are development
dependencies that read only what is committed on `main`, and
Playwright and Mermaid are pinned. Renovate proposes their updates, and
those of semantic-release, its plugins and the preset they load, once
their version has been public for 3 days, so a bad version can be found
and pulled first. CI checks them ([vendor-code.md](vendor-code.md)),
and Renovate leaves each one waiting for a person, who merges it after
reading what it changes
([GOVERNANCE.md](../GOVERNANCE.md#dependency-updates)). The wait holds
for every package an update newly locks, not only the one it names:
the repository's `.npmrc` files set npm's `min-release-age` to 3 days,
and its `uv.toml` sets uv's `exclude-newer` to 3 days. Every action
the workflows use is pinned to a commit, since a tag can be moved
(`npm run check:actions`,
[testing.md](testing.md#the-repositorys-own-checks)), and a person
merges each update to one, which Renovate leaves waiting.

Without the secret, the workflow says so and releases nothing; once it's
set, the maintainer runs the workflow by hand (next section) to release
what is waiting. The maintainer changes the key by adding the new one as
a deploy key, replacing the environment's secret, then deleting the old
deploy key.

## When a release fails

The workflow's run says which step failed and why; nothing opens or
comments on an issue. Once the cause is fixed, the maintainer runs the
workflow by hand (Actions › Release › Run workflow, from `main`), which
refuses until CI has passed on `main`'s tip. The next push to `main`
that passes CI, with the merge queue empty, tries again. A run whose
`queue` job failed released nothing, and is handled the same way. A
canceled run is handled by what it left behind, as in the cases below.

- **Before the push** (a wrong configuration, a file the release
  couldn't write, docs that couldn't be rendered or drawn, Chromium
  that wouldn't start): nothing was pushed, and the next run releases
  as usual.
- **The commits semantic-release read aren't the ones git holds**:
  nothing was released, and every run stops the same way, as the
  commits stay in the range. `npm run check:merges -- --base <last tag>
  --head main` names the commit whose author or committer it refuses
  ([What counts as breaking](#what-counts-as-breaking)); the maintainer
  agrees in an issue how to release past it.
- **The `push` job refused the commit** (`npm run release:commit --
  next`, [above](#the-deploy-key)): nothing was pushed. When `main`
  moved on while the release ran, the error says its parent isn't
  `main`'s tip, and the next run releases from the new tip. Any other
  error names what the commit holds that a release doesn't write:
  something in the `prepare` job wrote it, and every run stops the same
  way. The maintainer finds out what before anything else is released,
  and fixes it in its own pull request.
- **The push was refused**: `main` moved on between the check and the
  push, or the deploy key, its secret in the `release` environment or
  the bypass is missing. The push is atomic, so neither the commit nor
  the tag was pushed, and the next run releases from the new tip.
- **The release commit is on `main`, but not its tag** (it was pushed
  by hand without its tag; the `push` job pushes both at once). Every
  run of the workflow stops with an error that names the commit until
  it's tagged.
  That stops semantic-release from releasing the same version again on
  top of it. Only a commit semantic-release
  made counts (`npm run release:commit`,
  [releaseCommit.ts](../scripts/releaseCommit.ts)): one on `main`'s
  first-parent chain, by `github-actions[bot]` as author and committer,
  that changes only the version's files. A commit that's only titled
  `chore(release)`, such as one inside a merged pull request, is passed
  over with a notice, and CI's `commits` job refuses that title in a
  pull request. Before tagging, the maintainer checks that the commit
  the error names is semantic-release's, then tags it by hand and makes
  its GitHub release as below:

  ```sh
  git switch main && git pull
  git log -1 --format='%an / %cn' <release-commit>  # github-actions[bot] / github-actions[bot]
  git rev-list --first-parent main | grep -x "$(git rev-parse <release-commit>)"
  git diff --name-only <release-commit>^ <release-commit>  # only the version's files
  git tag vX.Y.Z <release-commit>
  git push origin vX.Y.Z
  ```

  The deploy after CI found no tag and deployed nothing. Once the GitHub
  release is made, the maintainer runs the deploy by hand (Actions ›
  Deploy to GitHub Pages › Run workflow, from `main`), which deploys the
  new tag's version. It fails if the tag names any commit but
  semantic-release's `chore(release): X.Y.Z` on `main`, or the GitHub
  release is missing ([deployment.md](deployment.md)).

- **CI failed on the release commit**: the version is released but not
  deployed. When the run reused the parent's, one of these jobs failed
  ([What each stage checks](#what-each-stage-checks)):
  - the `gate`, which refuses a release commit that changes more than
    the version's files;
  - `release-files`, which lints them;
  - `reuse`, which takes over the tested run's site;
  - `journeys-report`, which merges the tested run's journeys.

  A failed lint is fixed in its own pull request, which the next
  release ships. For a `reuse` or `journeys-report` that failed on its
  download, the maintainer re-runs CI's failed jobs on that commit, and
  once the run passes, the deploy follows. When every job ran instead
  (CI hadn't passed the parent on `main`, or an artifact had expired), a
  failure is met as on any push to `main`. A flaky job is re-run, and
  its flake fixed in its own pull request. The maintainer can instead
  run the deploy by hand, which checks the version itself.
  Either deploys the version only while it's the newest, and otherwise
  deploys nothing and says so, and the site stays on the newer
  version.

- **After the push** (the `publish` job failed or was canceled, so the
  version has no GitHub release, or a draft one), **or its docs aren't
  attested** (the attestation step failed): a new run finds nothing to
  release. The deploy after CI on the release commit fails while the
  version has no published release; a published release whose archive
  isn't attested deploys as usual, missing only the attestation. The
  maintainer runs the workflow by hand from `main` with the version's
  tag (Actions › Release › Run workflow, "tag" `vX.Y.Z`), while no
  Release run is running or waiting. That run's concurrency group is
  its tag's, so it doesn't wait for a Release run. It marks the
  version latest when it's the newest tag, and a release made while it
  runs would leave that wrong. The run is three jobs, none with the
  deploy key, split as the release's jobs are, so no job that can
  write the repository or attest loads a package:
  - **`docs-release`** runs `main`'s own scripts and installs nothing.
    It reads the tag as `refs/tags/vX.Y.Z` only, never as a bare name,
    which a branch of the same name would win. It fails unless the tag
    names that version's release commit on `main`, as the deploy checks
    (`npm run release:commit`). When the tag has no GitHub release, it
    makes one as a draft, "Solid Memo X.Y.Z", with the changelog entry
    that commit added as its notes, as the `publish` job would have.
    An archive already on the release that's attested is kept. One
    that isn't attested is rendered again and replaced.
  - **`docs-render`** checks out that commit by its hash, installs its
    packages, and renders and draws the docs from it, with a token that
    can only read and nothing to attest with. It passes the archive and
    its SHA-256 on as an artifact of the run.
  - **`docs-publish`** holds the token that can write and attest. It
    checks out nothing and loads no package. It takes the archive only
    as one regular file of the version's name, with the SHA-256
    `docs-render` gave. gzip must read it, and tar must list at least
    one entry, each a file or folder under `docs/` by a relative path,
    with no `.` or `..` part, no escaped name and no link. Tar lists
    past an end of archive too, so nothing hides behind one. It never
    unpacks or runs it. The check catches a broken render, not a
    hostile one: the archive is only as trusted as `docs-render`, as
    the prepare job's is in a release, whose publish job attaches it
    unchecked. It attests
    the archive, attaches it with the run's token, and publishes the
    release if it's still a draft. When `docs-render` fails, it
    attaches nothing and publishes nothing, and the maintainer runs the
    workflow again once the cause is fixed.

  For a draft, the maintainer then runs the deploy by hand (Actions ›
  Deploy to GitHub Pages › Run workflow, from `main`). The archive is
  never uploaded by hand: only this workflow can attest it as made on
  `main` ([deployment.md](deployment.md#a-releases-docs-as-an-archive)).

  `ci.yml`'s `site` job also installs packages and attests what it
  builds, yet it stays one job, as it isn't the same case. It can't
  write the repository, and it builds only the commit its own run
  checks out, on `main` or in the merge queue. Its attestation is
  `ci.yml`'s, which the deploy accepts only for the site of the
  commit it releases or that commit's parent. The docs run held a
  token that could write, and loaded the packages of a tag that may
  be older than `main` while it could attest as the release workflow.

A tag is never moved or deleted once pushed, even one whose release
went wrong: Zenodo and anyone who fetched it may already hold it.
