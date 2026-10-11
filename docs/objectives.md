# Objectives

What Solid Memo is for, who it is for, what it is not for, and the
principles the code keeps, each with where it is enforced.

## Mission

Solid Memo helps people remember what they learn, with flashcards that
come back just before they would be forgotten, while what they study
stays in a [pod](glossary.md#solid-and-the-web) of their own choosing,
not with the app.

## Goals

Each goal, and the pages and code that carry it out:

1. **Learn for the long term.** Cards are scheduled by SM-2, spaced
   repetition's best-known algorithm, so each comes back at a longer
   interval the better it is known.
   [srs.md](srs.md), [`sm2.ts`](../packages/domain/src/sm2.ts),
   [`scheduling.ts`](../packages/domain/src/scheduling.ts).
2. **Keep your data in your own pod.** Everything you study is stored
   in your Solid pod, read and written from your browser. Solid Memo
   has no server and no accounts of its own.
   [data-model.md](data-model.md), [authentication.md](authentication.md),
   [architecture.md](architecture.md).
3. **Try it first.** A guest studies in a pod kept in the browser, and
   can move that study into a pod later.
   [guest-mode.md](guest-mode.md), [onboarding.md](onboarding.md).
4. **Start from ready-made decks and courses.** A library of decks,
   some of them courses that teach before they ask, each version
   described with open standards and under its own license.
   [deck-library.md](deck-library.md), [courses.md](courses.md),
   [`decks/`](../decks/).
5. **Write and share your own.** Solid Memo Studio manages decks in
   bulk, and writes, checks and publishes releases to a pod for others
   to add. [studio.md](studio.md).
6. **Data other apps can read.** Data is RDF in open vocabularies, with
   Solid Memo's own terms and shapes published, versioned, at their
   addresses. [standards.md](standards.md), [vocab.md](vocab.md),
   [shapes.md](shapes.md), [validation.md](validation.md),
   [migrations.md](migrations.md).
7. **In your language.** The app speaks English, Swedish, Korean,
   German, Spanish and French, and shows text in the languages it is
   written in. [i18n.md](i18n.md).
8. **Safe whatever the data holds.** Text from a pod or a library is
   shown so that no data can run code in the app.
   [markdown.md](markdown.md#safety), [validation.md](validation.md).
9. **Run anywhere.** The site is static files that any web host can
   serve. [deployment.md](deployment.md).

## Who it is for

- **Learners**, who study decks and courses in the app
  ([srs.md](srs.md), [courses.md](courses.md)).
- **Authors of decks and courses**, who write and publish them with the
  Studio ([studio.md](studio.md)).
- **People who run their own copy** of the site
  ([deployment.md](deployment.md)).
- **Developers of other Solid apps**, who read and write the same data
  ([data-model.md](data-model.md), [vocab.md](vocab.md)).

## What it is not for

- **Not a service that holds your data.** There is no Solid Memo
  server, account or database; your pod's server holds your data
  ([privacy.md](privacy.md)).
- **Not a way to watch learners.** The app has no analytics and no
  tracking, and no one but you and those your pod lets in can see what
  you studied ([privacy.md](privacy.md)).
- **Not an exam.** A course's questions schedule cards for you; they do
  not grade you for anyone else.
- **Not a source of authority.** The library's decks are "Compiled by
  Anton Wiklund with the help of AI"
  ([deck-library.md](deck-library.md#provenance)). Each says what it was
  compiled from, and corrections are welcome in the
  [issue tracker](https://github.com/solid-memo/website/issues).

## Principles and where they are enforced

No public policy applies to Solid Memo ([policy.md](policy.md)), so its
objectives come from the project itself. Each principle below is
checked by code, not left to good intentions:

| Principle | Where it is described | Where it is enforced |
|---|---|---|
| Every line of code is tested | [testing.md](testing.md) | 100% coverage per package, in [`vitest.shared.ts`](../vitest.shared.ts), run by `npm run check` |
| Each layer depends only on the layers it may | [boundaries.md](boundaries.md), [architecture.md](architecture.md) | [`checkBoundaries.ts`](../scripts/checkBoundaries.ts), `npm run check:boundaries` |
| Data has the shape it says it has | [shapes.md](shapes.md), [validation.md](validation.md) | the shapes, checked in the app and by `npm run library:check`; pySHACL in CI ([`shacl_crosscheck.py`](../scripts/shacl_crosscheck.py)) |
| A published deck version never changes under its readers | [deck-library.md](deck-library.md) | `npm run library:check -- --base <ref>` in the [ns workflow](../.github/workflows/ns.yml) fails on a published version edited or removed (`baseProblems` in [`deckLibrary.ts`](../packages/shacl/node/deckLibrary.ts)); the continuity rules fail on a card dropped |
| Every library deck says how it may be reused | [deck-library.md](deck-library.md#checks) | the `noLicense` rule in [`libraryRules.ts`](../packages/domain/src/release/libraryRules.ts), run by `npm run library:check` |
| Data from a pod cannot run code | [markdown.md](markdown.md#safety) | the Content Security Policy, checked by [`build.test.ts`](../apps/web/src/build.test.ts) |
| Every language has every message | [i18n.md](i18n.md) | [`i18n.test.tsx`](../packages/ui/src/ui/i18n.test.tsx) |
| The scheduler does what its guide says | [srs.md](srs.md#worked-examples) | [`sm2.test.ts`](../packages/domain/src/sm2.test.ts) |
| It works with real Solid servers | [testing.md](testing.md) | the end-to-end tests against several servers, in CI |
| Turtle is written one way | [architecture.md](architecture.md) | `npm run format:turtle:check` |
| The docs and the English messages use one spelling, American | [style.md](style.md#language) | [`cspell.config.yaml`](../cspell.config.yaml), `npm run lint:spelling` in CI's docs job |

## Language

English is the authoritative language of the code, its documentation,
commits and issues; the docs are written in American English. The
app's messages in other languages are translations of the English
([i18n.md](i18n.md#translations)).
