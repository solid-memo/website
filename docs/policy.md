# Policy

The rules Solid Memo's code is based on: which public policy applies
(none), which published rules from outside the project the code
follows, and the project's own rules, written as data the code checks.

## No public policy applies

Solid Memo implements no law, regulation or government policy. It is a
volunteer project, not built for or by a public organization, and no
public body has asked it to carry out a policy. If that changes, the
policy and the code that implements it will be added here.

What the app does with personal data is in [privacy.md](privacy.md).

## Rules from outside the project

Each of these is a published rule the code follows as written, or with
the departures listed. The formats Solid Memo reads and writes are in
[standards.md](standards.md).

| Rule | Version | Published at | Implemented in | Checked by |
|---|---|---|---|---|
| SM-2, the SuperMemo 2 scheduling algorithm | 1990 | [SuperMemo](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method) | [`sm2.ts`](../packages/domain/src/sm2.ts) ([srs.md](srs.md)) | [`sm2.test.ts`](../packages/domain/src/sm2.test.ts), row by row against [srs.md's worked examples](srs.md#worked-examples) |
| Unicode CLDR plural rules | the browser's CLDR | [Unicode CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules) | `Intl.PluralRules` in [`i18n.tsx`](../packages/ui/src/ui/i18n.tsx) ([i18n.md](i18n.md)) | [`i18n.test.tsx`](../packages/ui/src/ui/i18n.test.tsx): every plural message gives exactly its language's categories |
| BCP 47 language tags | RFC 5646, RFC 4647 | [IETF](https://www.rfc-editor.org/info/bcp47) | [`languageTag.ts`](../packages/domain/src/languageTag.ts), [`locale.ts`](../packages/domain/src/locale.ts) ([vocab.md](vocab.md#the-language-of-text)) | [`languageTag.test.ts`](../packages/domain/src/languageTag.test.ts), [`locale.test.ts`](../packages/domain/src/locale.test.ts) |
| Unicode normalization form C | UAX #15 | [Unicode](https://unicode.org/reports/tr15/) | the deck library check and search ([deck-library.md](deck-library.md#checks), [`search.ts`](../packages/domain/src/search.ts)) | [`deckLibrary.test.ts`](../packages/shacl/node/deckLibrary.test.ts), [`search.test.ts`](../packages/domain/src/search.test.ts) |
| DCAT-AP, the EU's profile of DCAT | 3.0.1 | [SEMIC](https://semiceu.github.io/DCAT-AP/releases/3.0.1/) | the vendored shapes in [`packages/vocab/vendor/`](../packages/vocab/vendor/) ([validation.md](validation.md)) | `npm run library:check`, and the pySHACL cross-check in CI ([`shacl_crosscheck.py`](../scripts/shacl_crosscheck.py)) |

### SM-2

Woźniak, P. A. (1990). *Optimization of learning*. Master's thesis,
University of Technology in Poznań. SuperMemo publishes the algorithm's
description as
[Application of a computer to improve the results obtained in working with the SuperMemo method](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method).
Solid Memo uses the ease factor and interval formulas as published: an
ease factor of 2.5 to start, never below 1.3, intervals of 1 day, 6
days, then the last interval times the ease factor, and a lapse (a
grade under 3) starting the card's repetitions again without changing
its ease factor. It departs from the description in two recorded ways:

- Intervals are rounded to whole days, and counted in study days, not
  calendar days ([srs.md](srs.md#study-days-and-the-queue)).
- The description repeats every card graded under 4 at the end of the
  session until each scores 4 or more. Solid Memo repeats only a card
  graded 0 or 1 (Again, on the four-button scale), within the session
  ([srs.md](srs.md#the-sm-2-transition)). A card graded 2 is a lapse
  and starts its repetitions again, but is not repeated that session,
  and a correct but hard answer (3) ends the card's day too.

The answer scales and a course's multiple-choice answers map onto the
same grades; they do not change the algorithm ([srs.md](srs.md#answer-scales)).

### CLDR plural rules

A plural message gives one form for each plural category of its
language ("1 card", "2 cards"). The categories, and which number falls
in which, are the Unicode CLDR plural rules
([by language](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
The app does not ship them: it asks the browser's `Intl.PluralRules`,
so the CLDR version is whichever the browser has. The tests run on
Node.js, which has its own copy of CLDR, and the journeys
([`strings.ts`](../e2e/journeys/harness/strings.ts)) pick each plural
form in the browser they drive, as the app does.

## The project's own rules

The project's own rules are written as data, in formats a machine can
read, and live in this repository beside the code that applies them.

| Rule | Where it is written | What applies it |
|---|---|---|
| The shape of every document in a pod and in the library | SHACL shapes in [`ns/shapes/`](../ns/shapes/) ([shapes.md](shapes.md)) | the app in the browser and `npm run library:check` (rdf-validate-shacl), and pySHACL in CI ([validation.md](validation.md)) |
| The meaning of every Solid Memo term | the vocabulary in [`ns/vocab/`](../ns/vocab/) ([vocab.md](vocab.md)) | the constants generated from it, kept in step by `npm run generate:check` |
| What a library deck version must state, beyond the shapes: its place, its series, its publisher, the version before it and its license | [`libraryRules.ts`](../packages/domain/src/release/libraryRules.ts) ([deck-library.md](deck-library.md#checks)) | `npm run library:check`, and the Studio's check for the library |
| What the repository's library asks of a deck: English and Swedish keywords, an English title and description, the theme `EDUC` | `repoPolicy` in [`curationRules.ts`](../packages/domain/src/release/curationRules.ts) | the Studio's check for the library; the library deck shapes for the command |
| What a page may load and run | the Content Security Policy in [`apps/web/index.html`](../apps/web/index.html) ([markdown.md](markdown.md)) | the browser; [`build.test.ts`](../apps/web/src/build.test.ts) checks it |

Every published version of a shape or of a deck is frozen: a change is
a new version beside it ([shapes.md](shapes.md), [deck-library.md](deck-library.md)).
So a rule the published shapes do not state, such as that a library
deck version names its license, is added as a library rule, not by
editing a shape.

No policy outside the project is based on this code. If one is, the
code it is based on is the code in this repository.
