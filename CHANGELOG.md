# Changelog

What changed in Solid Memo from one version to the next, newest first.
Each version's entry is written by semantic-release when it releases
the version, from the messages of the commits it contains, which follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
The versions follow [Semantic Versioning](https://semver.org/), as
[docs/releasing.md](docs/releasing.md) applies it to an app that keeps
its data in pods. The first version, 1.0.0, is summed up in full at the
end of the file.

This file covers the app. The vocabulary, the shapes and the library's
decks are versioned on their own, each version published once and never
changed: see [docs/vocab.md](docs/vocab.md),
[docs/shapes.md](docs/shapes.md) and
[docs/deck-library.md](docs/deck-library.md).

<!-- The entries from here to the first version's summary are written by semantic-release. -->
<!-- Their lists start with "*"; the summary's, as everywhere else, with "-". -->
<!-- markdownlint-configure-file { "MD004": { "style": "dash" } } -->
<!-- markdownlint-disable -->
<!-- cspell:disable -->

## [3.7.1](https://github.com/solid-memo/website/compare/v3.7.0...v3.7.1) (2026-10-17)

### Performance Improvements

* grade a card without reading its state and the preferences first ([7f148e5](https://github.com/solid-memo/website/commit/7f148e5f66edc3cd145a0b248f683331abf41f40)), closes [#146](https://github.com/solid-memo/website/issues/146)
* **solid:** keep what a write leaves at the version the pod answers with ([6b625ec](https://github.com/solid-memo/website/commit/6b625ec5aa90a6f98f4a0c39a5adc75d6bb2ca1e)), closes [#146](https://github.com/solid-memo/website/issues/146)
* **ui:** read the library's index once a page for the deck list ([d891c31](https://github.com/solid-memo/website/commit/d891c31490c06b4e8a9ca1619fd04d8ced04773c)), closes [#146](https://github.com/solid-memo/website/issues/146)

## [3.7.0](https://github.com/solid-memo/website/compare/v3.6.1...v3.7.0) (2026-10-17)

### Features

* **ui:** report a mistake in a card from where it is seen ([0c14836](https://github.com/solid-memo/website/commit/0c148368965d56bd4f6ef1165b669d61352e9df6)), closes [#144](https://github.com/solid-memo/website/issues/144)

## [3.6.1](https://github.com/solid-memo/website/compare/v3.6.0...v3.6.1) (2026-10-17)

### Bug Fixes

* **application:** keep the note of a cut-off guest move on a failed retry ([d2a1f68](https://github.com/solid-memo/website/commit/d2a1f685f1e8f41b887e3f94fab4e0386c2691b9)), closes [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** offer a cut-off guest move's copy for removal when logged in ([301301b](https://github.com/solid-memo/website/commit/301301bc443d6d929d264f4f1453656e01499dd2)), closes [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** say a library update finished after the deck page reloads it ([46cd821](https://github.com/solid-memo/website/commit/46cd821beb0f5e6dcbd783b466f410aec456de1c)), closes [#140](https://github.com/solid-memo/website/issues/140) [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** say the statistics begin anew once a reset empties the log ([7efaad0](https://github.com/solid-memo/website/commit/7efaad048a9263b82a2d4c8098d6c748d7456c81)), closes [#140](https://github.com/solid-memo/website/issues/140)

## [3.6.0](https://github.com/solid-memo/website/compare/v3.5.0...v3.6.0) (2026-10-17)

### Features

* **decks:** stop presenting foundation reviews as current ([7b1708e](https://github.com/solid-memo/website/commit/7b1708e1f8dd0b56cfbe9d572b38ffa502646a7b)), closes [#136](https://github.com/solid-memo/website/issues/136)

## [3.5.0](https://github.com/solid-memo/website/compare/v3.4.0...v3.5.0) (2026-10-17)

### Features

* **docs:** list every page of the docs on each page, from an index in Turtle ([9006825](https://github.com/solid-memo/website/commit/9006825a1095847a49bea72822dde067f44c46bb)), closes [#134](https://github.com/solid-memo/website/issues/134)

## [3.4.0](https://github.com/solid-memo/website/compare/v3.3.0...v3.4.0) (2026-10-16)

### Features

* **decks:** learn Korean from dialogues around food ([c2a179c](https://github.com/solid-memo/website/commit/c2a179cf201c3d1d1af0407de8b43580762a9442)), closes [#132](https://github.com/solid-memo/website/issues/132)

## [3.3.0](https://github.com/solid-memo/website/compare/v3.2.0...v3.3.0) (2026-10-16)

### Features

* **ui:** link the docs from the footer ([939fc6f](https://github.com/solid-memo/website/commit/939fc6fae0ca39e2933905cda2237f065afb0568)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** generate the sitemap and robots.txt from CNAME ([9e09627](https://github.com/solid-memo/website/commit/9e0962763f8ccf3a8a8f43782669f1e92dfc6515)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** link the docs from the About page, the page without script and publiccode.yml ([d9c3a6e](https://github.com/solid-memo/website/commit/d9c3a6edcb3d2171ce1a1de8979dee03b49d5f40)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** publish the docs at /docs/ with every release, drawn in Chromium ([81259e1](https://github.com/solid-memo/website/commit/81259e13f3f85768c8b27b446fe82700e23c3635)), closes [#112](https://github.com/solid-memo/website/issues/112)

## [3.2.0](https://github.com/solid-memo/website/compare/v3.1.0...v3.2.0) (2026-10-16)

### Features

* **decks:** learn everyday Korean phrases ([8ed97d8](https://github.com/solid-memo/website/commit/8ed97d82c241799545f6bc1e0139c2a5c276b755)), closes [#122](https://github.com/solid-memo/website/issues/122)

## [3.1.0](https://github.com/solid-memo/website/compare/v3.0.0...v3.1.0) (2026-10-16)

### Features

* **ui:** join a text field and its language picker in one box ([8900820](https://github.com/solid-memo/website/commit/8900820e8bd34f719877a0a8b1c86b1c53d8e21c)), closes [#117](https://github.com/solid-memo/website/issues/117)

## [3.0.0](https://github.com/solid-memo/website/compare/v2.3.0...v3.0.0) (2026-10-16)

### ⚠ BREAKING CHANGES

* **ns:** the app writes cards in card format 6. An older
version of Solid Memo reads a format-6 card without its front label
and refuses to save over it, so after this version updates a pod, a
tab or device still on an older version cannot edit those cards until
it is reloaded. A library release with front labels needs this version
to be imported.

### Features

* **decks:** label what each capitals card asks ([b83227c](https://github.com/solid-memo/website/commit/b83227c14f1e524fb1b8ff4b2d8d8d57bed8db55)), closes [#115](https://github.com/solid-memo/website/issues/115)
* **ns:** label a card's front, in card format 6 ([6e787f3](https://github.com/solid-memo/website/commit/6e787f3fd670d3f24438a09702f5d7175b74e093)), closes [#115](https://github.com/solid-memo/website/issues/115)
* **ui:** mark decks with a newer library release on the deck list ([6c97668](https://github.com/solid-memo/website/commit/6c9766848f64abfcbe65b9fc8a0c94a11ebd78b9)), closes [#118](https://github.com/solid-memo/website/issues/118)

## [2.3.0](https://github.com/solid-memo/website/compare/v2.2.0...v2.3.0) (2026-10-16)

### Features

* **decks:** say how each HTTP status is used in practice ([dba89b1](https://github.com/solid-memo/website/commit/dba89b19d4687f3f53a6c4c895d956392ee2be95)), closes [#114](https://github.com/solid-memo/website/issues/114)

## [2.2.0](https://github.com/solid-memo/website/compare/v2.1.2...v2.2.0) (2026-10-16)

### Features

* **ui:** link to Discussions from the footer ([2b117ec](https://github.com/solid-memo/website/commit/2b117ecee7c547150ec512befd6d35976a79c2e6)), closes [#107](https://github.com/solid-memo/website/issues/107)

## [2.1.2](https://github.com/solid-memo/website/compare/v2.1.1...v2.1.2) (2026-10-16)

### Bug Fixes

* **studio:** keep hidden text inside the panes that scroll ([485ba46](https://github.com/solid-memo/website/commit/485ba46443e52076b7c6fa7a4446293561d44c7f)), closes [#110](https://github.com/solid-memo/website/issues/110)

## [2.1.1](https://github.com/solid-memo/website/compare/v2.1.0...v2.1.1) (2026-10-16)

### Bug Fixes

* **domain:** find the guest's pod in a text by the origin its URLs parse to ([01e9fb6](https://github.com/solid-memo/website/commit/01e9fb6e82e3413fdb61c57791deb6e2d7ddf6e8)), closes [#102](https://github.com/solid-memo/website/issues/102)

## [2.1.0](https://github.com/solid-memo/website/compare/v2.0.1...v2.1.0) (2026-10-15)

### Features

* **ui:** link to the changelog from the footer ([1ba50c8](https://github.com/solid-memo/website/commit/1ba50c8bd13a896e6a14e9be1939a5e314d1dc40)), closes [#88](https://github.com/solid-memo/website/issues/88)

## [2.0.1](https://github.com/solid-memo/website/compare/v2.0.0...v2.0.1) (2026-10-15)

### Bug Fixes

* **release:** count only a BREAKING CHANGE: footer as written; 2.0.0 broke nothing ([41444fc](https://github.com/solid-memo/website/commit/41444fc3fbaf4d997a163020f536c2d430c8b5e7)), closes [#84](https://github.com/solid-memo/website/issues/84)

## [2.0.0](https://github.com/solid-memo/website/compare/v1.2.0...v2.0.0) (2026-10-15)

### ⚠ BREAKING CHANGES

* **releasing:** of the app. One rule, with no judgment of what an older
reader loses, can be checked, and every shape edited in place so far was
edited before 1.0.0.

### Documentation

* **releasing:** declare the public API that the version promises ([4e18c22](https://github.com/solid-memo/website/commit/4e18c227f36dc4f33d37c8b3a29d0e38b21d5af7)), closes [#72](https://github.com/solid-memo/website/issues/72)

## [1.2.0](https://github.com/solid-memo/website/compare/v1.1.0...v1.2.0) (2026-10-15)

### Features

* **studio:** edit a release's themes on the release screen ([f95c429](https://github.com/solid-memo/website/commit/f95c429d8076c25a0b3194f51ec0eb3906bcf489)), closes [#69](https://github.com/solid-memo/website/issues/69)
* **studio:** group a release's themes, and nest narrower topics ([fb9501f](https://github.com/solid-memo/website/commit/fb9501fd36359e14589f0e43870daa98c9243229)), closes [#69](https://github.com/solid-memo/website/issues/69)

### Bug Fixes

* **domain:** start every new draft about education (EDUC) ([19617f4](https://github.com/solid-memo/website/commit/19617f428c5254792837f84385366137db2c331d)), closes [#69](https://github.com/solid-memo/website/issues/69)

## [1.1.0](https://github.com/solid-memo/website/compare/v1.0.1...v1.1.0) (2026-10-14)

### Features

* **decks:** learn everyday Arabic phrases with Basic Arabic ([e04f2f8](https://github.com/solid-memo/website/commit/e04f2f82abf5a75fceff1cea249ede41d7cb314a))
* **decks:** study the 1000 most common Arabic nouns ([95ae21e](https://github.com/solid-memo/website/commit/95ae21e319dee25ec3b3602fdc8ba624771d6e8b))
* **decks:** study the 300 most common Arabic adjectives ([2fda847](https://github.com/solid-memo/website/commit/2fda847d2de339fce023c6d028f1b1a3eefcccdd))
* **decks:** study the 500 most common Arabic verbs ([edd8d2c](https://github.com/solid-memo/website/commit/edd8d2c2007656e4f6d413429533a3a8aa11ec64))
* describe Arabic as a language and a topic ([94c74e2](https://github.com/solid-memo/website/commit/94c74e21cfb82ac6fb6c1edf03e27f31a5b7ce6e))
* find Arabic words with or without their vowel marks ([ed017e1](https://github.com/solid-memo/website/commit/ed017e10ada11d546a710feacdbb8ea3733527fa))
* show Arabic and other right-to-left text in its own direction ([ab40317](https://github.com/solid-memo/website/commit/ab403171c45c4c5f259ee497ecd5a518a8092e0e))

## [1.0.1](https://github.com/solid-memo/website/compare/v1.0.0...v1.0.1) (2026-10-14)

### Bug Fixes

* keep the last edit's deck arrangement over a read still in flight ([ec57855](https://github.com/solid-memo/website/commit/ec57855c47b278f33bd775a80cfb558137c37409))

## 1.0.0 (2026-10-13)

### Features

* declare Solid Memo stable, from its first version, 1.0.0 ([282574d](https://github.com/solid-memo/website/commit/282574d234cccc8221bd648c5e4c9eb7f94c5c28))

<!-- markdownlint-enable -->
<!-- cspell:enable -->

## What the first version contains

Version 1.0.0 is the first version released, and the first stable one.
Its entry above, which semantic-release writes when it releases the
version, lists only the changes whose commits follow Conventional
Commits, a small part of it: most of the app was built before. This is
all that it contains.

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
- **Organizing decks** into named groups that nest.
- **Statistics** of the study, read from the answer log, over the last
  30 days, 3 months, 12 months or all time, in tabs: how the answers
  went and what each day held; recall week by week, by interval and by
  how late a review was, counting only real reviews; how long was
  studied and at what hours; where the cards stand and what is coming;
  each course's chapters done; the hardest cards and the leeches; and
  every answer a card was given. The charts can be stepped through
  with the keyboard, and the answers saved as a CSV file
  ([docs/statistics.md](docs/statistics.md)).
- **Answer times.** Each answer records how long recalling and grading
  took, the day it was due and the device's offset from UTC, kept with
  the answer log in the pod (vocabulary 1.19,
  [docs/privacy.md](docs/privacy.md#in-your-pod)).
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
- **Running your own copy.** The app's name, its repository and the pod
  providers offered at sign-up are set by configuration
  ([docs/configuration.md](docs/configuration.md),
  [docs/reuse.md](docs/reuse.md)), and every screen links to the source
  code, the commit and the issue tracker.
- **An About page** at `/about/`, in plain HTML that search engines and
  browsers without script can read, saying what Solid Memo is for
  learners, deck authors, technologists and decision makers
  ([docs/deployment.md](docs/deployment.md)).
- **Guides for learners**: studying, statistics and the library
  ([docs/user-guide.md](docs/user-guide.md),
  [docs/statistics.md](docs/statistics.md),
  [docs/browsing.md](docs/browsing.md)).
- **A project contact in decks.** New deck versions name the issue
  tracker as their contact point, not an email address
  ([docs/deck-library.md](docs/deck-library.md#contact)).
- **License headers.** Every file carries a machine-readable license, as
  [REUSE](https://reuse.software/) asks
  ([docs/style.md](docs/style.md#licenses)).
- **Tests.** Unit tests at 100% coverage per package, end-to-end tests
  against several Solid servers, and user journeys in a browser
  ([docs/testing.md](docs/testing.md)).
