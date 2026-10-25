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
styles, and whatever these docs do not name. These docs as the site
serves them, at `/docs/` and below it, are not part of it either: a
page may be renamed, split or merged in any version
([deployment.md](deployment.md#what-the-artifact-contains)), as may
`robots.txt`, `sitemap.xml` and the archive of a release's docs
([deployment.md](deployment.md#a-releases-docs-as-an-archive)).

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
- **An address that stops working**: a file published under `/ns/`,
  `/vendor/` or `/decks/` removed or moved, or a hash the app or the
  Studio no longer opens.
- **What the browser kept, lost**: a storage key or the guest pod's
  database renamed, or what they hold no longer read.
- **A feature removed** that users rely on.

A new prerequisite for building a copy is not breaking when the build
names it and a setting builds without it: `npm run build` draws the
docs' diagrams in Chromium, and `DOCS_DIAGRAMS=skip` builds without
them, on any machine and in any CI
([configuration.md](configuration.md#docs_diagrams)). The commit that
brings one in names it in its subject, so the release notes say what
a copy now needs.

A new vocabulary term that no shape names is not breaking
([vocab.md](vocab.md#versioning-policy)); neither is a new deck in the
library, nor a new version of a deck. A published shape is never
edited, so a term that a shape gains, even an optional one, is in the
shape's next version: a new format version the app writes, and so
breaking. A change that is
breaking says so in its commit, with `!` and a `BREAKING CHANGE:` footer
that tells users what to do, and it is agreed in an issue first
([CONTRIBUTING.md](../CONTRIBUTING.md#open-an-issue-first)).

The release reads the footer only as it is written: `BREAKING CHANGE:`
or `BREAKING-CHANGE:` at the start of a line, in capitals and with its
colon, as commitlint and `npm run check:breaking` read it
([release.config.mjs](../release.config.mjs)'s `parserOpts`). A line of
a body that begins "breaking change" in a sentence is not a footer.

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
| The vocabulary | `v1` in its IRI, and `owl:versionInfo` (1.24) in [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) | Terms are only added ([vocab.md](vocab.md#versioning-policy)) |
| The shapes | `ns/shapes/<class>/v<N>.ttl`, one file per format version | A published version is never edited ([shapes.md](shapes.md)) |
| Format versions | `sm:formatVersion` on every subject the app writes | [migrations.md](migrations.md) |
| The library's decks | `decks/<name>/v<N>.ttl` | A published version is never edited ([deck-library.md](deck-library.md#publishing-a-new-version)) |

A new format version the app writes is a breaking change of the app,
and so a major version; a new vocabulary term or a new deck version is
not. The commit's subject names what it adds, so the changelog does
too: "write deck format 8", "add a term to vocabulary 1.21".

## The changelog

[CHANGELOG.md](../CHANGELOG.md) is written by the release: each
version's entry goes under the file's header, newest first, with the
`feat` commits under "Features", the `fix` commits under "Bug Fixes",
and so on, each line a commit's subject with its scope and a link to the
commit. A breaking change is listed first, under "BREAKING CHANGES",
with its footer's text. The commits of the other types are left out.
After the link, a line lists the issues its message refers to, as
`closes`, whichever word comes before them: each `#` followed by a
number ([release.config.mjs](../release.config.mjs)'s `parserOpts`).
A `#` before any word used to count, so the entries of 5.0.0 and 5.2.0
say they close CSS colors, such as `#9ba6b2` (#281).
The site's footer links to it, on `main`
([Footer.tsx](../packages/ui/src/ui/Footer.tsx)).

So the changelog is as good as the commits' subjects. A subject says
what changed for users, other apps or people who run their own copy,
in plain words. Nobody edits an entry by hand: a mistake in one stays,
and the next version's entry can say what it should have said. The
header is release.config.mjs's `changelogTitle`, and the two must stay
the same ([releaseConfig.test.ts](../scripts/releaseConfig.test.ts)
checks it). At the end of the file, a section written by hand sums up
what the first version, 1.0.0, contains, which its generated entry
lists only in part.

## Highlights for users

A release worth announcing can bring highlights: a sentence or two,
written by hand for users, in every app language, of what it brings
them. The app shows the highlights a browser has not shown yet in a
card at the top of the deck list, newest first, until it is closed
([user-guide.md](user-guide.md#your-decks)). A patch or an internal
change brings none, so it never shows the card.

A highlight has an id, not a version: semantic-release picks the
version only as it releases, after the highlight is written. The
browser keeps the ids it has shown (`solid-memo:seenHighlights`,
[privacy.md](privacy.md)). A first visit keeps them all without
showing any, so a new user is not greeted with a list of changes, and
so is a browser that had kept none.

To add one:

1. Add `{ id, text }` at the top of `HIGHLIGHTS` in
   [highlights.ts](../packages/ui/src/ui/highlights.ts). The id is
   kebab-case, such as `landing-login`, and is never reused or renamed:
   a renamed highlight shows again.
2. Add its text as `whatsNew.highlight.<the id in camelCase>`, such as
   `whatsNew.highlight.landingLogin`, to `en.json` and every other
   language's file ([i18n.md](i18n.md#messages)).

[highlights.test.ts](../packages/ui/src/ui/highlights.test.ts) holds
the ids to kebab-case, each once, and each text to its key;
[i18n.test.tsx](../packages/ui/src/ui/i18n.test.tsx) holds every
language to the keys English has. A highlight shown long ago can be
taken out of the list and the message files, so they don't grow
forever.

## What each stage checks

A change to `main` meets CI up to four times on its way to the site,
but its tree is tested once. CI's `gate` job (`npm run ci:gate`,
[ciGate.ts](../scripts/ciGate.ts)) decides, for each run, whether the
run tests its tree, every job running and blocking, or reuses the run
that already tested the same tree: then the jobs that test are skipped,
not run again to the same end, and the run takes over what that run
made.

| Stage | What runs, and blocks |
|---|---|
| A pull request | every job |
| The merge queue (`merge_group`) | every job: this is where a tree is tested at full strength before it lands, and where a flaky check is fixed, not retried |
| A push to `main` the merge queue passed | the queue's run is reused: its site and Turbo's cache are taken over |
| A push to `main` that skipped the queue | every job, as in the queue |
| A release commit | the run that tested its parent is reused: its site is taken over, and the commit's own files are linted, once the `gate` has checked that it changes nothing but the files a release writes, when CI passed its parent on `main`; every job when it did not |
| A run by hand | every job |

So a change's tree is tested in its pull request, once for each push
to it, and once more in the merge queue, on top of `main` and the pull
requests ahead of it, and never again. Interop
([testing.md](testing.md)), which runs the advisory servers' suites
after a push to `main`, likewise skips a release commit.

**Test a tree once, at full strength, before it lands.** The merge
queue builds exactly the commit `main` moves to
([testing.md](testing.md#the-merge-queue)), so the push run on `main`
that follows meets a tree CI already passed in full. The gate asks
GitHub's API whether a `merge_group` run passed that commit; when one
did, the push run tests nothing again, and its `reuse` job takes over
what the queue's run made: the site its `site` job built, kept as the
push run's own `site` artifact, and Turbo's cache after its `check`
job, which the queue's run keeps as its `turbo-cache` artifact and the
push run saves as `main`'s, the cache every pull request starts from.
When the queue tests several pull requests at once, each is a commit
of its own on top of those ahead of it, with a run of its own, and
`main` moves to the last; a run is found by its commit, never by its
pull request, so `main`'s run reuses the one that tested its whole
tree.

**Know when a change skipped the queue.** A change can reach `main`
without the queue: a merge through a ruleset bypass, such as one from a
security advisory's private fork, where Actions do not run. Then the
push run is the first CI the change gets, no `merge_group` run passed
its commit, and every job runs. The release follows that run only
once it passes ([below](#what-a-release-does)), so a release built on
such a commit waits for the full run.

**A release commit is not tested again.** A release commit changes
only the version's files: the five that `release.config.mjs` lists
(`assets`): `CHANGELOG.md`, `CITATION.cff`, `package.json`,
`package-lock.json` and `publiccode.yml`. Its code is its parent's,
which CI passed on `main` before the release was made. So its run
reuses the one that tested its parent, taking over its site, which the
deploy ships ([deployment.md](deployment.md#the-build-ci-tested)), and the
gate fails it if the commit changes any other file, or has more than
one parent; its `release-files` job lints those files as
`npm run check` does, and checks `publiccode.yml` with its parser.
Nothing that tests code, the user journeys in every browser among it,
runs again, so none of it can hold up the deploy. Should CI not have
passed its parent on `main` (a release commit pushed by hand), every
job runs.

The report of the journeys the deploy publishes at `journeys.solid-memo.com`
([deployment.md](deployment.md#the-journeys-report)) still has every browser's: a run that
reuses another takes the journeys from it (`tested-by`). That is the
merge queue's run of the commit, or of a release commit's parent, which
keeps the journeys' traces and reports for this, or, for a parent that
skipped the queue, the parent's own push run. GitHub keeps that run's
artifacts for 7 days; once one the run would take over has expired, as
for a release made late by hand, the gate runs every job instead.

What a skipped job would have saved on `main`, the caches every pull
request reads, CI's `warm` jobs save instead: `warm` looks up each
server's images, the journeys' server's, the journeys' browsers,
Chromium's headless shell and the browsers' system libraries, and
`warm-images` and `warm-browsers` pull,
build or download only what is missing, and save it; `warm-pip`
installs the Python tools, so pip's caches are saved where `main`
lacks them ([testing.md](testing.md#continuous-integration)).

A `workflow_dispatch` run of the deploy runs `npm run check` itself,
as before, and needs no CI run.

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
4. renders the version's docs as pages, every diagram drawn in
   Chromium, into
   `release-assets/docs-X.Y.Z.tar.gz`, with `npm run docs:archive`
   ([deployment.md](deployment.md#a-releases-docs-as-an-archive)). git
   ignores the archive, so the release commit leaves it out;
5. commits the five files of steps 2 and 3 to `main` as
   `chore(release): X.Y.Z`, with the notes as the body, and pushes the
   commit with the deploy key ([below](#the-deploy-key));
6. tags that commit `vX.Y.Z` and pushes the tag;
7. makes a GitHub release of the tag, "Solid Memo X.Y.Z", with the
   notes and the archive of its docs, "Documentation X.Y.Z (HTML)": it
   makes the release as a draft, uploads the archive to it, and only
   then publishes it, so a release is never published without its
   docs, and the deploy refuses a draft. Then the workflow attests the
   archive as made by the release workflow on `main` (`actions/attest`),
   so whoever downloads it can check where it came from
   ([deployment.md](deployment.md#a-releases-docs-as-an-archive)). Zenodo,
   connected to the repository, archives each GitHub release and gives
   it a DOI. The concept DOI,
   [10.5281/zenodo.23351087](https://doi.org/10.5281/zenodo.23351087),
   always resolves to the latest release, and is the one in
   `CITATION.cff` and the README.

Zenodo never took `CITATION.cff`'s `url`, so the entry did not name
the website. [`.zenodo.json`](../.zenodo.json) does. It holds the
metadata Zenodo gives each archived release: the title, the
description, the author, the license, the keywords, and links to the
repository and to solid-memo.com. When that file is there, Zenodo
ignores `CITATION.cff`
([Zenodo's help](https://help.zenodo.org/docs/github/describe-software/zenodo-json/)).

Its links replace the one Zenodo makes itself to the release's tag. So
a version's entry links the repository, not the tag; the version, which
Zenodo takes from the tag, still names it.

`CITATION.cff` and `.zenodo.json` say the same things in two formats.
Nothing checks that they agree. A change to one, such as a new keyword
or a new description, is made in the other in the same pull request,
and in `publiccode.yml` where it says the same.

`.zenodo.json` names no version. Zenodo takes it from the release's
tag, so a release writes nothing into it.

The release commit is not marked to skip CI. CI runs on it, and once
it passes, the deploy ships the site that run carries, the build CI
tested, with the new version put in its pages, its footer included
([deployment.md](deployment.md#the-build-ci-tested)); it deploys no
other commit. The release workflow
does not run on it: nothing has been committed since the tag, so it
would release nothing.
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

2.0.0 is one. No commit in it breaks anything, but semantic-release
then read a line of a commit's body that began "breaking change", in
lowercase and with no colon, as a breaking footer, and its changelog
entry lists the rest of that line under "BREAKING CHANGES". Nothing
needs to be done to move from 1.2.0 to 2.0.0. The release now reads
the footer only as written
([what counts as breaking](#what-counts-as-breaking)), and the version
after 2.0.0 says so (#84).

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
workflows as anyone's do. Only the release workflow can use it: its
private key is a secret of the `release` environment, which allows only
`main`. A repository secret can be read by any workflow that runs in the
repository, one pushed on any other branch included, so anyone with
write access could have pushed past the ruleset with it and tagged a
version to be deployed. An environment's secret is read only by a job
that names the environment, in a run on a branch it allows, and
release.yml is the only workflow on `main` that names `release`. That
holds only once no repository secret of the same name is left: a job
whose environment lacks a secret reads the repository's.

The maintainer sets it up once, before the workflow first runs on
`main`, so that the merge that adds it releases 1.0.0 straight away:

1. Make a key pair with no passphrase, outside the repository:

   ```sh
   ssh-keygen -t ed25519 -N "" -C "solid-memo release" -f release-key
   ```

2. Add `release-key.pub` as a deploy key of the repository, with write
   access (Settings › Deploy keys › Add deploy key, "Allow write
   access").
3. Make the environment `release` (Settings › Environments › New
   environment), or open it if a run has made it already: GitHub makes
   one, open to every branch, the first time a run names it. Under
   "Deployment branches and tags", choose "Selected branches and tags"
   and add the branch `main`, and nothing else. Add the private key,
   `release-key`, as its environment secret `SEMANTIC_RELEASE_KEY`.
   Then delete both files, and any repository secret of that name
   (Settings › Secrets and variables › Actions).
4. Add "Deploy keys" to the bypass list of the ruleset on `main`
   (Settings › Rules), so that the release commit needs no pull request.
5. Add a ruleset for tags matching `refs/tags/v*` that restricts their
   creation, update and deletion (Settings › Rules › Rulesets › New
   ruleset › New tag ruleset: enforcement Active, target `v*`), with "Deploy keys" and the Repository
   admin role on its bypass list. The deploy deploys the commit a
   version tag names, so without it anyone with write access could tag
   a commit and have it deployed; the admin's bypass is for tagging by
   hand ([below](#when-a-release-fails)).

Both bypass lists name "Deploy keys", which lets every deploy key with
write access past them, not only this one. So this key stays the
repository's only deploy key with write access: any other is added
without "Allow write access".

The job holds the key for as little as it can. The checkout keeps no
credentials, so the key is not in the git config while the job
installs the dependencies and Chromium. `npm ci --ignore-scripts`
runs no package's install script: the release needs none, and
Chromium comes from the job's own step (`npx playwright install`), not
from one. Only the step that runs semantic-release reads the secret.
It writes the key to a file that git's `ssh` reads (`GIT_SSH_COMMAND`),
with GitHub's host keys from its API, and removes the file when the
step ends. semantic-release checks that it can push before anything
else, and pushes in its prepare step, so the key stays there for the
whole run.

That run also draws the docs' diagrams for the release's archive: it
runs Chromium, through Playwright, and Mermaid on the repository's own
docs while the key is there. That is accepted. Both are pinned
development dependencies whose updates Renovate proposes and CI checks
like any other change ([vendor-code.md](vendor-code.md)), and they read
only what is committed on `main`. Renovate merges its updates there
with no person reviewing them
([GOVERNANCE.md](../GOVERNANCE.md#dependency-updates)), so they reach
`main` only once their version has been public for 3 days, which gives
a bad version time to be found and pulled. Every action the workflows
use is pinned to a commit, not to a tag, which could be moved
(`npm run check:actions`, [testing.md](testing.md#the-repositorys-own-checks)).
The other way was to build the archive in a job of its own, without the
key, and attach it with the run's token. It was not taken, because
semantic-release would then publish the release before its archive
existed, and the deploy would serve the version without its docs.

Without the secret, the workflow says so and releases nothing; once
it is set, run the workflow by hand ([below](#when-a-release-fails)) to
release what is waiting. To
change the key, add the new one as a deploy key, replace the
environment's secret, then delete the old deploy key.

## When a release fails

The workflow's run says which step failed and why, and nothing opens
an issue or comments on one. Fix the cause, then run the workflow by
hand (Actions › Release › Run workflow, from `main`): it releases
`main`'s tip once CI has passed on it, and refuses before that. The
next push to `main` that passes CI also tries again.

- **Before the push** (a wrong configuration, a file the release could
  not write, docs that could not be rendered or drawn, Chromium that
  would not start): nothing was pushed, and the next run releases as if
  nothing had happened.
- **The push was refused**: `main` moved on while the release ran, or
  the deploy key, its secret in the `release` environment or the bypass
  is missing. Nothing was tagged; the next run releases from the new
  tip.
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
  deployed nothing. Once the GitHub release is made, run it by hand
  (Actions › Deploy to GitHub Pages › Run workflow, from `main`), and
  it deploys the version just tagged ([deployment.md](deployment.md)).
  It deploys nothing, and fails, if the tag names any commit but
  `chore(release): X.Y.Z`, or if the GitHub release is missing.

- **CI failed on the release commit**: the version is released but not
  deployed. When the run reuses the one that tested its parent, nothing
  that tests code runs there
  ([What each stage checks](#what-each-stage-checks)), so the failure is
  the `gate`'s, which refuses a release commit that changes more than
  the version's files, `release-files`', which lints them, `reuse`'s,
  which takes over the tested run's site, or `journeys-report`'s, which
  merges the tested run's journeys. A lint that fails is fixed in a pull
  request of its own, which the next release ships; a `reuse` or a
  `journeys-report` that failed on its download is run again: re-run
  CI's failed jobs on that commit, and once the run passes, the deploy
  follows as usual. When every job ran instead (CI had not passed the
  parent on `main`, or an artifact the run would take over had
  expired), a failure there is met as on any push to `main`: a flaky
  job is re-run, and its flake fixed in a pull request of its own. Or run the deploy by
  hand, which checks the version itself. Either deploys the version
  only while it is the newest: once a newer one is released, the deploy
  after a re-run deploys nothing, and says so, and the site stays on
  the newer version.

- **After the tag** (the GitHub release could not be made): the release
  commit and the tag are on `main`, so a new run finds nothing to
  release. The deploy after CI on the release commit fails, as the
  version has no GitHub release, and deploys nothing. Make the GitHub
  release from the tag by hand, as a draft, with the version's entry
  in CHANGELOG.md as its notes:

  ```sh
  gh release create vX.Y.Z --draft --title "Solid Memo X.Y.Z" --notes-file notes.md
  ```

  Then attach its docs and publish it, as for a failed upload, below.
- **The release is a draft without its docs** (the archive's upload
  failed), **or its docs are not attested** (the attestation step
  failed): the release commit and the tag are on `main`, so a new run
  finds nothing to release. The deploy refuses a draft, so it deploys
  nothing; a published release whose archive is not attested deploys
  as usual, and only its archive lacks the attestation. Run the
  workflow by hand from `main` with the version's tag (Actions ›
  Release › Run workflow, "tag" `vX.Y.Z`), while no Release run is
  running or waiting: the `docs` job has a
  concurrency group of its own, so it does not wait for one, and it
  marks the version latest when it is the newest tag, which a release
  made while it runs would leave wrong. The job renders the docs from
  the tag, draws them, attests the archive as the release does, attaches
  it with the run's token, and publishes the release; it does not use
  the deploy key. A release that already carries an archive keeps it
  when it is attested, and the job then only publishes it if it is
  still a draft; one that is not attested is rendered again and
  replaced. For a draft, then run the deploy by hand (Actions › Deploy
  to GitHub Pages › Run workflow, from `main`), and it deploys the
  version. Do
  not upload the archive by hand: only this workflow can attest it as
  made on `main`, as the release and the `docs` job do
  ([deployment.md](deployment.md#a-releases-docs-as-an-archive)).

A tag is never moved or deleted, even one whose release went wrong:
Zenodo and anyone who fetched it may already hold it.
