# Roadmap

What Solid Memo is working on, and what it is not. It is a volunteer
project with one maintainer ([GOVERNANCE.md](GOVERNANCE.md)), so this is
a direction, not a schedule: items move as time allows, and nothing here
has a date.

Solid Memo is in beta. It works, and its data formats are versioned and
migrated with care ([docs/migrations.md](docs/migrations.md)), but the app
can still change in ways a user notices.

## Now

- **Meeting the Standard for Public Code.** The repository's settings
  are done: Discussions and private vulnerability reporting are on, and
  `main` requires the `ci-ok` check before a merge. What is left is the
  first tagged release with its DOI, findability, and a second reviewer.
  The assessment and what remains are in
  [docs/standard-for-public-code.md](docs/standard-for-public-code.md).
- **The first tagged release**, v0.1.0, with its
  [changelog](CHANGELOG.md) ([docs/releasing.md](docs/releasing.md)).

## Next

- **Native speakers' corrections** to the Korean, German, Spanish and
  French translations, which were made with the help of AI
  ([docs/i18n.md](docs/i18n.md#translations)).
- **A second reviewer**, so that no change is merged by its own author
  alone ([GOVERNANCE.md](GOVERNANCE.md#merging)).

## Done recently

These were on the roadmap and are done. They are part of 0.1.0
([CHANGELOG.md](CHANGELOG.md)):

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
- **A persistent identifier** for each release, and an archive of the
  code in Software Heritage.
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
