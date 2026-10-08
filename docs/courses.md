# Courses

A course teaches a subject in chapters. Each chapter is a sequence of
steps, and each step is a short piece of theory checked by one or more
multiple-choice questions. A chapter ends with a final review of all its
questions. Every question the learner answers becomes a card in their
own deck, scheduled like any other ([srs.md](srs.md)). At the end of the
course the learner has a deck of every card they studied.

A course is not a new kind of thing in the pod. It is a
[library](deck-library.md) release with an outline, and the learner's
copy is an ordinary deck. The pure parts are in
[domain/course.ts](../packages/domain/src/course.ts); the use cases are
in [useCases.ts](../packages/application/src/useCases.ts).

## The model

- **A course is a library release.** It lives at `decks/<name>/vN.ttl`
  like any deck, and is also typed `schema:Course`.
- **Questions are cards.** Each question is a card (card format 5):
  `sm:front` is the question and `sm:back` the right option, so ordinary
  flip-and-grade study works on it later.
- **Wrong options are subjects of their own.** Each is an
  `sm:Distractor` (also a `schema:Answer`, distractor format 1) in the
  document that holds its card, which names it with `sm:distractor`. It
  has text (`sm:distractorText`) and, optionally, a note on why it is
  wrong (`sm:distractorNote`).
- **The outline stays in the release.** Chapters (`sm:Chapter`, also a
  `schema:Syllabus`) and steps (`sm:Step`, also a
  `schema:LearningResource`) are subjects of the release, each part of
  its parent (`schema:isPartOf`) at its place (`schema:position`, 0
  first). They are never copied into a pod: the learner's deck reads them
  from the release its `prov:wasDerivedFrom` names.
- **A step** has its theory (`sm:theory`) and the cards that check it
  (`sm:checkedBy`, one or more).
- **A chapter** has a title and description, and may name cards asked
  only in its final review (`sm:reviewQuestion`), questions that combine
  its steps.
- **Text is plain unless its subject says otherwise.** A step, a
  chapter and a card may each state `sm:textFormat sm:markdown`
  (vocabulary 1.15): then the step's theory, the chapter's description
  (never its title) or the card's texts and its distractors' are
  Markdown ([vocab.md](vocab.md#text-formats)).

```turtle
<> a solid-memo:Deck , dcat:Dataset , schema:Course ;
    solid-memo:studyDirection solid-memo:frontToBack ; … .

<#ch-why-solid> a solid-memo:Chapter , schema:Syllabus ;
    solid-memo:formatVersion 1 ;
    schema:isPartOf <> ;
    schema:position 0 ;
    dcterms:title "Why Solid"@en ;
    dcterms:description "Why Solid exists: the data-silo problem, …"@en ;
    solid-memo:reviewQuestion <#q-why-solid-r01> , … .  # asked only in the final review

<#ch-why-solid-2> a solid-memo:Step , schema:LearningResource ;
    solid-memo:formatVersion 1 ;
    schema:isPartOf <#ch-why-solid> ;
    schema:position 1 ;
    solid-memo:textFormat solid-memo:markdown ;
    solid-memo:theory """## Separation creates choice

When one company holds both your data and the app, …"""@en ;
    solid-memo:checkedBy <#q-why-solid-2a> , <#q-why-solid-2b> .

<#q-why-solid-2a> a solid-memo:Card ;
    solid-memo:formatVersion 5 ;
    solid-memo:front "In the argument for Solid, why would separating data storage from apps create more competition?"@en ;
    solid-memo:back "Storage and apps can each be chosen and replaced separately"@en ;
    solid-memo:backNote "Once data does not belong to the app, users can switch apps …"@en ;
    solid-memo:distractor <#q-why-solid-2a-d1> , <#q-why-solid-2a-d2> , <#q-why-solid-2a-d3> .

<#q-why-solid-2a-d1> a solid-memo:Distractor , schema:Answer ;
    solid-memo:formatVersion 1 ;
    solid-memo:distractorText "Users can install more apps on the same device"@en ;
    solid-memo:distractorNote "How many apps fit on a device has nothing to do with it; …"@en .
```

[`decks/solid-fundamentals/v1.ttl`](../decks/solid-fundamentals/v1.ttl),
the first course, written in Markdown, is the complete example. The
terms are in
[vocab.md](vocab.md#courses), the shapes in [shapes.md](shapes.md), and
the rules the shapes cannot state in
[deck-library.md](deck-library.md#course-rules).

### Order

- Chapters are ordered by position, and so are a chapter's steps. A tie,
  which the library check refuses, is broken by fragment id.
- RDF keeps no order among the values of one predicate. So a step's
  questions and a chapter's review questions are ordered by fragment id.
  A release orders them by how it names them (`q-why-solid-2a`,
  `q-why-solid-2b`).
- The final review has no subject of its own. It asks every card the
  chapter's steps check, plus its review questions, each once, shuffled
  (`finalReviewQueue`).
- The options of a question are the card's back and each of its
  distractors, shuffled (`choicesOf`). The text is shown in the reader's
  language.
- A retired chapter or step (`owl:deprecated true`) is left out of the
  outline (`courseOutlineFromRecords`), with every step of a retired
  chapter.
- A retired distractor (`owl:deprecated true`) is never offered: it is
  left out wherever a card's distractors are read (`distractorsOf`), and
  in any order the release lists them, a card's distractors are read by
  id. An upgrade then removes it from the copies that have it.

## The learner's state

The learner's state is kept in documents the pod already has, with no
new type-index entries ([data-model.md](data-model.md#courses)):

| Where | What |
|---|---|
| `catalog.ttl` | The course's deck: `prov:wasDerivedFrom <release>`, and one `sm:completedChapter <release#ch-…>` per chapter completed. |
| `decks/<deckId>.ttl` | The cards answered so far, each with its `sm:Distractor` subjects, under the release's fragment ids. |
| `reviews/<deckId>.ttl` | An ordinary front→back review state per card answered. |
| `history/<YYYY-MM>.ttl` | An `sm:Answer` per graded answer, with `sm:answerMode sm:multipleChoice` and, when the answer was wrong, `sm:chosenDistractor <…#d1>`. |

- **A card joins the deck when its question is answered.** Starting a
  course creates an empty deck. Answering a question for the first time
  writes the card, its distractors and its first review state. Study can
  therefore never show a card the learner has not reached, and needs no
  rule to hide them. An older app sees a plain deck.
- **Progress is derived, not stored** (`courseProgress`):
  - A card is answered when it has a front→back review state.
  - A step is done when every card it is checked by is answered. The
    learner resumes at the first step that is not done.
  - A chapter is open once every chapter before it is completed, and
    locked until then. It is done once completed, whatever comes before
    it.
  - Only a chapter's completion is written: the final review passed.
  - A completion counts by the chapter's fragment id, so it holds in
    whichever release the deck follows: an upgrade from `v1.ttl` to
    `v2.ttl` keeps `sm:completedChapter <v1.ttl#ch-…>`, and a chapter
    `v2.ttl` keeps under that id stays done.

## The learner's flow

1. **Start.** A library deck whose release is a course is marked as one
   (`LibraryDeck.isCourse`, from `schema:Course` in the index). Starting
   it (`startCourse`) copies the release's metadata into an empty deck
   (`importDeck` with no cards). An instance that already has a copy of
   any release of the course gets that copy back: a course is started
   once.
2. **A step.** The learner reads the theory, then answers each question.
   After an answer the app says whether it was right. A wrong choice
   shows its distractor's note. The right answer is shown as the card's
   back, with its `sm:backNote`. The first answer to a question adds the
   card to the deck ("Added to your deck").
3. **The final review.** Once every step is done, the chapter's final
   review asks all its questions, shuffled. A question answered wrongly
   comes back until it is answered right. Then the chapter is completed
   (`completeChapter`), which opens the next.
4. **Afterwards.** The cards are studied like any deck's, by
   flip-and-grade ([srs.md](srs.md)). A step can be revisited and a
   chapter retaken at any time, as practice.

How each answer is graded, and when it is graded at all, is in
[srs.md](srs.md#multiple-choice-answers-in-a-course). The screens and
their routes are in [routing.md](routing.md).

## Use cases and ports

| Use case | Does |
|---|---|
| `startCourse(instanceUrl, course)` | The instance's deck of the course: the copy it has (`isCopyOf`), else a new, empty copy of the current release. |
| `getCourse(deck)` | The course as the learner has it: the deck as its entry is now, the release, its outline, its cards by id, the cards answered and the progress. Writes nothing. A deck that is gone throws `deckGone`. |
| `answerCourseQuestion(instanceUrl, deck, card, choice, now)` | Grades one answer as `courseAnswerEffect` says. A card introduced is written first (`applyCardChanges`), then graded, so a review state never exists without its card. Returns the effect and the card's state. |
| `completeChapter(deck, chapterUrl)` | Adds `sm:completedChapter` to the deck's entry. |

Two ports gained a method ([ports.ts](../packages/application/src/ports.ts)):

- **`DeckLibrary.fetchCourseOutline(releaseUrl)`** reads the chapters and
  steps of a release (`toCourseOutline` in
  [libraryMapper.ts](../packages/solid/src/mappers/libraryMapper.ts)),
  each with its shape and brought up to its latest format. The adapter
  ([solidDeckLibrary.ts](../packages/solid/src/solidDeckLibrary.ts))
  reads each release document once, for both its cards and its outline.
- **`DeckRepository.completeChapter(deck, chapterUrl)`**
  ([solidDeckRepository.ts](../packages/solid/src/solidDeckRepository.ts))
  adds the one triple with a PATCH made only if `catalog.ttl` is as it
  was read (If-Match). On a 412 it reads the document and tries again,
  three attempts in all, as an edit of the
  [deck groups](data-model.md#deck-groups) does. A chapter completed
  already writes nothing. The write is not shape-checked:
  `sm:completedChapter` belongs to no shape.

The deck's distractors are written and removed with its cards
(`withDistractors` and `distractorsOf` in
[deckMapper.ts](../packages/solid/src/mappers/deckMapper.ts)). An edit
that states no distractors, as the card editor's does, keeps the card's.
Removing a card removes the distractors it names.

The tests that hold this against a real server are in
[courses.integration.test.ts](../e2e/pod/src/courses.integration.test.ts).

## Writing a course

A course is written as any library deck is
([deck-library.md](deck-library.md#publishing-a-new-version)), with
these additions:

1. Type the release `schema:Course` too, and set
   `sm:studyDirection sm:frontToBack`.
2. Add the chapters and steps, each with `sm:formatVersion 1`,
   `schema:isPartOf` and a `schema:position` of its own among its
   siblings. A chapter's title and a step's theory are language-tagged
   text, one per language, one of them English.
3. Write every question as a card (format 5) with text on its back. Ask
   it from one place only: one step's `sm:checkedBy`, or one chapter's
   `sm:reviewQuestion`.
4. Give each card at least two distractors (the first course gives
   three), each with `sm:formatVersion 1`, text in every language its
   back has and a note on why it is wrong. A back in no language (code,
   a number) is untagged or `zxx`, and so are its distractors' texts.
   Write wrong options that are plausible and of the same form as the
   right one, never "all of the above".
5. Name the subjects so their order reads from the ids: chapters
   `ch-<topic>`, steps `ch-<topic>-<n>`, a step's questions
   `q-<topic>-<n><letter>` (`q-why-solid-2a`, `q-why-solid-2b`), review
   questions `q-<topic>-r<nn>` (`q-why-solid-r01`) and distractors
   `<question>-d<n>` (`q-why-solid-2a-d1`).
6. To write theory, a chapter's description or a question in Markdown
   (code, tables, lists), state `sm:textFormat sm:markdown` on that
   step, chapter or card ([deck-library.md](deck-library.md#authoring-markdown)).
   A question's options are then one paragraph each, its back included,
   and hold no links.
7. Keep the attribution and the review rounds as every authored deck
   does ([deck-library.md](deck-library.md#provenance)).
8. `npm run format:turtle`, then `npm run library`, which runs the
   course checks ([deck-library.md](deck-library.md#course-rules)) and
   the Markdown checks ([deck-library.md](deck-library.md#markdown-rules)).

**A new version** follows the library's rule. Nothing published is
removed: a chapter, step, card or distractor that should go is retired
(`owl:deprecated true`). Ids are never reused, since learners' decks
keep them:

- **A chapter keeps its id** only while it teaches what it did. One that
  grows into far more gets a new id, and the old one is retired;
  otherwise a learner who completed it would count as done with steps
  they never saw, and the course would not lead them there.
- **A step's id carries nothing over**: its progress comes from its
  cards.
- **A card asked again keeps its id**, and with it the learners' review
  history, even when its text is rewritten.
- **A distractor keeps its id only while it is the same wrong answer**,
  since a learner's history names the option they chose by its id
  (`sm:chosenDistractor`). A wrong answer that changed is retired, and
  the new one gets a new id (`<question>-d4`, …).
- **The order still reads from the ids**: in a step that asks a kept
  card beside new ones, name the new ones so the ids sort in the order
  the step asks them.

Each learner's deck follows the release it was copied or
last upgraded to, and its outline with it. An upgrade of a course's deck
adds no cards: the learner reaches new questions through the course.
It still changes, retires and restores the cards the deck holds, their
distractors included
([migrations.md](migrations.md#catching-up-with-the-library)). An
upgrade is offered only when it changes something the deck holds or
describes. A release that only adds chapters and their cards changes
none of that, so it is offered only when, say, its description changed
too.

## Why schema.org

- **Others can read it.** `schema:Course`, `schema:Syllabus`,
  `schema:LearningResource` and `schema:Answer` are what search engines
  and learning tools already understand. Typing the release, chapters,
  steps and distractors with them tells such a tool what it is looking
  at without knowing Solid Memo.
- **They are extra types, not the shape's class.** A shape is picked by
  a Solid Memo class (`CLASS_NAMESPACES` in
  [packages/vocab/tooling/shapes.ts](../packages/vocab/tooling/shapes.ts)),
  so each subject also has an `sm:` class: `sm:Chapter` is a subclass of
  `schema:Syllabus`, `sm:Step` of `schema:LearningResource`, and
  `sm:Distractor` of `schema:Answer`. A course needs no `sm:Course`: the
  release is already an `sm:Deck`, and a second `sm:` class would give
  it two shapes.
- **Properties are reused where they mean the same.** `schema:isPartOf`
  and `schema:position` place chapters and steps. `sm:position` is not
  used: its meaning is the arranged deck list. `sm:theory` and
  `sm:distractorText` are subproperties of `schema:text`, and
  `sm:distractor` and `sm:distractorNote` point at
  `schema:suggestedAnswer` and `schema:answerExplanation` with
  `rdfs:seeAlso`. They are terms of their own because their values
  follow Solid Memo's rules for text ([vocab.md](vocab.md#the-language-of-text)).
- **No `rdf:List`.** Order is a position on each subject, which a
  version can change one triple at a time, and which SHACL can check.
