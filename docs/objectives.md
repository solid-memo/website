# Objectives

What Solid Memo is for and not for, who uses it, and the principles
the code enforces.

## Mission

Solid Memo helps people remember what they learn: its flashcards return
right before they'd be forgotten. A learner's study stays in a
[pod](glossary.md#solid-and-the-web) they choose, not with the app.

## Goals

1. **Learn for the long term.** Cards are scheduled by FSRS-6, which
   a new instance starts on, or by SM-2, spaced repetition's
   best-known algorithm, if the learner picks it. The better a card is
   known, the longer it waits.
   [srs.md](srs.md), [`sm2.ts`](../packages/domain/src/sm2.ts),
   [`fsrs.ts`](../packages/domain/src/fsrs.ts),
   [`scheduling.ts`](../packages/domain/src/scheduling.ts).
2. **Keep the learner's data in their own pod**, read and written from
   their browser.
   [data-model.md](data-model.md), [authentication.md](authentication.md),
   [architecture.md](architecture.md).
3. **Try it first.** A guest studies in a pod kept in the browser
   and can move that study to a pod later.
   [guest-mode.md](guest-mode.md), [onboarding.md](onboarding.md).
4. **Start from ready-made decks and courses.** Library decks, some
   being courses that teach before they ask, each version described
   in open standards, under its own license.
   [deck-library.md](deck-library.md), [courses.md](courses.md),
   [`decks/`](../decks/).
5. **Write and share decks and courses.** Solid Memo Studio manages
   decks in bulk, and writes, checks and publishes releases to a pod
   for others to add. [studio.md](studio.md).
6. **Data other apps can read.** Data is RDF in open vocabularies;
   Solid Memo's own terms and shapes are published, versioned, at their
   addresses. [standards.md](standards.md), [vocab.md](vocab.md),
   [shapes.md](shapes.md), [validation.md](validation.md),
   [migrations.md](migrations.md).
7. **In the learner's language.** The app speaks English, Swedish,
   Korean, German, Spanish and French, and shows text in the language
   it's written in. [i18n.md](i18n.md).
8. **Safe whatever the data holds.** Text from a pod or a library
   can't run code in the app.
   [markdown.md](markdown.md#safety), `validation.md`.
9. **Run anywhere.** The site is static files any web host can
   serve. [deployment.md](deployment.md).

## Who it is for

- **Learners** study decks and courses in the app ([srs.md](srs.md),
  [courses.md](courses.md)).
- **Authors** write and publish decks and courses with the Studio
  ([studio.md](studio.md)).
- **People who run their own copy** of the site
  ([deployment.md](deployment.md)).
- **Developers of other Solid apps** read and write the same data
  ([data-model.md](data-model.md), [vocab.md](vocab.md)).

## What it is not for

- **Not a service that holds learners' data.** Solid Memo has no
  server, account or database; the learner's pod server holds the data
  ([privacy.md](privacy.md)).
- **Not a way to watch learners.** There's no analytics or
  tracking: only the learner and those their pod lets in see their
  study (`privacy.md`).
- **Not an exam.** A course's questions schedule the learner's cards;
  they don't grade the learner for others.
- **Not a source of authority.** The library's decks are "Compiled by
  Anton Wiklund with the help of AI"
  ([deck-library.md](deck-library.md#provenance)). Each names its sources;
  corrections go to the
  [issue tracker](https://github.com/solid-memo/website/issues).

## Principles and where they are enforced

No public policy applies ([policy.md](policy.md)); the project sets
its own principles, each checked by code:

| Principle | Described in | Enforced by |
|---|---|---|
| Every line of code is tested | [testing.md](testing.md) | 100% coverage per package ([`vitest.shared.ts`](../vitest.shared.ts)), in `npm run check` |
| Each layer depends only on the layers it may | [boundaries.md](boundaries.md), [architecture.md](architecture.md) | [`checkBoundaries.ts`](../scripts/checkBoundaries.ts), `npm run check:boundaries` |
| Data has its stated shape | [shapes.md](shapes.md), [validation.md](validation.md) | shapes, checked in the app and by `npm run library:check`; pySHACL in CI ([`shacl_crosscheck.py`](../scripts/shacl_crosscheck.py)) |
| A published deck version never changes | [deck-library.md](deck-library.md) | `npm run library:check -- --base <ref>` in CI's `library` job ([ci.yml](../.github/workflows/ci.yml)) fails on an edited or removed published version (`baseProblems` in [`deckLibrary.ts`](../packages/shacl/node/deckLibrary.ts)); continuity rules fail on a dropped card |
| Every library deck has a license | [deck-library.md](deck-library.md#checks) | `noLicense` in [`libraryRules.ts`](../packages/domain/src/release/libraryRules.ts), run by `npm run library:check` |
| Data from a pod can't run code | [markdown.md](markdown.md#safety) | the Content Security Policy, checked by [`build.test.ts`](../apps/web/src/build.test.ts) |
| Every language has every message | [i18n.md](i18n.md) | [`i18n.test.tsx`](../packages/ui/src/ui/i18n.test.tsx) |
| The schedulers match their guide | [srs.md](srs.md#worked-examples) (SM-2 and [FSRS-6](srs.md#fsrs-6-worked-examples)) | [`sm2.test.ts`](../packages/domain/src/sm2.test.ts), [`fsrs.test.ts`](../packages/domain/src/fsrs.test.ts) |
| It works with real Solid servers | `testing.md` | end-to-end tests against several servers, in CI |
| Turtle is written one way | `architecture.md` | `npm run format:turtle:check` |
| The docs and English messages use American spelling | [style.md](style.md#language) | [`cspell.config.yaml`](../cspell.config.yaml), `npm run lint:spelling`, in `npm run check` |

## Language

English is the authoritative language of the code, docs, commits and
issues; messages in other languages translate the English
([i18n.md](i18n.md#translations)).
