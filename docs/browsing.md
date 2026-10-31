# Browsing and editing cards

The screens where a learner makes a deck, edits its cards, and looks
through a library deck before importing it. A learner's own deck is
edited only in the Browser.

The [Studio](studio.md) does the same work in bulk. Routes are in
[routing.md](routing.md); writing a card in Markdown is in
[markdown.md](markdown.md#writing-markdown-in-the-app).

## The deck creator

`#/new-deck`, from "Create deck" under the deck list, asks for the
deck's name and the language it's in, which starts as the last one
chosen on this device for a deck's text, else none (never guessed
from the page). Creating a deck whose name has no language says so
and focuses the language picker. A created deck is on the deck list
([DeckCreatorScreen.tsx](../packages/ui/src/ui/DeckCreatorScreen.tsx),
[DeckCreatorContainer.tsx](../packages/ui/src/ui/DeckCreatorContainer.tsx)).

## The Browser

`#/browse`, from "Browser" on a deck's page
([BrowserScreen.tsx](../packages/ui/src/ui/BrowserScreen.tsx),
[BrowserContainer.tsx](../packages/ui/src/ui/BrowserContainer.tsx)).
From the top:

- **Add card** opens the card creator (below).
- **About this deck**: "Describe deck" edits the deck's description,
  topics and keywords, each in the languages the learner states
  ([DeckAboutSection.tsx](../packages/ui/src/ui/DeckAboutSection.tsx)).
- **Study direction**: Front → back, Back → front, or Both ways,
  changeable any time; each direction keeps its own progress and
  schedule ([srs.md](srs.md#prompts-and-directions)).
- **Show retired cards**: a *retired* card, one the deck's library
  release no longer uses, keeps its review history, isn't studied, and
  is listed only when asked
  ([RetiredCards.tsx](../packages/ui/src/ui/RetiredCards.tsx)).
- **Cards to list**: while a card has a side with no stated language,
  "No language stated" narrows the list to such cards, each tagged so
  (route `languages=unstated`). Cards unchanged from their library
  release are left out (a later release settles them).
- **The cards**, ten to a page, with front, back and a Remove button.
  Selecting a front opens the card's page. Remove asks first, then
  moves the focus to the card now in that row, or to Add card when none
  is left, and a status line says what was removed.

The page and the filter are in the URL. Paging and filtering replace
the history entry (Back leaves the Browser); opening a card pushes one
(Back returns to the same page and filter). A page past the last shows
the last
([Pager.tsx](../packages/ui/src/ui/Pager.tsx)).

## The card creator

`#/new-card`, from Add card in the Browser
([CardCreatorScreen.tsx](../packages/ui/src/ui/CardCreatorScreen.tsx),
[CardCreatorContainer.tsx](../packages/ui/src/ui/CardCreatorContainer.tsx),
[AddCardForm.tsx](../packages/ui/src/ui/AddCardForm.tsx)). Each side
needs text, a picture (a web address), or both
([CardContentFields.tsx](../packages/ui/src/ui/CardContentFields.tsx)).

- **Optional fields** per side: a picture description, read out to
  anyone who can't see it, and a note under the side, shown once the
  answer is revealed. A label above the side says what kind of thing
  it is ("Country" above the front, "Capital" above the back) and
  shows with it either way the card is studied.
- **Languages.** Each text is in the language the learner states,
  starting as the deck's usual card language, so after a deck's first
  card there's usually nothing to choose.
- **Markdown** is off for a new card. "Format with Markdown" turns it
  on, with formatting help and a preview of the card as study shows it
  ([markdown.md](markdown.md#writing-markdown-in-the-app)).
- **One after another.** The page stays open after each card: the form
  clears, a status line says "Card added.", and the front's field takes
  the focus. A failed add keeps the draft. "Back" returns to the
  Browser.

## A card's page

`#/card`, from a card's front in the Browser
([CardScreen.tsx](../packages/ui/src/ui/CardScreen.tsx),
[CardContainer.tsx](../packages/ui/src/ui/CardContainer.tsx)), shows
the card as study shows it, then its editor: the card creator's fields
and, under them, the card's **wrong options**. These are the other answers of a
[course](courses.md)'s multiple-choice question on the card.

- Each wrong option can be edited, retired or deleted, and gets a
  note on why it's wrong
  ([DistractorFields.tsx](../packages/ui/src/ui/DistractorFields.tsx)).
  One the deck's library release published is only ever retired.
- Hints under the options point out too few options for a course,
  and an option whose languages don't match the back's.

Save writes the card and its wrong options at once. "Remove card" asks
first, then returns to the Browser. An unknown card falls back to the
Browser.

Under the editor is the card's **history**: where it stands in each
direction and every answer to it, newest first
([statistics.md](statistics.md#a-cards-history)). The statistics'
leeches and hardest cards link here.

## A library deck's cards

Before importing a [library](deck-library.md#in-the-app) deck, a
learner can look at it three read-only ways:

- **Browse cards** on the deck's library page opens `#/library-browse`:
  the Browser's table and paging, retired cards listed only when
  asked, without editing
  ([LibraryBrowserScreen.tsx](../packages/ui/src/ui/LibraryBrowserScreen.tsx)).
- **A card** of that list opens `#/library-card`: both sides as study
  shows them, and a line saying to import the deck to study or edit it
  ([LibraryCardScreen.tsx](../packages/ui/src/ui/LibraryCardScreen.tsx)).
- **Preview**, in the library list and on the deck's page, opens
  `#/library-preview`: the deck's cards at random, one at a time, in
  the deck's direction, without end. Reveal shows the answer and
  "Next card" goes on. Nothing is graded or recorded
  ([LibraryPreviewScreen.tsx](../packages/ui/src/ui/LibraryPreviewScreen.tsx),
  [LibraryPreviewContainer.tsx](../packages/ui/src/ui/LibraryPreviewContainer.tsx)).
  A course's preview lists its chapters instead, each title a link to
  `&chapter=<id>`, which plays that chapter from its first step as the
  course does: each step's theory, then its questions, multiple choice,
  each explained. Nothing is graded or recorded, and the final review is
  left out. After a chapter's last question comes the next chapter, or the
  list after the last
  ([CoursePreviewScreen.tsx](../packages/ui/src/ui/CoursePreviewScreen.tsx),
  [CoursePreviewContainer.tsx](../packages/ui/src/ui/CoursePreviewContainer.tsx),
  `UseCases.getLibraryCourse`).

All three share one query that reads the release's cards once from
the library (`UseCases.listLibraryCards`); a course's preview reads its
outline with them, in a query of its own. A deck
added from a link has none of them: the app reads it only to add it
([deck-library.md](deck-library.md#from-a-link)).

## How it is tested

- **Unit tests** at 100% coverage: each screen and container above has
  a `*.test.tsx` file beside it in `packages/ui/src/ui/`. A part
  without one, such as `AddCardForm.tsx`, `DeckAboutSection.tsx`,
  `RetiredCards.tsx`, `LibraryPreviewScreen.tsx` or
  `CoursePreviewScreen.tsx`, is tested through
  the screen or container that shows it. The use cases they call are
  tested in `useCases.test.ts` ([testing.md](testing.md)).
- **User journeys** ([testing.md](testing.md#user-journeys)):
  - [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts)
    creates decks and adds cards with the card creator (steps 04, 05,
    07 and 08), previews a library deck (16), and describes an
    imported deck in English and Swedish in its Browser (18);
  - [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts)
    previews a course: a chapter opened from its list, its first
    step's theory, then a question (02b);
  - [markdown-card.journey.ts](../e2e/journeys/journeys/markdown-card.journey.ts)
    adds a card in Markdown, opens its page, edits it, and reloads to
    check that the pod kept it.

  Their page objects are `DeckCreator.ts`, `DeckBrowser.ts`,
  `CardCreator.ts`, `CardEditor.ts` and `LibraryPreview.ts` in
  [e2e/journeys/pages/](../e2e/journeys/pages/). CI's run on the
  deployed version, with steps and screenshots, is at
  <https://journeys.solid-memo.com/>.
