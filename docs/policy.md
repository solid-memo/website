# Policy

The rules Solid Memo's code follows: public policy (none), published
rules from outside the project, and the project's own rules, written
as data the code checks.

## No public policy applies

Solid Memo, a volunteer project, implements no law, regulation or
government policy: no public organization built it, had it built or
asked it to carry one out. If that changes, this page names the policy
and the code that implements it. What the app does with personal data
is in [privacy.md](privacy.md).

## Rules from outside the project

The code follows each rule below as published, or with the listed
departures. The formats Solid Memo reads and writes are in
[standards.md](standards.md).

| Rule | Version | Published at | Implemented in | Checked by |
|---|---|---|---|---|
| SM-2, the SuperMemo 2 scheduling algorithm | 1990 | [SuperMemo](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method) | [`sm2.ts`](../packages/domain/src/sm2.ts) ([srs.md](srs.md)) | [`sm2.test.ts`](../packages/domain/src/sm2.test.ts), row by row against [srs.md's worked examples](srs.md#worked-examples) |
| FSRS-6, the Free Spaced Repetition Scheduler | 6, as fsrs-rs v6.6.2 | [Open Spaced Repetition](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) | [`fsrs.ts`](../packages/domain/src/fsrs.ts) ([srs.md](srs.md#fsrs-6)) | [`fsrs.test.ts`](../packages/domain/src/fsrs.test.ts), row by row against [srs.md's FSRS-6 worked examples](srs.md#fsrs-6-worked-examples), and against fsrs-rs's published test vectors |
| Unicode CLDR plural rules | the browser's CLDR | [Unicode CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules) | `Intl.PluralRules` in [`i18n.tsx`](../packages/ui/src/ui/i18n.tsx) ([i18n.md](i18n.md)) | [`i18n.test.tsx`](../packages/ui/src/ui/i18n.test.tsx): every plural message gives exactly its language's categories |
| BCP 47 language tags | RFC 5646, RFC 4647 | [IETF](https://www.rfc-editor.org/info/bcp47) | [`languageTag.ts`](../packages/domain/src/languageTag.ts), [`locale.ts`](../packages/domain/src/locale.ts) ([vocab.md](vocab.md#the-language-of-text)) | [`languageTag.test.ts`](../packages/domain/src/languageTag.test.ts), [`locale.test.ts`](../packages/domain/src/locale.test.ts) |
| Unicode normalization form C | UAX #15 | [Unicode](https://unicode.org/reports/tr15/) | the deck library check and search ([deck-library.md](deck-library.md#checks), [`search.ts`](../packages/domain/src/search.ts)) | [`deckLibrary.test.ts`](../packages/shacl/node/deckLibrary.test.ts), [`search.test.ts`](../packages/domain/src/search.test.ts) |
| DCAT-AP, the EU's profile of DCAT | 3.0.1 | [SEMIC](https://semiceu.github.io/DCAT-AP/releases/3.0.1/) | the vendored shapes in [`packages/vocab/vendor/`](../packages/vocab/vendor/) ([validation.md](validation.md)) | `npm run library:check`, and the pySHACL cross-check in CI ([`shacl_crosscheck.py`](../scripts/shacl_crosscheck.py)) |

### SM-2

Woźniak, P. A. (1990). *Optimization of learning*. Master's thesis,
University of Technology in Poznań. SuperMemo publishes the
description as
[Application of a computer to improve the results obtained in working with the SuperMemo method](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method).
Solid Memo uses the ease factor and interval formulas as published:

- The ease factor starts at 2.5, never below 1.3.
- Intervals: 1 day, 6 days, then the last interval times the ease
  factor.
- A lapse (a grade under 3) restarts the repetitions, keeping the ease
  factor.

Its three recorded departures from the description:

- Intervals are whole study days, not calendar days
  ([srs.md](srs.md#study-days-and-the-queue)).
- Solid Memo repeats only a card graded 0 or 1 (Again, on the
  four-button scale), within the session, not each card under 4 at the
  session's end until it scores 4 or more
  ([srs.md](srs.md#the-sm-2-transition)). A 2 (a lapse) or a 3 (correct
  but hard) ends the card's day.
- The ease factor is kept at 5 at most, and the interval at most
  36,500 days (100 years), so that a state from elsewhere still gives
  a due day that can be written (the same section of `srs.md`).

The answer scales and a course's multiple-choice answers map onto the
same grades, without changing the algorithm ([srs.md](srs.md#answer-scales)).

### FSRS-6

FSRS-6, by Jarrett Ye and the Open Spaced Repetition project, is
described in
[The Algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm).
Solid Memo reimplements FSRS-6's formulas and 21 default parameters as
the reference implementation,
[fsrs-rs v6.6.2](https://github.com/open-spaced-repetition/fsrs-rs/tree/v6.6.2)
(BSD-3-Clause), gives them, copying no code. What FSRS-6 leaves to the
app is fixed
([srs.md](srs.md#decisions-fixed-in-code-fsrs-6)):

- Default parameters, not trained on the learner's answers.
- Whole study days; a second review the same study day takes the
  same-day formula.
- Intervals rounded, from 1 to 36,500 days, then fuzzed by the ranges
  of py-fsrs and Anki, with a factor drawn from the prompt and its last
  review rather than at random.
- A prompt without a current FSRS-6 state gets one estimated from its
  SM-2 state, like fsrs-rs's `memory_state_from_sm2` at 90% retention.

### CLDR plural rules

A plural message gives one form per plural category of its language
("1 card", "2 cards"). The Unicode CLDR plural rules set the categories
and which numbers fall in each
([by language](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
The app asks the browser's `Intl.PluralRules` instead of shipping
them, so the CLDR version is the browser's. The tests use Node.js's
copy; the journeys ([`strings.ts`](../e2e/journeys/harness/strings.ts))
pick each form in the browser they drive, as the app does.

## The project's own rules

These rules are machine-readable data in this repository, beside the
code that applies them.

| Rule | Where it is written | What applies it |
|---|---|---|
| The shape of every document in a pod and in the library | SHACL shapes in [`ns/shapes/`](../ns/shapes/) ([shapes.md](shapes.md)) | the app in the browser and `npm run library:check` (rdf-validate-shacl), and pySHACL in CI ([validation.md](validation.md)) |
| The meaning of every Solid Memo term | the vocabulary in [`ns/vocab/`](../ns/vocab/) ([vocab.md](vocab.md)) | the constants generated from it, kept in step by `npm run generate:check` |
| What a library deck version must state, beyond the shapes: its place, series, publisher, previous version and license | [`libraryRules.ts`](../packages/domain/src/release/libraryRules.ts) ([deck-library.md](deck-library.md#checks)) | `npm run library:check`, and the Studio's check for the library |
| What the repository's library asks of a deck: a title, description and keywords in every language the app speaks (`LIBRARY_LANGUAGES`, from `LOCALES` in [`locale.ts`](../packages/domain/src/locale.ts)), each card picture described in English and the card's other languages, the theme `EDUC` | `repoPolicy` in [`curationRules.ts`](../packages/domain/src/release/curationRules.ts) | the Studio's check for the library; `npm run library:check` for the languages and picture descriptions of each deck's newest version, and the library deck shapes for the rest |
| What a page may load and run | the Content Security Policy in [`apps/web/index.html`](../apps/web/index.html) ([markdown.md](markdown.md)) | the browser; [`build.test.ts`](../apps/web/src/build.test.ts) checks it |

Every published version of a shape or deck is frozen: a change is a
new version beside it (`shapes.md`,
[deck-library.md](deck-library.md)). A rule the published shapes
don't state, such as a library deck version naming its license, goes
into the library rules, not an edited shape.

No outside policy is based on this code; one that is would be based
on the code in this repository.
