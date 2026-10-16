# Solid Memo

[![CI](https://github.com/solid-memo/website/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/solid-memo/website/actions/workflows/ci.yml)
[![Interop](https://github.com/solid-memo/website/actions/workflows/interop.yml/badge.svg?branch=main)](https://github.com/solid-memo/website/actions/workflows/interop.yml)
[![Commit activity](https://img.shields.io/github/commit-activity/m/solid-memo/website)](https://github.com/solid-memo/website/pulse)
[![Last commit](https://img.shields.io/github/last-commit/solid-memo/website)](https://github.com/solid-memo/website/commits/main)
[![Contributors](https://img.shields.io/github/contributors/solid-memo/website)](https://github.com/solid-memo/website/graphs/contributors)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23351087.svg)](https://doi.org/10.5281/zenodo.23351087)
[![Standard for Public Code: commitment](https://raw.githubusercontent.com/publiccodenet/standard/9135425db444c1e18860a99963584da9c19a87f3/assets/standard-for-public-code-commitment.svg)](#the-standard-for-public-code)

[![Solid Memo](apps/web/public/social-preview.png)](https://solid-memo.com/)

Spaced-repetition flashcards that live in your own Solid Pod.

The app, its vocabulary and shapes ([`ns/`](ns/)) and the ready-made
decks ([`decks/`](decks/)) are published together at
<https://solid-memo.com/>, one released version at a time
([docs/deployment.md](docs/deployment.md)).

## About

Solid Memo helps you remember what you learn. You study flashcards, and
the app shows each card again just before you would forget it: this is
called spaced repetition. It comes with about a hundred ready-made decks
and a few short courses, in six languages, and you can write your own.

Most flashcard apps keep your cards and your study history on their own
servers. If the app closes, or you want to move, your history stays
behind. Solid Memo keeps them in your own
[Solid](https://solidproject.org/) Pod instead: an online data store that
you choose and control, from any provider or on your own server. Solid
Memo only reads and writes there, in an open format that other apps can
use too. You can also try it as a guest first, with everything kept in
your browser.

It is for:

- **learners** who want their study data to stay theirs;
- **deck and course authors**, who write, check and publish decks in
  Solid Memo Studio ([docs/studio.md](docs/studio.md));
- **developers** building on Solid, who can reuse its vocabulary, its
  shapes and its decks ([docs/vocab.md](docs/vocab.md),
  [docs/shapes.md](docs/shapes.md)).

How to use it: [docs/user-guide.md](docs/user-guide.md). What it is
for, and what it is not: [docs/objectives.md](docs/objectives.md). The
same, for learners, authors, technologists and decision makers:
[solid-memo.com/about](https://solid-memo.com/about/).

To see what the app does without signing in, open the report of its
[user journeys](https://solid-memo.com/journeys/): tests that use the
app in a browser as a person would, step by step, from CI's run on the
version the site runs (none after a deploy by hand)
([docs/testing.md](docs/testing.md#user-journeys)).

## Status

Solid Memo is **stable** from version 1.0.0, its first release: the
app and its data formats can be relied on, and a change that breaks
them comes with a new major version. Its versions follow
[Semantic Versioning](https://semver.org/), and each is released by
semantic-release, from the commits' types, once CI passes on `main`.
Each is tagged, with notes, on the
[releases page](https://github.com/solid-memo/website/releases), and
[CHANGELOG.md](CHANGELOG.md) says what changed in each. The site runs
the latest version, and nothing between two versions. How versions are
chosen and released is in [docs/releasing.md](docs/releasing.md).

Your data is safe across versions: every data format is versioned, and
the app brings older data in your Pod up to date in place
([docs/migrations.md](docs/migrations.md)). The vocabulary, the shapes
and the library's decks have versions of their own, and a published
version is never changed.

## The Standard for Public Code

Solid Memo is committed to meeting the
[Standard for Public Code](https://www.standardforpubliccode.org/), an
open standard for code that others can reuse, trust and help build. The
badge at the top of this page says so. It shows that the project aims to
meet every criterion, not that it meets them all yet: an assessment
lists which requirements are met, which are not, and why
([docs/standard-for-public-code.md](docs/standard-for-public-code.md)).

## Run it on its own

Solid Memo is a static web page with no server-side code, so you can run
your own copy on any web host:

```sh
npm ci
npm run browsers  # once: Chromium, which the build draws the docs' diagrams in
npm run build     # the whole site, the docs included, in apps/web/dist/
npm start         # builds it, then serves it at http://localhost:4173
```

Upload the contents of `apps/web/dist/` to any static web space
([docs/deployment.md](docs/deployment.md#manual-publish-any-static-web-space)).
[docs/reuse.md](docs/reuse.md) says what to change for your own copy,
and what must stay the same so that your users' data still works with
Solid Memo; [docs/configuration.md](docs/configuration.md) lists the
settings.

## Develop

You need Node 24 (see [`.nvmrc`](.nvmrc)) and npm; Chromium for
`npm run check` and `npm run build`, which draw the docs' diagrams in it
([docs/markdown.md](docs/markdown.md#diagrams)): `npm run browsers`
installs it once (on Linux, a machine that lacks the system libraries
it needs gets them with `sudo npx playwright install-deps chromium`);
Docker Engine 28.3.3 or later (or Docker Desktop) for the
end-to-end tests; and, for the optional pySHACL cross-check, Python 3
with [`scripts/requirements-ci.txt`](scripts/requirements-ci.txt)
installed. The [dev container](.devcontainer/devcontainer.json) has all
of them.

```sh
npm ci
npm run browsers  # once: Chromium, which npm run check and npm run build draw the docs' diagrams in
npm run dev       # the site, from source
npm run check     # lint and formatting (Biome, Turtle, Markdown), spelling, typecheck, tests (100% coverage), drift, the deck library, boundaries, the repository's own checks
npm run test:pod  # the end-to-end tests, against Solid servers started in Docker
```

How the code is laid out: [docs/architecture.md](docs/architecture.md);
each package's own `README.md` says what it exports and may import;
how it is tested: [docs/testing.md](docs/testing.md); how it is written:
[docs/style.md](docs/style.md); the terms the docs use:
[docs/glossary.md](docs/glossary.md); everything else:
[docs/](docs/README.md).

## Contributing

Everyone is welcome to suggest a change, report a problem or send one.

- Report a bug or suggest a feature in the
  [issues](https://github.com/solid-memo/website/issues).
- Ask a question or share an idea in the
  [discussions](https://github.com/solid-memo/website/discussions).
- See the changes under way in the
  [pull requests](https://github.com/solid-memo/website/pulls), and send
  your own: [CONTRIBUTING.md](CONTRIBUTING.md) says how.
- Report a security problem privately, never in a public issue:
  [SECURITY.md](SECURITY.md).

Apart from security reports and
[code of conduct reports](CODE_OF_CONDUCT.md#enforcement), the project
talks only in public and in writing, in issues, Discussions, pull
requests and commit messages, with no chat and no calls
([GOVERNANCE.md](GOVERNANCE.md#where-the-project-talks)).

How active the project is: its
[pulse](https://github.com/solid-memo/website/pulse), its
[commits](https://github.com/solid-memo/website/graphs/commit-activity) and its
[contributors](https://github.com/solid-memo/website/graphs/contributors).
How the project is run and who decides: [GOVERNANCE.md](GOVERNANCE.md).
What is planned: [ROADMAP.md](ROADMAP.md). How we treat each other:
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

English is the authoritative language of the code, the docs, commit
messages, issues and pull requests. The app itself speaks English,
Swedish, Korean, German, Spanish and French ([docs/i18n.md](docs/i18n.md)).

## License

Solid Memo is released under the [MIT License](LICENSE). That covers
everything in this repository, the documentation ([`docs/`](docs/)) and
the vocabulary and shapes ([`ns/`](ns/)) included, unless a file says
otherwise.

The ready-made decks carry their own licenses, stated in each deck
(`dcterms:license`, [docs/deck-library.md](docs/deck-library.md)) and
shown in the app. The vendored SHACL shapes keep their own: the DCAT-AP
shapes are CC BY 4.0 ([license](packages/vocab/vendor/dcat-ap/LICENSE))
and the SkoHub SKOS shapes Apache 2.0
([license](packages/vocab/vendor/skohub/LICENSE)); see
[packages/vocab/vendor](packages/vocab/vendor/README.md).

The repository follows the [REUSE](https://reuse.software/)
specification: every file states its copyright and license, in an SPDX
header or, for the files that cannot or must not carry one (the decks
among them), in [REUSE.toml](REUSE.toml), and the text of every license used is in
[LICENSES/](LICENSES/). `reuse lint` checks it in CI
([docs/style.md](docs/style.md#licenses)).
