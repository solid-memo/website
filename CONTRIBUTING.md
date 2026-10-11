# Contributing

Solid Memo welcomes contributions from anyone: a bug report, an idea, a
deck, a translation, a report from your own Solid server, or code. This
page says how to make one, and what happens to it.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
How decisions are made is in [GOVERNANCE.md](GOVERNANCE.md); what is
planned is in [ROADMAP.md](ROADMAP.md).

**Found a security issue?** Do not open an issue. Report it privately, as
[SECURITY.md](SECURITY.md) says.

## Ways to contribute

- **Report a bug or suggest a feature.** Open an
  [issue](https://github.com/solid-memo/website/issues/new/choose) and pick
  the form that fits. Questions and open-ended ideas go to
  [Discussions](https://github.com/solid-memo/website/discussions).
- **Propose or correct a deck.** The ready-made decks live in `decks/`,
  described in [docs/deck-library.md](docs/deck-library.md). A deck can be
  written in the Studio and downloaded as a release file, which comes with
  the steps of a pull request ([docs/studio.md](docs/studio.md#publishing-a-release)).
  Open a "Deck or course" issue first, so we can agree on the subject and
  the license.
- **Write or improve a course.** A course is a library deck with chapters
  and steps ([docs/courses.md](docs/courses.md#writing-a-course)).
- **Translate.** The app speaks English, Swedish, Korean, German, Spanish
  and French. Korean, German, Spanish and French were translated with the
  help of AI, and corrections from native speakers are welcome
  ([docs/i18n.md](docs/i18n.md#translations)). A new language follows
  [Adding a language](docs/i18n.md#adding-a-language).
- **Report how Solid Memo works with your Solid server.** Use the "Interop
  report" form. The servers the tests already run against are listed in
  [docs/testing.md](docs/testing.md).
- **Change the code.** Start with [docs/architecture.md](docs/architecture.md)
  and the index of the docs, [docs/README.md](docs/README.md).

## Open an issue first

Open an issue, and wait for a reply, before you change:

- the vocabulary in `ns/vocab/` ([docs/vocab.md](docs/vocab.md)),
- the shapes in `ns/shapes/` ([docs/shapes.md](docs/shapes.md)),
- the decks in `decks/` ([docs/deck-library.md](docs/deck-library.md)),
- the format of what the app writes to a pod ([docs/migrations.md](docs/migrations.md)).

Pods, other apps and copies of decks depend on these, so a change is
hard to take back. Published versions are never edited: a published
`decks/*/vN.ttl` or `ns/shapes/*/vN.ttl` stays as it is, and a change ships
as the next version. A small fix elsewhere, such as a typo or an obvious
bug, needs no issue.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Set up as the [README](README.md#develop) says: Node 24 and npm, with
   Docker for the end-to-end tests. The
   [dev container](.devcontainer/devcontainer.json) has everything.
   Run `npm ci`.
3. Make the change, with its tests and its docs. Run the app with
   `npm run dev` and try it.
4. Check that the change is done, as **Done** in [AGENTS.md](AGENTS.md)
   defines it. That list applies to people and agents alike: it says
   which commands must pass and which files are generated.
5. Open a pull request against `main`, and fill in its template.

The code follows the [style guide](docs/style.md), the
[import rules](docs/boundaries.md) and the [testing policy](docs/testing.md):
100% coverage in every package, and new code ships with its tests.

**Text formats.** Keep the repository diff-friendly: code in TypeScript,
data in Turtle, docs in Markdown, configuration in JSON or YAML. Do not
commit binary documents, such as word-processor files or spreadsheets.
An image is committed only when the app shows it.

## Commit messages

Each commit records a decision, so its message says what and why:

- **Subject:** imperative, phrased as what the project or its user gains,
  for example "Choose the language from a list, and write numbers as the
  language does".
- **Body:** why the change was made, and what was weighed. A commit with
  no body is fine only when the subject says it all.
- **Trailer:** `Refs: #NN` when an issue or a discussion exists for the
  change.
- **One logical change per commit.** Generated files go in the same
  commit as the change that generated them, and a new deck version goes
  in the same commit as the library index.

A pull request addresses one issue. Two unrelated fixes are two pull
requests.

## Review

Solid Memo is run by volunteers, with no funding: reviewing is done in
their own time, at their own cost. A reviewer reads the code, the
tests, the docs and any change of policy (the external rules the code
follows), and runs the app when the change shows in it.

- We aim to respond to an issue or a pull request within two business
  days. That is a target, not a promise.
- A contribution that is declined or closed always gets a written
  reason.
- Every pull request must pass CI before it is merged.

The review of a deck or a course looks at its form: that the library's
checks pass, and that its license and its sources are stated. It does
not check the facts on the cards; the deck's provenance says how they
were researched and checked
([docs/deck-library.md](docs/deck-library.md#provenance)).

The project has one maintainer for now, so a contribution is reviewed by
him. His own pull requests are merged without a second reviewer, as a
known, temporary exception ([GOVERNANCE.md](GOVERNANCE.md#merging)). If
you would like to review, say so in an issue or in Discussions.

## Licensing

Contributions are accepted under the license they are published under:
the [MIT License](LICENSE), for everything in the repository, `docs/` and
`ns/` included, unless a file says otherwise. A deck carries its own
license in `dcterms:license`, and the vendored shapes keep theirs. By
opening a pull request, you agree that your contribution is licensed
that way. There is no contributor license agreement, and you keep your
copyright.

Only contribute what you have the right to: your own work, or work under
a license compatible with the file it goes into. Name the source of a
deck's content in its provenance ([docs/deck-library.md](docs/deck-library.md#provenance)).

## Language

English is the authoritative language of the code, the docs and the
discussions. Write in plain English with American spelling ("license",
"color", "organize"). A translation of the app follows the English
messages in `packages/ui/src/i18n/en.json`.
