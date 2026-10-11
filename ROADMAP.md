# Roadmap

What Solid Memo is working on, and what it is not. It is a volunteer
project with one maintainer ([GOVERNANCE.md](GOVERNANCE.md)), so this is
a direction, not a schedule: items move as time allows, and nothing here
has a date.

Solid Memo is in beta. It works, and its data formats are versioned and
migrated with care ([docs/migrations.md](docs/migrations.md)), but the app
can still change in ways a user notices.

## Now

- **Meeting the Standard for Public Code.** Contribution and governance
  files, CI on every pull request, a policy and a privacy page, links to
  the source code and the issue tracker from the app, and metadata that
  catalogs can read. The assessment and its plan are in
  [docs/standard-for-public-code.md](docs/standard-for-public-code.md).
- **The first tagged release**, v0.1.0, with a changelog.

## Next

- **Running your own copy.** The pod providers offered at sign-up and
  the app's name set by configuration, with a guide to hosting Solid Memo
  elsewhere ([docs/deployment.md](docs/deployment.md)).
- **A project contact in decks.** Future deck versions name the issue
  tracker as their contact point, instead of a person's email address.
  Published versions stay as they are.
- **Native speakers' corrections** to the Korean, German, Spanish and
  French translations, which were made with the help of AI
  ([docs/i18n.md](docs/i18n.md#translations)).
- **A second reviewer**, so that no change is merged by its own author
  alone ([GOVERNANCE.md](GOVERNANCE.md#merging)).
- **License headers.** A machine-readable license on every file.
- **Guides for learners**: studying, statistics, the library and the
  courses, in plain words.

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
