# Releasing

How Solid Memo's versions are chosen, what a version promises, and what
a release does. [semantic-release](https://semantic-release.gitbook.io/)
releases each version; nobody releases one by hand. After CI passes on a
push to `main`, it reads the commits since the last version and releases
the next one when any of them is releasable. Only a version is deployed
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
| Major (1.4.2 → 2.0.0) | Anything breaking ([below](#what-counts-as-breaking)) | `!` after the type, or a `BREAKING CHANGE:` footer | A deck format 8 the app writes; a configuration variable renamed |
| Minor (1.4.2 → 1.5.0) | A new feature | `feat` | A new screen; a new deck in the library; a new configuration variable |
| Patch (1.4.2 → 1.4.3) | Fixes, and changes nobody has to act on | `fix`, `perf`, `revert` (or GitHub's `Revert "…"`) | A bug fixed; a translation corrected; a dependency the app ships updated |
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

- **A new format version the app writes**
  ([migrations.md](migrations.md)). The app brings older data up to it,
  but an older app then refuses to save over what the newer one wrote
  (`writtenByNewerApp`, [data-model.md](data-model.md)) and refuses a
  deck file in the newer format (`deckFileTooNew`).
- **Data the app stops reading**: dropping the migration from an older
  format, so a pod never updated can no longer be opened.
- **A move of the data in the pod**: another folder, another type index
  registration, other document names.
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
version. A term a shape gains, even an optional one, goes in the
shape's next version, since a published shape is never edited: a new
format version, and so breaking. A breaking change is agreed in an issue
first ([CONTRIBUTING.md](../CONTRIBUTING.md#open-an-issue-first)) and
says so in its commit, with `!` and a `BREAKING CHANGE:` footer that
tells users what to do.

The release reads the footer only as written: `BREAKING CHANGE:` or
`BREAKING-CHANGE:` at the start of a line, in capitals and with its
colon, as commitlint and `npm run check:breaking` read it
([release.config.mjs](../release.config.mjs)'s `parserOpts`). A body
line that begins "breaking change" in a sentence isn't a footer.

## How CI holds to it

[`api/`](../api/README.md) holds the public API, one promise a line: the
formats the app writes and reads, where data lives in a pod, the hashes,
what the app keeps in the browser and what a copy relies on. `api/frozen/` holds the
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
  value is still read.
- **A line of `api/frozen/` gone** fails the check, whatever the
  commits say: a published address keeps answering, a published shape
  is never edited, a term is never taken back.
- **A commit that says it breaks** while no line went is noted, and
  passes: removing a feature changes no file.

A line added needs nothing. Review covers what no file can hold: a
feature removed, or a reader that keeps its format but reads less of it.

## What has versions of its own

The data that other apps and pods rely on has versions of its own, by
its own rules, and none follows the app's number:

| What | Its version | Rules |
|---|---|---|
| The vocabulary | `v1` in its IRI, and `owl:versionInfo` (1.26) in [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) | Terms are only added ([vocab.md](vocab.md#versioning-policy)) |
| The shapes | `ns/shapes/<class>/v<N>.ttl`, one file per format version | A published version is never edited ([shapes.md](shapes.md)) |
| Format versions | `sm:formatVersion` on every subject the app writes | [migrations.md](migrations.md) |
| The library's decks | `decks/<name>/v<N>.ttl` | A published version is never edited ([deck-library.md](deck-library.md#publishing-a-new-version)) |

The commit's subject names what it adds, so the changelog does too:
"write deck format 8", "add a term to vocabulary 1.21".

## The changelog

The release writes [CHANGELOG.md](../CHANGELOG.md), each version's
entry under the file's header, newest first. `feat` commits go under
"Features", `fix` commits under "Bug Fixes", and so on, each line a
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
| The merge queue (`merge_group`) | every job, at full strength; a flaky check is fixed here, not retried |
| A push to `main` the merge queue passed | the queue's run is reused: its site and Turbo's cache are taken over |
| A push to `main` that skipped the queue | every job, as in the queue |
| A release commit | when CI passed its parent on `main`, the run that tested the parent is reused and the commit's own files are linted; otherwise every job |
| A run by hand | every job |

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
when CI has passed on a push to `main` in this repository. It runs
semantic-release ([release.config.mjs](../release.config.mjs)) on
`main`'s tip. When `main` has moved on since the commit CI passed on,
it releases the tip only if CI has passed on it too, and otherwise
leaves it to the tip's own run. When there is something to release,
semantic-release:

1. chooses the version from the commits since the last tag
   ([The scheme](#the-scheme)), and writes its notes;
2. writes the notes into CHANGELOG.md;
3. sets the version in the root `package.json` and `package-lock.json`,
   and the version and today's date in
   [`publiccode.yml`](../publiccode.yml) (`softwareVersion`,
   `releaseDate`) and [`CITATION.cff`](../CITATION.cff) (`version`,
   `date-released`), with `npm run release:version`
   ([releaseVersion.ts](../scripts/releaseVersion.ts));
4. renders the version's docs as pages, every diagram drawn in
   Chromium, into `release-assets/docs-X.Y.Z.tar.gz`, with
   `npm run docs:archive`
   ([deployment.md](deployment.md#a-releases-docs-as-an-archive)). git
   ignores the archive, so the release commit leaves it out;
5. commits the five files of steps 2 and 3 to `main` as
   `chore(release): X.Y.Z`, with the notes as the body, and pushes the
   commit with the deploy key ([below](#the-deploy-key));
6. tags that commit `vX.Y.Z` and pushes the tag;
7. makes a GitHub release of the tag, "Solid Memo X.Y.Z", with the
   notes and the archive of its docs, "Documentation X.Y.Z (HTML)". It
   makes the release as a draft, which the deploy refuses, uploads the
   archive, then publishes it, and attests the archive as made by the
   release workflow on `main` (`actions/attest`).

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

Once CI passes on the release commit, which isn't marked to skip CI, the
deploy ships the site that run carries, with the new version in its
pages and footer ([deployment.md](deployment.md#the-build-ci-tested)),
and deploys no other commit. The release workflow doesn't run on a
release commit. CI's run on a release commit has a concurrency group of
its own, so a newer push to `main` can't replace it while it waits
([testing.md](testing.md#continuous-integration)).

Releases go one at a time (concurrency group `release`), and a running
one is never canceled. GitHub keeps only one run waiting in the group:
a newer one replaces it, and whichever goes ahead releases the tip. A
fork, or a copy without the deploy key, runs the workflow and releases
nothing.

A release made by mistake isn't taken back
([below](#when-a-release-fails)); the next version fixes the mistake.

2.0.0 is one such release: no commit in it breaks anything, and nobody
has to act to move from 1.2.0 to 2.0.0. At the time, semantic-release
read a body line that began "breaking change", in lowercase and with no
colon, as a breaking footer, and its changelog entry lists the rest of
that line under "BREAKING CHANGES". The release now reads the footer
only as written ([what counts as breaking](#what-counts-as-breaking)),
and the version after 2.0.0 says so (#84).

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

The job holds the key briefly:

- The checkout keeps no credentials, so the key isn't in the git config
  while the job installs the dependencies and Chromium.
- `npm ci --ignore-scripts` runs no package's install script; Chromium
  comes from the job's own step (`npx playwright install`).
- `npm audit signatures` runs next, before Chromium is downloaded and
  semantic-release runs with the key. It fails unless every installed
  version from a registry has the registry's valid signature, and any
  attestation it has, such as its provenance, verifies
  ([testing.md](testing.md#the-workflows)). It checks the registry's
  record of each version, not the lockfile's hashes or the files
  installed. A valid signature proves a version is one the registry
  published, not that it's safe: a hijacked maintainer account still
  publishes a validly signed version.
- Nothing comes from GitHub's cache: not npm's cache, not Chromium,
  and not its system libraries, which come from Ubuntu's signed mirror
  (the Chromium action's `cache: false`). Any job on `main` can write
  `main`'s cache entries, so a file restored from them could carry code
  from the least trusted of those jobs into this one. The release
  workflow's `docs` job restores nothing either, as it attests what it
  renders. It installs Chromium and its libraries with its own step
  (`npx playwright install --with-deps`), not the Chromium action:
  that action comes from the tag's checkout, and an older tag's copy
  restores them from the cache.
- Only the step that runs semantic-release reads the secret. It writes
  the key to a file that git's `ssh` reads (`GIT_SSH_COMMAND`), with
  GitHub's host keys from its API, and removes the file when the step
  ends. semantic-release checks that it can push before anything else
  and pushes in its prepare step, so the key stays for the whole run.

That step runs Chromium, through Playwright, and Mermaid on the
repository's docs while the key is there, to draw the archive's
diagrams. Both are pinned development
dependencies that read only what is committed on `main`. Renovate
proposes their updates, CI checks them ([vendor-code.md](vendor-code.md)),
and Renovate merges them on `main` with no person reviewing them once
their version has been public for 3 days, so a bad version can be
found and pulled first
([GOVERNANCE.md](../GOVERNANCE.md#dependency-updates)). The wait holds
for every package an update newly locks, not only the one it names:
the repository's `.npmrc` files set npm's `min-release-age` to 3 days,
and its `uv.toml` sets uv's `exclude-newer` to 3 days. Every action
the workflows use is pinned to a commit, since a tag can be moved
(`npm run check:actions`,
[testing.md](testing.md#the-repositorys-own-checks)), and a person
merges each update to one, which Renovate leaves waiting. The archive isn't
built in a separate job without the key and attached with the run's
token: semantic-release would then publish the release before its
archive existed, and the deploy would serve the version without its
docs.

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
that passes CI tries again.

- **Before the push** (a wrong configuration, a file the release
  couldn't write, docs that couldn't be rendered or drawn, Chromium
  that wouldn't start): nothing was pushed, and the next run releases
  as usual.
- **The push was refused**: `main` moved on while the release ran, or
  the deploy key, its secret in the `release` environment or the bypass
  is missing. Nothing was tagged, and the next run releases from the
  new tip.
- **The release commit is on `main`, but not its tag** (the tag's push
  failed): every run of the workflow stops with an error that names the
  commit until it's tagged. That stops semantic-release from releasing
  the same version again on top of it. Only a commit semantic-release
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

- **After the tag** (the GitHub release couldn't be made): a new run
  finds nothing to release, and the deploy after CI on the release
  commit fails, as the version has no GitHub release. The maintainer
  makes the GitHub release from the tag by hand, as a draft, with the
  version's entry in CHANGELOG.md as its notes:

  ```sh
  gh release create vX.Y.Z --draft --title "Solid Memo X.Y.Z" --notes-file notes.md
  ```

  The maintainer then attaches its docs and publishes it, as below.
- **The release is a draft without its docs** (the archive's upload
  failed), **or its docs aren't attested** (the attestation step
  failed): a new run finds nothing to release. The deploy refuses a
  draft; a published release whose archive isn't attested deploys as
  usual, missing only the attestation. The maintainer runs the workflow
  by hand from `main` with the version's tag (Actions › Release › Run
  workflow, "tag" `vX.Y.Z`), while no Release run is running or
  waiting. That run's `docs` job has its own concurrency group, so it
  doesn't wait for a Release run. It marks the version latest when
  it's the newest tag, and a release made while it runs would leave
  that wrong. The job renders
  the docs from the tag, draws them, attests the archive, attaches it
  with the run's token, and publishes the release if it's still a
  draft, without the deploy key. It keeps an attested archive already on
  the release, and renders and replaces one that isn't.
  For a draft, the maintainer then runs the deploy by hand (Actions ›
  Deploy to GitHub Pages › Run workflow, from `main`). The archive is
  never uploaded by hand: only this workflow can attest it as made on
  `main` ([deployment.md](deployment.md#a-releases-docs-as-an-archive)).

A tag is never moved or deleted once pushed, even one whose release
went wrong: Zenodo and anyone who fetched it may already hold it.
