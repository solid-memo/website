# Courses

A course teaches a subject in chapters. A chapter is a sequence of
steps, each a short piece of theory that one or more multiple-choice
questions check, and ends with a final review of all its questions.
Every question the learner answers becomes a card in their own deck,
scheduled like any other ([srs.md](srs.md)).

A course is a [library](deck-library.md) release with an outline, and
the learner's copy is an ordinary deck, typed `schema:Course` like its
release. A course published elsewhere, such as in its creator's pod, is
added [from a link](deck-library.md#from-a-link) to its release and
plays like one from the library. The pure parts are in
[domain/course.ts](../packages/domain/src/course.ts), and the use cases
in [courses.ts](../packages/application/src/courses.ts).

## The model

- **A course is a library release** at `decks/<name>/vN.ttl`.
- **Questions are cards** (card format 5, or 6 with a front label):
  `sm:front` is the question and `sm:back` the right option.
- **Wrong options are subjects of their own.** Each is an
  `sm:Distractor` (and a `schema:Answer`, distractor format 1) in the
  document that holds its card, which names it with `sm:distractor`. It
  has text (`sm:distractorText`) and, optionally, a note on why it's
  wrong (`sm:distractorNote`).
- **The outline stays in the release.** Chapters (`sm:Chapter` and
  `schema:Syllabus`) and steps (`sm:Step` and `schema:LearningResource`)
  are subjects of the release, each part of its parent
  (`schema:isPartOf`) at its place (`schema:position`, 0 first). They're
  never copied into a pod: the learner's deck reads them from the
  release its `prov:wasDerivedFrom` names.
- **A step** has its theory (`sm:theory`) and the cards that check it
  (`sm:checkedBy`, one or more). Markdown theory may be in chunks, split
  at top-level thematic breaks (`---`,
  [markdown.md](markdown.md#chunks)). No term or shape marks the chunks;
  an app that doesn't chunk shows the breaks as rules.
- **A chapter** has a title and description, and may name cards asked
  only in its final review (`sm:reviewQuestion`): questions that combine
  its steps.
- **Text is plain unless its subject says otherwise.** A step, a chapter
  and a card may each state `sm:textFormat sm:markdown` (vocabulary
  1.15). Then the step's theory, the chapter's description (never its
  title) or the card's texts and its distractors' are Markdown
  ([vocab.md](vocab.md#text-formats)).

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
terms are in [vocab.md](vocab.md#courses), the shapes in
[shapes.md](shapes.md), and the rules the shapes can't state in
[deck-library.md](deck-library.md#course-rules). Those rules are the
domain's
([`courseRules.ts`](../packages/domain/src/release/courseRules.ts)):
`npm run library:check` runs them, and so can the Studio.

### Order

- Chapters are ordered by position, and so are a chapter's steps. A tie,
  which the library check refuses, is broken by fragment id.
- A step's questions and a chapter's review questions are ordered by
  fragment id (RDF keeps no order among one predicate's values), as
  [Writing a course](#writing-a-course) names them.
- The final review has no subject of its own. It asks every card the
  chapter's steps check, plus its review questions, each once, shuffled
  (`finalReviewQueue`).
- The options of a question are the card's back and each of its
  distractors, shuffled (`choicesOf`). Their text is in the reader's
  language, or first in the course's language (the deck's card language)
  when the learner chose one. On the course's screens, its title,
  description, chapters' titles and descriptions and steps' theory
  follow it too; the app's own text stays in the app's language. The
  learner picks it in the course's preferences, linked from its page,
  from every language the course states
  ([i18n.md](i18n.md#which-language)).
- A retired chapter or step (`owl:deprecated true`) is left out of the
  outline (`courseOutlineFromRecords`), and so is every step of a
  retired chapter. The steps are put under their chapters in one pass,
  so a release with thousands of chapters and steps takes no longer
  per step than a small one.
- A question that names no card of the release is left out of the
  outline (`outlineOfCards`), and so is a step left with no question.
  A chapter left with no step and no review question goes too, and the
  next chapter unlocks as if it weren't there. A chapter left with only
  review questions opens at its final review. The Studio refuses such
  a question before it publishes, but a release from another server
  may have one. The player, the progress and the statistics read the
  same outline, so they count the same questions.
- A retired distractor (`owl:deprecated true`) is never offered
  (`choicesOf` leaves it out), and an upgrade retires it in the copies
  that have it. It's kept, marked `retired`, wherever a card's
  distractors are read (`distractorsOf`): a learner's answers may name
  it and the [Studio](studio.md#card-inspector) may restore it. A card's
  distractors are read by id, in any order the release lists them.

## The learner's state

The learner's state is kept in documents the pod already has, with no
new type-index entries ([data-model.md](data-model.md#courses)):

| Where | What |
|---|---|
| `catalog.ttl` | The course's deck: typed `schema:Course` too, `prov:wasDerivedFrom <release>`, and one `sm:completedChapter <release#ch-…>` per chapter completed. |
| `decks/<deckId>.ttl` | The cards answered so far, each with its `sm:Distractor` subjects, under the release's fragment ids; each card names them with `schema:suggestedAnswer` too (since vocabulary 1.16; the frozen releases don't). |
| `reviews/<deckId>.ttl` | An ordinary front→back review state per card answered, naming its card (`sm:reviewOf`). |
| `history/<YYYY-MM>.ttl` | An `sm:Answer` per graded answer, with `sm:answerMode sm:multipleChoice` and, when the answer was wrong, `sm:chosenDistractor <…#d1>`. |

- **A card joins the deck when its question is answered.** Starting a
  course creates an empty deck, and the first answer to a question
  writes the card, its distractors and its first review state. Study
  never shows a card the learner hasn't reached, and an older app sees a
  plain deck.
- **Progress is derived, not stored** (`courseProgress`):
  - A card is answered when it has a front→back review state.
  - A step is done when every card that checks it is answered. The
    learner resumes at the first step that isn't done.
  - A chapter is open once every chapter before it is completed, and
    locked until then. It's done once completed, whatever comes before
    it.
  - Only a chapter's completion is written: the final review passed.
  - A completion counts by the chapter's fragment id, in whichever
    release the deck follows: after an upgrade from `v1.ttl` to
    `v2.ttl`, `sm:completedChapter <v1.ttl#ch-…>` marks the chapter
    `v2.ttl` keeps under that id done.

## The learner's flow

1. **Start.** A library deck whose release is a course is marked as one
   (`LibraryDeck.isCourse`, from `schema:Course` in the index). Starting
   it (`startCourse`) copies the release's metadata into an empty deck
   (`importDeck` with no cards), whose catalog entry says it's a course
   (`Deck.course`). A course is started once: an instance with a copy of
   any of its releases gets that copy back.
   - The deck list and the Studio tell a course by its deck
     (`useCopies`), even while the library's index loads or the course's
     host can't be reached. Only a copy made before decks said so is
     told by the index, or by its own release when added from a link
     ([data-model.md](data-model.md#courses)).
   - Until every chapter is completed, the course is offered above the
     deck list, headed "Your courses", with its chapters done and a
     button to go on where the learner left off; a course deck's menu
     leads to its page too. A line says these are the courses added and
     not finished yet, and that they run alongside the other decks: one
     need not be finished before adding more from the deck library.
   - While every deck of the instance is a course, a line under the
     courses says the deck library has ready-made decks and courses to
     study alongside, with a secondary Deck library button. It goes once
     a deck that isn't a course is on the list, or with the strip once
     every course is finished. It depends only on the instance's decks.
   - Each course in the strip has its deck's title, and is read only as
     far as the strip needs (`getCourseSummary`), once the deck list's
     arrangement is in. The library's index is read beside the
     arrangement, not after it.
2. **A step** comes in two phases.
   - The theory first, with no question shown, one chunk at a time from
     the first. "Part 2 of 3" says where the learner is, and takes the
     focus on a move to another chunk. Continue goes to the next chunk,
     and Back, from the second on, to the one before. Below the last
     chunk, a button goes on to the step's question(s), described by a hint
     that the theory isn't shown while answering.
   - Then the questions, one at a time, with the theory not rendered and
     no way back to it. After each answer the app says whether it was
     right: a wrong choice shows its distractor's note, and the right
     answer shows as the card's back, with its `sm:backNote`. The first
     answer to a question adds the card to the deck ("Added to your
     deck"). After the step's last question, Next goes to the next
     step's theory, or after the chapter's last step to the final
     review.
   - Every step, the one a chapter resumes at included, starts on its
     theory at its first chunk. The chunks are counted in the language
     the app shows the theory in, the course's first. On a switch to a
     language with fewer chunks (which a release the library checked
     never has), a chunk past the last shows the last.
3. **The final review** comes once every step is done, by Next or from
   the course's page. It opens on a word that every step of the chapter
   is done, and what the review is, with a button to start it, a link
   back to the course's chapters, and the focus on the heading. It asks
   the chapter's questions ([Order](#order)) without the theory, each
   taking the focus as it comes up. A question answered wrongly comes
   back until it's answered right. Then the chapter is completed
   (`completeChapter`), which opens the next; the review says so while
   that's saved, and when saving fails, with a way to try again. A final
   review reached some other way (a bookmark, a typed link, Back) for a
   chapter with steps not done goes to the chapter's first such step
   instead.
4. **Back to the chapters.** Once the chapter is completed and the
   course read afresh, the learner is back on the course's page. A
   learner who left the review while it was saved stays where they went,
   and nothing is cheered.
   - The page cheers the newly completed chapter with a word that it's
     done, and that the learner can go on or stop, and meanwhile add
     decks from the deck library and study them too. The word takes the
     focus, and Tab goes on to Continue, now to the next chapter, then
     to Deck library.
   - The chapter's Done badge pops with a burst of sparkles. When that
     was the last chapter left, the word says the course is complete, and
     three confetti shooters along the bottom of the page pop one after
     the other. Their confetti shoots up and flutters slowly back down,
     all in under five seconds.
   - The cheer lives in memory, not in the URL, and only until the
     learner goes elsewhere: a reload or a later visit doesn't show it
     again. The motion is decoration only, hidden
     from screen readers, and doesn't play when the reader asks for
     reduced motion.
5. **Afterward.** A finished course says so on its page, and that what
   to learn next is in the deck library, with a link back to the decks
   and a secondary Deck library button after it. Before then, the page
   has that button after Continue. The Studio's trial has neither. The
   cards are studied like any deck's, by flip-and-grade
   ([srs.md](srs.md)). A chapter can be retaken at any time as practice: a chapter whose steps
   are all done opens at its first step, each showing its theory again.
   The learner can't pick an earlier step to reread: the step a chapter
   opens at comes from the progress.

How each answer is graded, and when, is in
[srs.md](srs.md#multiple-choice-answers-in-a-course), and the screens
and their routes in [routing.md](routing.md). The chapter player is
`ChapterPlayerScreen` and `ChapterPlayerContainer`, and the review
between a chapter's theory and its questions `ChapterReviewScreen` and
`ChapterReviewContainer`, all in
[`packages/ui/src/ui/`](../packages/ui/src/ui/).

## The course for newcomers

The library's index may name one course to offer someone who has no
decks yet: `sm:newcomerCourse` on its catalog, pointing at the course's
series ([deck-library.md](deck-library.md#courses)). The app marks that
deck `LibraryDeck.forNewcomers` only when its series is in the index and
its current release is a course; anything else offers nothing.

- **Where it shows.** On the deck list of an instance that has no decks
  (empty groups don't count), a card offers the course right under the
  Decks heading (`NewcomerCourseContainer`, `NewcomerCourseOffer`).
  - It shows the course's title, its card count, "Start the course" and
    a link to its library page. It says what it is: a course for
    newcomers, where each answered question becomes a card and nothing
    needs finishing before other decks are added from the deck library.
  - It's a labeled landmark, not a section with a heading, and takes no
    focus; it comes right after the heading the screen focuses, in
    reading and Tab order.
  - While the library loads, when it can't be read, or when it names no
    course, there's no card. Creating an instance starts reading the
    library at once, so the card usually comes with the list.
- **Starting it** is `startCourse`, as from the course's library page:
  the deck list is read afresh, and the course opens. The card then
  goes, and doesn't come back while the instance has a deck. The course
  opens even when the instance's decks couldn't be read afresh: the
  course screen reads them.
- **Which course** is the library's choice: the app names no course. A
  contributor names another course, or `undefined` for none, in
  `NEWCOMER_COURSE`
  ([deckLibrary.ts](../packages/shacl/node/deckLibrary.ts)) and runs
  `npm run library`, which writes it into the index. The app needs no
  change. With none named, two journeys ([testing.md](testing.md)) are
  retired or moved to another way in: `newcomer-course.journey.ts`,
  which expects an offer, and `course-chapter.journey.ts`, which works
  through the offered course's first chapter (its theory in chunks) in
  Swedish. A course named instead states Swedish for its title,
  description, every chapter's title and its first step's theory, or
  the journey's course language changes with it.

## Use cases and ports

| Use case | Does |
|---|---|
| `startCourse(instanceUrl, course)` | The instance's deck of the course: the copy it has (`isCopyOf`), else a new, empty copy of the current release. |
| `importReleaseFromUrl(instanceUrl, release)` | Starts a course added from a link the same way (`readReleaseFromLink` reads and checks it first, [deck-library.md](deck-library.md#from-a-link)). |
| `getCourse(deck)` | The course as the learner has it: the deck as its entry is now, the release, its outline, its cards by id, the cards answered and the progress. Writes nothing. A deck that's gone throws `deckGone`. |
| `getCourseSummary(deck)` | For the deck list's strip: the outline of the release the deck names and the cards answered. The deck is taken as given, not read again, and the release's cards aren't mapped. Writes nothing. |
| `answerCourseQuestion(instanceUrl, deck, card, choice, now, times?)` | Grades one answer as `courseAnswerEffect` says, logging how long choosing took (`times.recallMillis`). A card introduced is written first (`applyCardChanges`), then graded, so a review state never exists without its card. Returns the effect and the card's state. |
| `completeChapter(deck, chapterUrl)` | Adds `sm:completedChapter` to the deck's entry. |
| `setCompletedChapters(deck, edit)` | The Studio's change of the chapters completed: one marked not done (in any release, by its fragment id), or the course restarted, none completed. Answers and review states stay. |

Two ports have methods for courses
([ports.ts](../packages/application/src/ports.ts)):

- **`DeckLibrary.fetchCourseOutline(releaseUrl)`** reads the chapters
  and steps of a release (`toCourseOutline` in
  [libraryMapper.ts](../packages/solid/src/mappers/libraryMapper.ts)),
  each with its shape and brought up to its latest format. The adapter
  ([solidDeckLibrary.ts](../packages/solid/src/solidDeckLibrary.ts))
  reads each release document once for its cards and outline. It takes
  any address: `getCourse` reads the release the deck names
  (`prov:wasDerivedFrom`) wherever it is, and nothing in the player
  knows where a course came from.
- **`DeckRepository.completeChapter(deck, chapterUrl)`**
  ([solidDeckRepository.ts](../packages/solid/src/solidDeckRepository.ts))
  adds the one triple to `catalog.ttl` with an If-Match PATCH, retried
  on a 412 ([data-model.md](data-model.md#courses)); a chapter completed
  already writes nothing. The write isn't shape-checked:
  `sm:completedChapter` belongs to no shape. The one other write of it
  is **`DeckRepository.addDeck(deck)`**, which writes the entry of a
  guest's deck [added to an
  instance](guest-mode.md#adding-to-an-instance) with the chapters the
  guest completed, the same way.
- **`DeckRepository.setCompletedChapters(deck, edit)`** removes the
  triples the edit drops (`editCompletedChapters` in
  [course.ts](../packages/domain/src/course.ts)) the same way. It's the
  Studio's edit of the entry, so it passes the shape check.

A deck's distractors are written and removed with its cards
(`withDistractors` and `distractorsOf` in
[deckMapper.ts](../packages/solid/src/mappers/deckMapper.ts)). An edit
that states no distractors keeps the card's; the card editor states none
while its wrong options are unchanged. The card editor and the Studio
edit them ([studio.md](studio.md#card-inspector)).

[courses.integration.test.ts](../e2e/pod/src/courses.integration.test.ts)
tests this against a real server.

## Writing a course

A course is written as any library deck is
([deck-library.md](deck-library.md#publishing-a-new-version)), with
these additions. The Studio writes a course in a draft in the pod the
same way, and suggests ids that follow step 5
([studio.md](studio.md#ids)).

1. Type the release `schema:Course` too, and set `sm:studyDirection
   sm:frontToBack`.
2. Add the chapters and steps, each with `sm:formatVersion 1`,
   `schema:isPartOf` and a `schema:position` of its own among its
   siblings. A chapter's title and a step's theory are language-tagged
   text, one per language, one of them English.
3. Write every question as a card with text on its back. Ask it from one
   place only: one step's `sm:checkedBy`, or one chapter's
   `sm:reviewQuestion`.
4. Give each card at least two distractors (the first course gives
   three), each with `sm:formatVersion 1`, text in every language its
   back has and a note on why it's wrong. A back in no language (code, a
   number) is untagged or `zxx`, and so is its distractors' text. Write
   wrong options that are plausible and of the same form as the right
   one, never "all of the above".
5. Name the subjects so their order reads from the ids: chapters
   `ch-<topic>`, steps `ch-<topic>-<n>`, a step's questions
   `q-<topic>-<n><letter>` (`q-why-solid-2a`, `q-why-solid-2b`), review
   questions `q-<topic>-r<nn>` (`q-why-solid-r01`) and distractors
   `<question>-d<n>` (`q-why-solid-2a-d1`).
6. For theory, a chapter's description or a question in Markdown (code,
   tables, lists), state `sm:textFormat sm:markdown` on the step,
   chapter or card
   ([deck-library.md](deck-library.md#authoring-markdown)). A question's
   options are then one paragraph each, its back included, and hold no
   links.
7. To have the learner read a step's theory in chunks, write it in
   Markdown with a thematic break between each two chunks: `---` with a
   blank line before and after it. Without the one before, `---`
   underlines the line above as a heading, which the check refuses.
   Every language of the theory has as many chunks, none of them empty:
   no break first, last, or right after another
   ([deck-library.md](deck-library.md#markdown-rules)). Break at a
   change of topic, where a learner could pause, and keep a chunk to
   about a screenful. A short theory needs no breaks.
8. Keep the attribution and the review rounds as every authored deck
   does ([deck-library.md](deck-library.md#provenance)).
9. Run `npm run format:turtle`, then `npm run library`, which runs the
   course checks ([deck-library.md](deck-library.md#course-rules)) and
   the Markdown checks.

**A new version** follows the library's rule. Nothing published is
removed: a chapter, step, card or distractor that should go is retired
(`owl:deprecated true`). Ids are never reused (learners' decks keep
them):

- **A chapter keeps its id** only while it teaches what it did. One that
  grows into far more gets a new id, and the old one is retired (guards
  against a learner counting as done with steps they never saw).
- **A step's id carries nothing over**: its progress comes from its
  cards.
- **A card asked again keeps its id**, and with it the learners' review
  history, even when its text is rewritten.
- **A distractor keeps its id only while it's the same wrong answer** (a
  learner's history names the chosen one, `sm:chosenDistractor`). A
  wrong answer that changed is retired, and the new one gets a new id
  (`<question>-d4`, …).
- **The order still reads from the ids**: in a step that asks a kept
  card beside new ones, name the new ones so the ids sort in the order
  the step asks them. The Studio's id assistant names a new question so,
  after the last or before the one chosen.

Each learner's deck follows the release it was copied or last upgraded
to, and that release's outline. The course's page offers an upgrade, as
the deck's page does, when the newer release changes something the deck
holds or describes, the outline, or a question the learner hasn't
reached. The outline is the chapters, steps, theory, their order and the
questions they ask (`sameOutline`). The upgrade adds no cards: the
learner reaches new questions through the course. It still changes,
retires and restores the cards the deck holds, with their distractors
([migrations.md](migrations.md#catching-up-with-the-library)). A release
that changes only the outline, or questions not reached yet, writes only
the deck's release. The learner then reads the newer outline and meets
the newer questions, and the chapters completed and the questions
answered are kept.

## Why schema.org

- **Others can read it.** [`schema:Course`](https://schema.org/Course),
  [`schema:Syllabus`](https://schema.org/Syllabus),
  [`schema:LearningResource`](https://schema.org/LearningResource) and
  [`schema:Answer`](https://schema.org/Answer) type the release,
  chapters, steps and distractors for search engines and learning tools
  that don't know Solid Memo.
- **They're extra types, not the shape's class.** A shape is picked by a
  Solid Memo class (`CLASS_NAMESPACES` in
  [packages/vocab/tooling/shapes.ts](../packages/vocab/tooling/shapes.ts)),
  so each subject has an `sm:` class too: `sm:Chapter` is a subclass of
  `schema:Syllabus`, `sm:Step` of `schema:LearningResource`, and
  `sm:Distractor` of `schema:Answer`. A course has no `sm:Course`: the
  release is already an `sm:Deck`, and a second `sm:` class would give
  it two shapes.
- **Properties are reused where they mean the same.** `schema:isPartOf`
  and `schema:position` place chapters and steps, not `sm:position`,
  which means the arranged deck list. `sm:theory` and `sm:distractorText` are
  subproperties of `schema:text`, and `sm:distractor` and
  `sm:distractorNote` point at `schema:suggestedAnswer` and
  `schema:answerExplanation` with `rdfs:seeAlso`; their values follow
  Solid Memo's rules for text
  ([vocab.md](vocab.md#the-language-of-text)).
- **No `rdf:List`.** Order is a position on each subject, which a
  version can change one triple at a time, and which SHACL can check.
