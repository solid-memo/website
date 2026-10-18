# Roadmap

What Solid Memo is working on, and what it is not. It is a volunteer
project with one maintainer ([GOVERNANCE.md](GOVERNANCE.md)), so this is
a direction, not a schedule: items move as time allows, and nothing here
has a date.

Solid Memo is stable from version 1.0.0: its data formats are versioned
and migrated with care ([docs/migrations.md](docs/migrations.md)), and a
change that breaks what users, other apps or copies rely on comes with
a new major version ([docs/releasing.md](docs/releasing.md)).

## Now

- **Meeting the Standard for Public Code.** The repository's settings
  are done: Discussions and private vulnerability reporting are on,
  `main` requires the `ci-ok` check before a merge, and 1.0.0 is
  released, with its DOI. What is left is findability, and a second
  reviewer.
  The assessment and what remains are in
  [docs/standard-for-public-code.md](docs/standard-for-public-code.md).

## Next

- **Native speakers' corrections** to the Korean, German, Spanish and
  French translations, which were made with the help of AI
  ([docs/i18n.md](docs/i18n.md#translations)).
- **A second reviewer**, so that no change is merged by its own author
  alone ([GOVERNANCE.md](GOVERNANCE.md#merging)).

## Done recently

These are done. Those since 1.0.0 come first; the rest are part of
1.0.0. Every version is in the [changelog](CHANGELOG.md).

- Pull requests merged through GitHub's merge queue, so `main` only
  gets a commit whose checks passed
  ([docs/testing.md](docs/testing.md#the-merge-queue)).
- The public API written down in [`api/`](api/README.md), and a check
  that fails a change to it that no commit calls breaking
  ([docs/releasing.md](docs/releasing.md#how-ci-holds-to-it)).
- Commit checks: every commit says why and names its issue, and a pull
  request names the issue it closes
  ([CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)).
- Only the latest version is deployed, and only the release workflow on
  `main` can read the key that releases it
  ([docs/releasing.md](docs/releasing.md#the-deploy-key)).
- These docs as a website, at `/docs/`, with each release's own
  ([docs/deployment.md](docs/deployment.md#each-releases-docs)).
- The journeys run in Firefox, WebKit and on a phone too, and check
  each screen they visit with axe, against the target in
  [docs/accessibility.md](docs/accessibility.md)
  ([docs/testing.md](docs/testing.md#browsers)).
- Four Arabic decks, and text written right to left, such as Arabic,
  shown in its own direction
  ([docs/i18n.md](docs/i18n.md#text-in-the-users-languages)).
- Everyday Korean phrases, and Korean at the Table, a course in
  dialogues around food ([docs/deck-library.md](docs/deck-library.md)).
- In a study session, undo the last answer, see under each grade how
  long the card would wait, and report a mistake in a card
  ([docs/user-guide.md](docs/user-guide.md#studying)).
- A link to a library deck that anyone can open, as a guest if need be
  ([docs/guest-mode.md](docs/guest-mode.md#from-a-link)).
- A lasting copy of the code in
  [Software Heritage](https://archive.softwareheritage.org/browse/origin/?origin_url=https://github.com/solid-memo/website),
  which preserves public source code and keeps adding the project's
  new commits. Development goes on here as before.
- The first release, 1.0.0, made by semantic-release from the commits,
  with its [changelog](CHANGELOG.md)
  ([docs/releasing.md](docs/releasing.md)).
- Links from every screen to the source code and the issue tracker.
- Running your own copy, with its pod providers and its name set by
  configuration ([docs/configuration.md](docs/configuration.md),
  [docs/reuse.md](docs/reuse.md)).
- A project contact in new deck versions, in place of an email address
  ([docs/deck-library.md](docs/deck-library.md#contact)).
- A machine-readable license on every file
  ([docs/style.md](docs/style.md#licenses)).
- Guides for learners ([docs/user-guide.md](docs/user-guide.md),
  [docs/statistics.md](docs/statistics.md),
  [docs/browsing.md](docs/browsing.md)).

## Later

- **More languages for the app**: Dutch, Portuguese, Japanese, Italian,
  Ukrainian or Polish, and Simplified Chinese. Right-to-left languages
  come after those.
- **The Community Solid Server 8** as a blocking server in the tests once
  8.0.0 is out, in place of 6 ([docs/testing.md](docs/testing.md)).
- **More decks and courses** in the library
  ([docs/deck-library.md](docs/deck-library.md)), proposed by anyone.
- **Listing Solid Memo** in the Solid project's catalog of apps.

## Out of scope

- **A server that keeps learners' data.** A learner's decks, cards and
  reviews stay in their own pod. Solid Memo is a static site, and that
  will not change.
- **Editing a published version** of a deck, a shape or the vocabulary.
  A change is always a new version, because pods and other apps depend
  on the old one ([GOVERNANCE.md](GOVERNANCE.md#publishing-versions)).

## Proposing an item

Open a [feature request](https://github.com/solid-memo/website/issues/new/choose),
or start a thread in [Discussions](https://github.com/solid-memo/website/discussions)
if the idea is still open. Say what you want to do and why. The
maintainer decides what goes on this roadmap, and explains the decision
in the issue ([CONTRIBUTING.md](CONTRIBUTING.md)).
