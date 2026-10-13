# Browsing and editing cards

The screens where a learner makes a deck, looks through its cards and
changes them, and where they look through a library deck before they
import it. A deck of one's own is edited in one place, the Browser;
a library deck can only be looked at, until it is imported.

The [Studio](studio.md) does the same work in bulk, for many decks
and cards at once. This page is about Solid Memo's own screens. Their
routes are in [routing.md](routing.md); writing a card in Markdown is
in [markdown.md](markdown.md#writing-markdown-in-the-app).

## The deck creator

`#/new-deck`, from "Create deck" under the deck list. It asks for one
thing, the deck's name, and the language the name is in. The language
starts as the one last chosen for a deck's text on this device, else
none: the app does not guess it from the page, and creating a deck
whose name has no language says so and puts the focus on the language
picker. Once created, the deck is on the deck list
([DeckCreatorScreen.tsx](../packages/ui/src/ui/DeckCreatorScreen.tsx),
[DeckCreatorContainer.tsx](../packages/ui/src/ui/DeckCreatorContainer.tsx)).

## The Browser

`#/browse`, from "Browser" on a deck's page. It is the one place a
deck and its cards are edited
([BrowserScreen.tsx](../packages/ui/src/ui/BrowserScreen.tsx),
[BrowserContainer.tsx](../packages/ui/src/ui/BrowserContainer.tsx)).
From the top:

- **Add card** opens the card creator (below).
- **About this deck**: "Describe deck" edits the deck's description,
  topics and keywords, each in the languages the learner states
  ([DeckAboutSection.tsx](../packages/ui/src/ui/DeckAboutSection.tsx)).
- **Study direction**: Front → back, Back → front, or Both ways. It can
  change at any time; what was learned in each direction is kept, and
  both ways schedules each direction on its own ([srs.md](srs.md#prompts-and-directions)).
- **Show retired cards**: a card the deck's library release no longer
  uses is *retired*. It keeps its review history but is no longer
  studied, and it is listed only when asked
  ([RetiredCards.tsx](../packages/ui/src/ui/RetiredCards.tsx)).
- **Cards to list**: while some card has a side that does not say which
  language it is in, the list can be narrowed to those cards ("No
  language stated"), each tagged so. A card still as its library release
  has it is left out: a later release settles it. Its route is
  `languages=unstated`.
- **The cards**, ten to a page, with their front, back and a Remove
  button. Opening a card's front goes to its page. Remove asks first;
  then the focus goes to the card now in that row, or to Add card when
  none is left, and a status line says what was removed.

The page and the filter are in the URL. Paging and changing the filter
replace the history entry, so Back leaves the Browser instead of
walking every page; opening a card pushes one, so Back from a card
returns to the same page and filter. A page past the last shows the
last ([Pager.tsx](../packages/ui/src/ui/Pager.tsx)).

## The card creator

`#/new-card`, from Add card in the Browser
([CardCreatorScreen.tsx](../packages/ui/src/ui/CardCreatorScreen.tsx),
[CardCreatorContainer.tsx](../packages/ui/src/ui/CardCreatorContainer.tsx),
[AddCardForm.tsx](../packages/ui/src/ui/AddCardForm.tsx)). Each side
of a card needs text, a picture (a web address), or both. Optional
fields add a description of each picture, read out to anyone who
cannot see it, a label shown above the back, and a note under each
side, shown once the answer is revealed
([CardContentFields.tsx](../packages/ui/src/ui/CardContentFields.tsx)).

- **Languages.** Each text is in the language the learner states. New
  text starts in the language the deck's cards usually have; after the
  first card of a deck there is usually nothing to choose.
- **Markdown** is off for a new card: "Format with Markdown" turns it
  on, with a formatting help and a preview of the card as it will be
  studied ([markdown.md](markdown.md#writing-markdown-in-the-app)).
- **One after another.** The page stays open after each card is added,
  so a batch is quick to enter. The form clears, a status line says
  "Card added.", and the front's field takes the focus. If adding
  fails, the draft is kept. "Back" returns to the Browser.

## A card's page

`#/card`, from a card's front in the Browser
([CardScreen.tsx](../packages/ui/src/ui/CardScreen.tsx),
[CardContainer.tsx](../packages/ui/src/ui/CardContainer.tsx)). It
shows the card as study shows it, then its editor: the same fields as
the card creator, and, under them, the card's **wrong options**. Those
are the other answers a [course](courses.md) shows beside the right
one when it asks the card as a multiple-choice question. Each can be
edited, retired or deleted, and gets a note on why it is wrong
([DistractorFields.tsx](../packages/ui/src/ui/DistractorFields.tsx));
one that the deck's library release published is only ever retired.
Hints under them point out an option that lacks a language the back
is in, or is in one the back is not, and too few options for a course.
Save writes the card and its wrong options at once; "Remove card" asks first, then returns to the
Browser. An unknown card falls back to the Browser.

Under the editor, the card's **history**: where it stands in each
direction (its interval, its next review, the day it was first
studied) and every answer to it, newest first
([statistics.md](statistics.md#a-cards-history)). The leeches and
hardest cards of the statistics link here.

## A library deck's cards

Before importing a [library](deck-library.md#in-the-app) deck, a
learner can look at it three ways, all read-only:

- **Browse cards** on the deck's library page opens `#/library-browse`:
  the Browser's table without its editing, paged the same way, retired
  cards listed only when asked
  ([LibraryBrowserScreen.tsx](../packages/ui/src/ui/LibraryBrowserScreen.tsx)).
- **A card** of that list opens `#/library-card`: both sides as study
  shows them, and a line that says to import the deck to study or edit
  it ([LibraryCardScreen.tsx](../packages/ui/src/ui/LibraryCardScreen.tsx)).
- **Preview**, in the library list and on the deck's page, opens
  `#/library-preview`: the deck's cards at random, one at a time, in
  the deck's direction. Reveal shows the answer and "Next card" goes
  on, for as long as the learner likes. Nothing is graded or recorded
  ([LibraryPreviewScreen.tsx](../packages/ui/src/ui/LibraryPreviewScreen.tsx),
  [LibraryPreviewContainer.tsx](../packages/ui/src/ui/LibraryPreviewContainer.tsx)).

All three read the release's cards once, from the library
(`UseCases.listLibraryCards`), and share them under one query. A deck
added from a link has none of them: it is read only to be added
([deck-library.md](deck-library.md#from-a-link)).

## How it is tested

- **Unit tests** at 100% coverage: the screens and containers named
  above are tested in the `*.test.tsx` files beside them in
  `packages/ui/src/ui/`. A part without a test file of its own, such as
  `AddCardForm.tsx`, `DeckAboutSection.tsx`, `RetiredCards.tsx` or
  `LibraryPreviewScreen.tsx`, is tested through the screen or container
  that shows it. The use cases they call are tested in
  `useCases.test.ts` ([testing.md](testing.md)).
- **User journeys** ([testing.md](testing.md#user-journeys)):
  - [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts)
    creates decks and adds cards with the card creator (steps 04, 05,
    07 and 08), previews a library deck (16), and describes an
    imported deck in English and Swedish in its Browser (18);
  - [markdown-card.journey.ts](../e2e/journeys/journeys/markdown-card.journey.ts)
    adds a card in Markdown, opens its page, edits it, and reloads to
    see that the pod kept it.

  Their page objects are `DeckCreator.ts`, `DeckBrowser.ts`,
  `CardCreator.ts`, `CardEditor.ts` and `LibraryPreview.ts` in
  [e2e/journeys/pages/](../e2e/journeys/pages/). The steps and
  screenshots of CI's run on the version the site runs are online at
  https://solid-memo.com/journeys/.
