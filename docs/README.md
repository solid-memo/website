# Docs

One page per part of Solid Memo. Start with [architecture.md](architecture.md)
and [testing.md](testing.md).

## The code

- [architecture.md](architecture.md) — the hexagonal layers, one npm workspace package each, and the Turbo tasks that check them.
- [boundaries.md](boundaries.md) — the import rules between packages, and the vendor libraries each may use, as `npm run check:boundaries` enforces them.
- [vendor-code.md](vendor-code.md) — which third-party technology the app depends on, where each is confined, and what replacing one would cost.
- [testing.md](testing.md) — unit tests at 100% coverage per package, the end-to-end tests against Solid servers in Docker, the user journeys in a browser (and how to debug and add one), and the commands.
- [deployment.md](deployment.md) — the static build, deployed to GitHub Pages by CI, or published by hand to any web space.

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
- [i18n.md](i18n.md) — English, Swedish and Korean: how the language is picked, and text in the user's languages.
- [theme.md](theme.md) — light, dark, or as the browser says, and where the choice is kept.
- [studio.md](studio.md) — Solid Memo Studio, the second app, in Solid Memo's page at `#/studio`: managing an instance's decks and cards in bulk, and writing decks and courses as drafts, checking, trying, comparing and publishing them, and listing the releases published; what it shares with Solid Memo, its routes, and how it is built and served.
