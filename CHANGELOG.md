# Changelog

What changed in Solid Memo from one version to the next. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/) as
[docs/releasing.md](docs/releasing.md) applies it to an app that keeps
its data in pods.

This file covers the app. The vocabulary, the shapes and the library's
decks are versioned on their own, each version published once and never
changed: see [docs/vocab.md](docs/vocab.md),
[docs/shapes.md](docs/shapes.md) and
[docs/deck-library.md](docs/deck-library.md).

## [Unreleased]

## [0.1.0] - Unreleased

The first version, which sums up the app as it stands before its first
tag. The date is set when the maintainer tags it.

### Added

- **Study.** Flashcards scheduled by SM-2, the spaced-repetition method
  that shows a card again just before it would be forgotten
  ([docs/srs.md](docs/srs.md)). A deck is studied one way or both ways,
  at a pace of new cards a day that each deck can set. A card's side
  may be text, a picture or both, with a note under each side and a
  label above the back. The day's study is celebrated, with its streak.
- **Your data in your pod.** Decks, cards, review states, preferences
  and the answer log are RDF documents in the user's own
  [Solid](https://solidproject.org/) pod, found again through the type
  index ([docs/data-model.md](docs/data-model.md)). Sign-in with
  Solid-OIDC against any Solid identity provider
  ([docs/authentication.md](docs/authentication.md)), and help for a
  newcomer to get a pod ([docs/onboarding.md](docs/onboarding.md)).
- **Guest mode.** Trying the app before signing in, in a pod kept in the
  browser, and keeping that study when a real pod is connected later
  ([docs/guest-mode.md](docs/guest-mode.md)).
- **The deck library.** About a hundred ready-made decks, described with
  DCAT and published with the site, each with its own license and its
  sources; previews of a library deck and its cards; upgrades of a copy
  when its deck has a new version
  ([docs/deck-library.md](docs/deck-library.md)).
- **Courses.** Library decks with chapters of theory and multiple-choice
  questions, whose cards join the learner's deck as they are answered;
  a course for newcomers offered on an empty deck list, and the courses
  to go on with above it ([docs/courses.md](docs/courses.md)).
- **Markdown** in cards and courses, shown safely whatever the data
  holds ([docs/markdown.md](docs/markdown.md)).
- **Organizing decks** into named groups that nest, and statistics of the
  study from the answer log.
- **Files.** Saving a deck as a Turtle or JSON-LD file and opening one,
  and importing a deck or course from the URL of its release.
- **Solid Memo Studio**, a second app at `#/studio` for managing decks
  and cards in bulk, and for writing decks and courses as drafts,
  checking, trying and publishing them as releases
  ([docs/studio.md](docs/studio.md)).
- **Data checks.** Every document checked against its SHACL shapes and
  DCAT-AP in the browser; data that fails is set aside, not lost
  ([docs/validation.md](docs/validation.md)).
- **Format versions and migrations.** Every subject the app writes
  carries its format version, and the app brings older data up to the
  format it writes, in place, keeping every URL
  ([docs/migrations.md](docs/migrations.md)).
- **Six languages.** English, Swedish, Korean, German, Spanish and
  French, and deck and card text shown in the reader's languages
  ([docs/i18n.md](docs/i18n.md)).
- **Accessibility.** Keyboard and screen-reader use; light and dark
  themes ([docs/theme.md](docs/theme.md)); every view a URL that can
  be bookmarked and shared
  ([docs/routing.md](docs/routing.md)).
- **Open data.** The vocabulary and the shapes are published at
  `https://solid-memo.com/ns/`, so other apps can read and write the
  same data ([docs/vocab.md](docs/vocab.md),
  [docs/shapes.md](docs/shapes.md)).
- **Tests.** Unit tests at 100% coverage per package, end-to-end tests
  against several Solid servers, and user journeys in a browser
  ([docs/testing.md](docs/testing.md)).

[Unreleased]: https://github.com/solid-memo/website/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/solid-memo/website/releases/tag/v0.1.0
