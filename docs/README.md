# Docs

One page per part of Solid Memo. New to the app? Read
[user-guide.md](user-guide.md). Working on the code? Start with
[architecture.md](architecture.md) and [testing.md](testing.md). A term
you don't know is in [glossary.md](glossary.md).

## Using the app

- [user-guide.md](user-guide.md) — a walk through Solid Memo for a learner: signing in or trying it as a guest, adding a deck, studying, courses, statistics, and the settings.
- [glossary.md](glossary.md) — the terms and abbreviations the docs use, each explained in plain words with a link.
- [privacy.md](privacy.md) — where your data is stored, what stays in the browser, what the host and other servers see, no analytics, and the email address published in deck metadata.

## The code

- [architecture.md](architecture.md) — the hexagonal layers, one npm workspace package each, and the Turbo tasks that check them.
- [boundaries.md](boundaries.md) — the import rules between packages, and the vendor libraries each may use, as `npm run check:boundaries` enforces them.
- [vendor-code.md](vendor-code.md) — which third-party technology the app depends on, where each is confined, and what replacing one would cost.
- [testing.md](testing.md) — unit tests at 100% coverage per package, the end-to-end tests against Solid servers in Docker, the user journeys in a browser (and how to debug and add one), the checks on the docs (style, spelling, links), and the commands.
- [deployment.md](deployment.md) — the static build, deployed to GitHub Pages by CI for each released version, or published by hand to any web space.
- [configuration.md](configuration.md) — the VITE_ settings a build reads (the app's name, the repository the footer and the page link to, the Pod providers, the deck library), their defaults, how to set them, and what they do not reach.
- [reuse.md](reuse.md) — running your own instance: fork, configure, build, host anywhere, make the deck library your own, the files to edit by hand, and the names that must stay because they are part of the data.
- [style.md](style.md) — how the code, Turtle, docs and commit messages are written: formatting and linting with Biome, TypeScript, naming, the Turtle house style, comments, plain English with American spelling, and English as the authoritative language.
- [releasing.md](releasing.md) — how the app's versions are chosen (SemVer, from 1.0.0, by semantic-release from the commits' Conventional Commits types), what counts as breaking for data in pods, what a release does and the deploy key it pushes with, what to do when one fails, and how the app's version differs from those of the vocabulary, shapes and decks.

## The data

- [data-model.md](data-model.md) — where Solid Memo stores data in a user's pod and how it finds it again.
- [vocab.md](vocab.md) — Solid Memo's own RDF terms, how they are versioned, and the constants generated from them.
- [shapes.md](shapes.md) — the SHACL shapes of every subject, version by version, and how they drive the code.
- [validation.md](validation.md) — checking data against the shapes and DCAT-AP in the browser, and the pySHACL cross-check in CI.
- [migrations.md](migrations.md) — format versions, and how the app brings a pod up to the format it writes.
- [deck-library.md](deck-library.md) — the ready-made decks in `decks/`, described with DCAT, how to add a version, and their checks; a release outside the library, and adding one from a link.
- [markdown.md](markdown.md) — text written in Markdown: the dialect, which texts may be in it, how each place shows it, why showing it is safe whatever the data holds, and writing it in the card editor.
- [courses.md](courses.md) — a library deck with chapters and steps, whose multiple-choice questions join the learner's deck as they are answered.

## The app

- [authentication.md](authentication.md) — login, session restore and logout against a Solid identity provider with Solid-OIDC.
- [onboarding.md](onboarding.md) — how a signed-out visitor ends up with a connected Pod.
- [guest-mode.md](guest-mode.md) — trying the app before logging in, in a pod kept in the browser.
- [srs.md](srs.md) — how cards are scheduled (SM-2), as pure functions in the domain.
- [routing.md](routing.md) — the URL as the view the user is looking at: bookmarkable, shareable, Back and Forward.
- [i18n.md](i18n.md) — English, Swedish, Korean, German, Spanish and French: how the language is picked, and text in the user's languages.
- [statistics.md](statistics.md) — the learner's own figures: the day's summary above the deck list, the statistics page and its charts, and a deck's figures, all worked out from the review log.
- [browsing.md](browsing.md) — making a deck, looking through and editing its cards in the Browser, the card creators, and previewing a library deck before importing it.
- [theme.md](theme.md) — light, dark, or as the browser says, and where the choice is kept.
- [studio.md](studio.md) — Solid Memo Studio, the second app, in Solid Memo's page at `#/studio`: managing an instance's decks and cards in bulk, and writing decks and courses as drafts, checking, trying, comparing and publishing them, and listing the releases published; what it shares with Solid Memo, its workspace (layout, keys, palette, what the device keeps), its routes, and how it is built and served.

## The project

- [objectives.md](objectives.md) — what Solid Memo is for and who it is for, what it is not for, and each principle with the check that enforces it.
- [policy.md](policy.md) — no public policy applies; the outside rules the code follows (SM-2, CLDR plural rules, BCP 47, NFC, DCAT-AP) and the project's own rules, with the tests that check each.
- [standards.md](standards.md) — every standard and specification used, with version, status, link and where it is used, and why the drafts and de facto ones do not get in the way of reuse.

- [standard-for-public-code.md](standard-for-public-code.md) — how well Solid Memo meets the Standard for Public Code, criterion by criterion: the scorecard, the decisions made, the GitHub settings and actions that remain, and the gaps still open.
