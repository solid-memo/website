# Contributing

Solid Memo welcomes contributions from anyone: a bug report, an idea, a
deck, a translation, a report from your own Solid server, or code. This
page says how to make one, and what happens to it.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
How decisions are made is in [GOVERNANCE.md](GOVERNANCE.md); what is
planned is in [ROADMAP.md](ROADMAP.md).

**Talk in writing, in public.** The project talks only in issues,
Discussions, pull requests and their reviews, and commit messages. It
has no chat and no calls, and something said elsewhere decides nothing
until it is written up in one of them. Security and code of conduct
reports are the only private exceptions
([GOVERNANCE.md](GOVERNANCE.md#where-the-project-talks)).

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
  and the index of the docs, [docs/README.md](docs/README.md). A term
  you don't know is in [docs/glossary.md](docs/glossary.md).

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
   Run `npm ci`, and `npm run browsers` once: `npm run check` draws the
   docs' diagrams in Chromium, which it installs (on Linux, with the
   system libraries it needs, which takes `sudo`).
3. Make the change, with its tests and its docs. Run the app with
   `npm run dev` and try it.
4. Check that the change is done, as **Done** in [AGENTS.md](AGENTS.md)
   defines it. That list applies to people and agents alike: it says
   which commands must pass and which files are generated.
5. Open a pull request against `main`, and fill in its template.

The code follows the [style guide](docs/style.md), the
[import rules](docs/boundaries.md) and the [testing policy](docs/testing.md):
100% coverage in every package, and new code ships with its tests.
[Biome](https://biomejs.dev/) formats and lints the code: run
`npm run format` before you commit, and `npm run check` fails on what it
would still change ([docs/style.md](docs/style.md#formatting)).

**Text formats.** Keep the repository diff-friendly: code in TypeScript,
data in Turtle, docs in Markdown, configuration in JSON or YAML. Do not
commit binary documents, such as word-processor files or spreadsheets.
An image is committed only when the app shows it.

## Commit messages

Each commit records a decision, so its message says what and why. From
version 1.0.0 on, every commit follows
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/),
Renovate's included: the release reads the messages to choose the next
version and to write the changelog ([docs/releasing.md](docs/releasing.md)).
CI's `commits` job lints a pull request's commits with commitlint
([commitlint.config.mjs](commitlint.config.mjs)), and
`npm run lint:commits` lints your branch's before you push. Both check
that every commit has a body and names its issue, and both refuse a
merge commit, which commitlint does not lint: update your branch by
rebasing it on `main`. `npm run lint:commits` lints the commits since
`origin/main`, so from a fork, sync the fork's `main` with this
repository's first, or run
`npx commitlint --from upstream/main --to HEAD`, with `upstream` the
remote that names this repository.

```text
feat(studio): check a draft's links before it is published

A release with a link that does not answer leaves the learner with a
card that points nowhere, and a published release cannot be edited.
The check runs when the author publishes, not on every save, so a
draft can still hold a link that is not up yet.

Closes: #42
```

- **Header:** `type(scope): subject`. The scope is optional, and names
  the part of the project, such as `studio`, `i18n`, `decks`, `ns` or
  `deps`. The subject is in the imperative, starts with a lowercase
  word and has no period at the end. The whole header is at most 100
  characters. It says what the project or its
  user gains, not which files changed: "keep a deck's title in every
  language, shown in the reader's", not "update deck.ts".
- **Type:** one of these, by what the change is for users, and so for
  the version:

  | Type | For | Releases |
  |---|---|---|
  | `feat` | Something users, other apps or people who run their own copy can do that they could not | A minor version (1.1.0) |
  | `fix` | Something that did not work as it should, a dependency the app ships updated included (`fix(deps)`) | A patch (1.0.1) |
  | `perf` | The same, faster or lighter | A patch |
  | `revert` | A commit taken back | A patch |
  | `docs` | The docs alone | Nothing |
  | `test` | The tests alone | Nothing |
  | `refactor` | The code, with nothing changed for users | Nothing |
  | `style` | Formatting alone | Nothing |
  | `build` | The build, the scripts and the development tools | Nothing |
  | `ci` | The workflows | Nothing |
  | `chore` | Anything else, such as a development tool updated (`chore(deps)`) | Nothing |

  A new deck, or a new version of one, is a `feat(decks)`: learners see
  it in the library. The site runs only released versions, so a change
  whose type releases nothing reaches it with the next version
  ([docs/deployment.md](docs/deployment.md)).
- **Body:** after a blank line, why the change was made, and what was
  weighed, wrapped near 72 columns. Every commit has one, and
  commitlint refuses a commit without it.
- **Breaking change:** a change that someone has to act on, or loses
  something by ([docs/releasing.md](docs/releasing.md#what-counts-as-breaking)),
  adds `!` after the type or scope (`feat(ns)!:`), and a
  `BREAKING CHANGE:` footer that says what breaks and what to do about
  it; commitlint refuses one without the other. It releases a major
  version (2.0.0), so it needs an issue first.
- **Footers:** after a blank line, `Closes: #NN` (or `Fixes: #NN`,
  `Resolves: #NN`), naming the issue the change finishes; only these
  keywords make GitHub close the issue when the change reaches `main`.
  `Refs: #NN` names an issue or discussion without closing it: one the
  change relates to, or one that a series of pull requests finishes
  over time. `Co-Authored-By:` follows for each co-author. commitlint
  refuses a commit that names no issue, pull request or discussion by
  its number (`#NN`) anywhere in its message. If your change has no
  issue, open one first, or open the pull request and then amend the
  commit to name it (`Closes: #NN`) and push again.
  Renovate's updates are the one exception: a commit cannot name a pull
  request that has no number yet, so its body ends with the `Why:` line
  of `commitBody` in [renovate.json5](renovate.json5), and its merge
  commit names the pull request.
- **One logical change per commit.** Generated files go in the same
  commit as the change that generated them, and a new deck version goes
  in the same commit as the library index.

A pull request addresses one issue. Two unrelated fixes are two pull
requests. It closes the issue: its body, or one of its commits, says
`Closes: #NN` (or `Fixes:`, `Resolves:`), and CI's `commits` job fails
a pull request where neither does (`npm run check:closes`). A pull
request that is one step of its issue, and leaves it open, says
`Refs: #NN` in its body instead and checks the template's "One step"
box. Renovate's pull requests, which have no issue, are left out. The
job reads the body when it runs, so after you edit the body, run the
job again.

## Review

Solid Memo is run by volunteers, with no funding: reviewing is done in
their own time, at their own cost. A reviewer reads the code, the
tests, the docs and any change of policy (the external rules the code
follows), and runs the app when the change shows in it.

A reviewer checks that:

- the change keeps to the layers of
  [docs/architecture.md](docs/architecture.md) and the import rules of
  [docs/boundaries.md](docs/boundaries.md);
- it is written as [docs/style.md](docs/style.md) says, and follows the
  standards in [docs/standards.md](docs/standards.md) and the rules in
  [docs/policy.md](docs/policy.md);
- it agrees with what was decided before, in issues, in Discussions and
  in commit messages ([GOVERNANCE.md](GOVERNANCE.md#how-decisions-are-made));
- the source, any change of policy, the tests and the docs are all
  reviewed, not the code alone, and the docs say what the code now
  does;
- for a change users see, the tests pass when the reviewer runs them,
  and the change works when the reviewer tries it in the app.

What a contributor can expect:

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

Every file says so in a machine-readable way, as
[REUSE](https://reuse.software/) has it: a new source file starts with
the SPDX header, and a new deck is listed in [REUSE.toml](REUSE.toml)
under the license it states. [docs/style.md](docs/style.md#licenses)
says how. `npm run lint:reuse` checks it (it needs the
[reuse](https://reuse.software/) tool: `pipx run reuse lint`, or
`uv run --no-project --with reuse reuse lint`, without installing it),
and so does CI; `npm run check` checks only that each deck is listed
under the license it states.

## Language

English is the authoritative language of the code, the docs and the
discussions. Write in plain English with American spelling ("license",
"color", "organize"); `npm run lint:spelling`, part of `npm run check`,
checks the Markdown and the English messages for it
([docs/style.md](docs/style.md#language)). A
translation of the app follows the English messages in
`packages/ui/src/i18n/en.json`.
