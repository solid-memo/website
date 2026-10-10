# Studio

Solid Memo Studio is a second app beside Solid Memo, in the same page,
at `https://solid-memo.com/#/studio`. It is where users manage their decks.
Later it is also where creators build decks and courses and publish
them. For now it shows the decks of an instance in a table, changes
several of them at once, arranges them into groups, lists a deck's
cards to search, filter, sort, select, edit at once and move or copy
to another deck, and edits one card, its wrong options and its
schedule included, with its history of answers. It shows a deck's
schedule to come, its lapses and leeches, and everything wrong with a
deck or the instance. It lists the decks copied from the library, and
upgrades them to newer releases. It exports decks as Turtle or JSON-LD
files, and imports them. It also edits what
a deck says of itself (its authors and licence among it), a course's
progress, and the instance's name and catalogue. It keeps the drafts
of releases a creator writes in the instance: started from nothing,
from a deck, as the next version of a release or from a release saved
as a file, written (what a release says of itself, a course's outline,
its chapters, steps and questions, their wrong options), and deleted.

## What it shares with Solid Memo

The Studio is its own package, `@solid-memo/studio` in
[`apps/studio/`](../apps/studio/), with its own screens, tests and
router. It sits on the same layers as Solid Memo's app
([boundaries.md](boundaries.md)):

- Its entry point is `StudioWorkspace`, the signed-in Studio. Solid
  Memo's page ([`apps/web/src/App.tsx`](../apps/web/src/App.tsx))
  shows it for the hashes under `#/studio`.
- Around it is the page's one `AppShell` from `@solid-memo/ui`: the
  session restore, the landing page and its login, the connected Pod,
  the masthead, the language, the theme and the footer. At the Studio's
  routes the shell names the Studio (`STUDIO`, an `AppIdentity` in
  `ui`): its name, its tagline, its home (`#/studio`, where the
  masthead's wordmark goes) and a link back to Solid Memo.
- Its screens are in [`apps/studio/src/ui/`](../apps/studio/src/ui/),
  containers over use cases and screens over props, as in `ui`. They
  reuse `ui`'s components, such as `InstancePickerContainer`,
  `Breadcrumbs` and `ReaderText`.
- Its text is in `ui`'s message files, under `studio.*`, in English and
  Swedish ([i18n.md](i18n.md)).

Both apps are one page. So they share one session and one login
([authentication.md](authentication.md#session-restore)): a link from
one to the other is a hash link, which keeps the user signed in. A
login set off in the Studio, or a reload of one of its routes, comes
back to the Studio: the redirect drops the hash, and the session
gateway puts it back. They
also share the use cases, their cached queries (an edit in one shows in
the other), and the browser's storage: the guest's pod, the language
and theme chosen on this device, and the update journal. So while a
tab moves a guest's study into a pod, the others refuse to write to it
([guest-mode.md](guest-mode.md#as-a-new-instance)).

The Studio's code is a chunk of its own. The page fetches it the first
time a Studio route opens (`loadStudio`, in
[`apps/web/src/main.tsx`](../apps/web/src/main.tsx)), so a learner who
never opens the Studio never downloads it. Meanwhile, under the
masthead, the page says the Studio is opening; if the chunk cannot be
fetched (offline, or after a new deploy), it says so.

## Routes

The Studio has its own hash router
([`src/ui/router.ts`](../apps/studio/src/ui/router.ts)). It keeps the
hash with the same core as Solid Memo's router (`routerCore.ts` in
`ui`, [routing.md](routing.md)). Its hashes all start with `#/studio`
(`STUDIO_PATH`, `isStudioHash` in `ui`'s router); Solid Memo's are the
others.

| Hash | Screen |
| --- | --- |
| `#/studio/instances` | the instance picker. A new instance is made in Solid Memo, so its link goes to Solid Memo's storage picker. |
| `#/studio?instance=…[&q=…&sort=…&order=desc]` | Home: every deck of the instance as a table ([below](#home)). `q` filters it, `sort` names the column it is sorted by, and `order=desc` sorts it the other way. |
| `#/studio/groups?instance=…` | Groups: the instance's decks arranged into groups, as Solid Memo's deck list arranges them. |
| `#/studio/cards?deck=…[&q&field&lang&state&has&sort&order&page&size]` | the card workbench: a deck's cards as a table ([below](#card-workbench)). The deck names the instance: its catalog's folder. |
| `#/studio/card?deck=…&card=…[&tab=distractors\|schedule\|history&field=…]` | the card inspector: one card, its content, with `tab=distractors` its wrong options, with `tab=schedule` its review state, or with `tab=history` its answers ([below](#card-inspector)). The content is the default tab, and is left out of the URL. `field` opens it at one field: a text of the content (`front`, `backNote`…), or a wrong option by its id. |
| `#/studio/schedule?deck=…` | a deck's schedule: the reviews to come, its intervals and eases, its lapses and leeches ([below](#a-decks-schedule)). |
| `#/studio/about?deck=…` | a deck's about screen: what it says of itself, how it is studied and, for a course, the learner's progress ([below](#a-decks-about-screen)). |
| `#/studio/instance?instance=…` | the instance's name and its catalogue ([below](#the-instance)). |
| `#/studio/health?instance=…[&deck=…]` | everything wrong with the instance, or with one of its decks ([below](#health)). |
| `#/studio/library?instance=…` | the instance's copies of library releases, the newer releases and what upgrading would change ([below](#library-copies)). |
| `#/studio/transfer?instance=…[&deck=…&deck=…]` | import and export: the instance's decks to save as files, those of each `deck` ticked, and a file to make a deck of ([below](#import-and-export)). |
| `#/studio/drafts?instance=…` | the instance's drafts of releases, and a new one to start ([below](#drafts)). |
| `#/studio/draft?draft=…` | a draft's overview: what the release says of itself and, for a course, its outline ([below](#a-drafts-overview)). `draft` is the draft's release document, which names the instance. |
| `#/studio/chapter?draft=…&chapter=…` | a chapter of a course draft, by its id ([below](#a-chapter)). |
| `#/studio/step?draft=…&step=…` | a step of a course draft, by its id ([below](#a-step)). |
| `#/studio/question?draft=…&card=…` | a card of a draft, by its id: a course's question, or a deck's card ([below](#a-question)). |
| `#/studio/draft-cards?draft=…[&filter=…&lang=…&page=…]` | a draft's cards as a table ([below](#a-drafts-cards)): `filter` is `unasked`, `askedTwice`, `fewDistractors` or `retired`, `lang` a language. |

`#/studio/` and its query count as `#/studio`. Anything else under
`#/studio`, `#/studio` itself among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker, an unknown deck to its instance's Home, and an unknown card
(one removed, say) to its deck's cards. A chapter, step or card a draft
does not have (one deleted, say) falls back to the draft's overview.
Like Solid Memo's fallbacks, these replace the history entry.

Changing Home's filter or sort, the workbench's query, the
inspector's tab, the decks ticked to export, or the view of a draft's
cards, replaces the history entry: it is the same screen,
looked at another way, so Back leaves it.

Solid Memo links to Home as `#/studio?instance=…` ("Open in Studio",
in its instance bar, each deck's actions menu and the deck page;
[routing.md](routing.md)). A deck's link opens its instance's Home too.

The trail is Instances › Decks, then › Groups on the Groups screen,
› Cards of *deck* in the workbench, › Cards of *deck* › *card* in the
inspector, › Cards of *deck* › Schedule on a deck's schedule, › About *deck* on a deck's about screen, or › Name and
catalogue on the instance's screen, › Health on the instance's health,
› Health › *deck* on a deck's, › Library copies on the library
copies, › Import and export on import and export, and › Drafts on the
drafts. A draft's screens go on from › Drafts: › *draft* on its
overview, › *draft* › *chapter* on a chapter, › *draft* › *chapter* ›
Step 2 on a step, › *draft* › Cards on its cards, and › *draft* › Cards
› *card* on a question. The document title is the trail's
last step and "Solid Memo Studio". After a move, the screen's heading
takes the focus (`useScreenFocus`). The header has a link back to
Solid Memo, at the open instance's decks when there is one, and the
masthead names the Studio. The landing page and the Pod connection
screen have the link too (`headerLink` in `STUDIO`), so a visitor who
is not signed in can go back. The Studio's links into Solid Memo (a
deck's page, its preferences, a new instance) are Solid Memo's own
hashes.

The Studio's old address, `/studio/`, is a small page
([`apps/web/public/studio/index.html`](../apps/web/public/studio/index.html))
that sends `/studio/#/x` on to `../#/studio/x`. Its script runs under a
Content Security Policy that allows it alone, by its hash; a test
([studioRedirect.test.ts](../apps/web/src/studioRedirect.test.ts))
checks both.

## Home

Home ([`DeckTableContainer`](../apps/studio/src/ui/DeckTableContainer.tsx))
is a table with a row per deck. Its columns are:

- the deck's name, a link to its [about screen](#a-decks-about-screen),
  and its badges:
  **Library** for a copy of a library deck (it has
  `prov:wasDerivedFrom`), **Course** for a copy of a course, **Invalid
  data** when the instance's check finds a problem in its entry or its
  documents ([validation.md](validation.md)), and **Unreadable** when
  its cards could not be read;
- the groups it is in, outermost first, or "Top level";
- its direction, and its pace: new cards and reviews per day. A limit
  the deck does not set is the instance's, marked "(instance)";
- how many cards are due today and how many are new, as Solid Memo
  counts them (from the study digest when it is fresh);
- when it last changed (`dcterms:modified`, else when it was made);
- its cards, retired ones aside, a link to its cards in the
  [workbench](#card-workbench).

Beside a deck's name, its problems ([health](#health)), "3 problems", a
link to the deck's health. A deck is checked only once its row is on
the screen (`IntersectionObserver`), so a long table checks only the
decks the user scrolls to. A deck with no problem gets no badge.

Beside a library copy's name, "Release 2 out" when the library has a
newer release of it, a link to the [library copies](#library-copies).
It too is looked up once its row is on the screen: one read of the
library's index for every copy (`listLibraryUpdates`). A copy up to
date, or one whose library cannot be read, gets no badge.

Above the table are links to the [Groups](#groups) screen, to the
instance's [name and catalogue](#the-instance), to its
[health](#health), to its [library copies](#library-copies), to
[import and export](#import-and-export) and to its [drafts](#drafts);
with no decks yet, the name and catalogue, import and export, and the
drafts are still there. Below the table, Home lists the instance's
drafts, each with its kind and version, and links to them.

The table starts in the order the user arranged the decks. A column's
name sorts by it, then the other way, then back to that order; the
sorted column says so (`aria-sort`). A figure not known yet sorts last,
either way. The filter keeps the decks whose name, in any language, or
whose groups' names hold its text, case and accents aside. The domain
does both ([deckTable.ts](../packages/domain/src/deckTable.ts)).

Decks are selected by their checkbox, or all those shown at once. The
selected decks the table shows can be (a selected deck the filter hides
stays selected, but is left alone until it is shown again):

- **moved into a group**, or to the top level, at its end, in their
  order in the table (not when a newer version arranged the groups);
- **given a pace**: a limit left empty follows the instance's
  preferences again;
- **given a direction**;
- **exported**: Export opens [import and export](#import-and-export)
  with them ticked;
- **deleted**, with their cards, once the user confirms a question that
  names each deck.

Each is one write of `catalog.ttl`, made in turn with the other writes
of the catalog, and the table is read afresh after it
([data-model.md](data-model.md#deck-groups)). A deck set aside cannot be
selected, nor can any deck until the data check is done
([below](#data-set-aside)). While the arrangement is set aside, no deck
is moved into a group.

## Card workbench

The workbench ([`CardWorkbenchContainer`](../apps/studio/src/ui/CardWorkbenchContainer.tsx))
lists a deck's cards in a table, a row each: the front (a link to the
card), the back, when it is due, its interval and its ease, its lapses
([below](#a-decks-schedule)), when it was added, and its id. A retired card says so. A card studied both
ways shows the direction that needs the most work: the earliest due
day, the shortest interval and the lowest ease. A deck that is a copy
of a course says so: its cards are the course's questions.

The URL holds how the cards are looked at. The domain applies it
([cardQuery.ts](../packages/domain/src/cardQuery.ts)):

- `q`: text to find, case and accents aside. A card in Markdown is
  searched as its plain text ([markdown.md](markdown.md)).
- `field`: where to look: the front, the back, the notes, the label or
  the wrong options. Without it, all of them and the pictures'
  descriptions.
- `lang`: only text in this language (a regional form too: `sv` finds
  `sv-fi`), or `unstated` for a side whose language is not stated.
  With `q`, the text is looked for in that language only. The filter
  offers the languages of the cards' fronts and backs, and the URL's
  own when they do not have it.
- `state`: `live` (in use) or `retired`; or, for a card in use, where
  its schedule is. `new` has a direction never reviewed. `learning` was
  answered wrong last time. `young` has an interval under 21 days and
  `mature` one of 21 or more (`MATURE_INTERVAL_DAYS`, as in the
  statistics). `due` is due by today's study day. A card studied both
  ways is in a state when either direction is. `leech` was forgotten 4
  times or more (`LEECH_LAPSES`, [below](#a-decks-schedule)).
- `has`: a `picture`, `distractors` (wrong options), `markdown` or
  `notes`.
- `sort` and `order=desc`: by `id`, `created`, `front`, `back`, `due`,
  `interval`, `ease` or `lapses`. A column's name sorts by it, then the other way,
  then back to the deck's order, as on Home. A side sorts by the text
  the table shows the reader (as plain text, when in Markdown), in the
  order of the UI's language. Case and accents count no more than in
  the search, unless that language makes a letter of its own of one:
  in Swedish, `ä` comes after `z`. Numbers sort by value. A card
  without the value (one never studied) comes last, either way.
- `page` and `size`: 10, 50 (the default) or 200 cards a page, with the
  same pager as Solid Memo's Browser.

A change of the search or a filter goes back to the first page.

Cards are selected by their checkbox, or all those on the page at once.
The selection stays while the view changes, and a status line counts
it. The keys say so on the screen: **j** and **k** move between the
rows, **x** selects one, and **Enter** opens it. They work wherever the
focus is: from outside the table, **j** goes to the first row. The keys
are left to the search and the filters while they have the focus.

The selected cards can be edited at once ([below](#bulk-edits)).

The lapses column counts each card's wrong answers (below grade 3) in
the [answer log](data-model.md#the-answer-log). The log goes back only
so far, so a line above the table names the month of the deck's first
answer in it: "since March 2025". The workbench reads the whole log once (`loadAnswerLog`). While
it is read, the cards show without their lapses, and a query that needs
them (`state=leech`, `sort=lapses`) waits. When it cannot be read, the
line says so, and such a query shows why. The header links to the
deck's [schedule](#a-decks-schedule), its [health](#health) and its
export ([import and export](#import-and-export), the deck ticked).

A card opens in the [card inspector](#card-inspector). The
workbench reads the cards and the review states with the same queries
as Solid Memo, and the instance's preferences for today's study day.
A time-budget test keeps a query over 5,000 cards fast.

## Bulk edits

The selected cards the query keeps can be edited at once, on any page
([`CardBulkActions`](../apps/studio/src/ui/CardBulkActions.tsx)). A
selected card the query hides stays selected, but is left alone. The
edits are:

- **Retire** and **Restore**. A retired card keeps its review state.
- **Write in Markdown** and **Write as plain text**. Plain text is
  written as `sm:plainText`, a choice of its own
  ([markdown.md](markdown.md)).
- **State language**: the language of the sides whose language is not
  stated yet, both or one of them. The text stays as it is.
- **Find and replace**
  ([`FindReplaceDialog`](../apps/studio/src/ui/FindReplaceDialog.tsx)):
  text as written (Markdown as its source), never a pattern. It looks in
  the fields ticked (the front, the back, the notes, the label, the wrong
  options and their notes), in one language or all, matching case and
  whole words when asked. A preview lists every text it changes, before
  and after, and every card it leaves as it is, and why. Nothing is
  written until the user confirms.
- **Delete**, with the cards' review states, once the user confirms:
  every SM-2 state of each card, read or not; another scheduler's state
  stays ([data-model.md](data-model.md#decks-and-cards)).
- **Set due date** and **Forget progress**, of the cards' review states
  in every direction ([below](#review-state)). A card not studied yet
  stays new. These have no Undo, and a forget asks first.
- **Move to deck…** and **Copy to deck…**, to another deck of the
  instance ([below](#moving-and-copying-cards)). These have no Undo.

The domain plans each edit
([cardBulk.ts](../packages/domain/src/cardBulk.ts), `planCardEdit`). A
card it would change must pass the card editor's validation
(`validateCardContent`), else it is left as it is. So is a card the
edit does not change, and one whose side or wrong option a replace
would leave empty. A note or a label left empty is removed, as in the
card editor. Text whose language is not stated cannot be changed
before its language is.

The use case `editCards` plans the edit again on the cards as they are
now. It writes it in one write of the cards document, made only if the
document is still as read (If-Match, one PUT:
[data-model.md](data-model.md#write-discipline)). Then it writes the
review states of deleted cards in one write of the reviews document,
and brings the deck's schedule in the digest up to date. When the cards
document changed meanwhile, or was made since it was read as absent, it
reads it and plans again, three times in all. Once that plan is not the
one the user previewed, it stops with "changed elsewhere", and nothing
is written. The deck's catalog entry
is untouched, as when a card is saved in Solid Memo. The end-to-end
tests hold this against real servers, a change made by another app
during the edit included
([cardEdits.integration.test.ts](../e2e/pod/src/cardEdits.integration.test.ts)).

After an edit, the status line says what it did, and **Undo** undoes
it: `undoCardEdit` writes the plan's inverse the same way, the deleted
cards' review states included. It does so only while the cards are as
the edit left them. The plan is kept in the page, never stored, so
Undo goes with the next edit, another deck, or leaving the page.

No edit takes a backup first. Solid Memo keeps no backups: the format
update and the library upgrade write each document in place, and the
backups the copying update made are gone
([migrations.md](migrations.md#the-backup)). A deletion or a find and
replace over many cards is guarded by its preview, its confirmation,
and Undo while the page stays open. What Undo cannot bring back is
what Solid Memo never knew: triples another app put on a deleted card
or its wrong options, and a second state of a card that was never
read.

## Card inspector

The card inspector ([`CardInspectorContainer`](../apps/studio/src/ui/CardInspectorContainer.tsx))
shows one card of a deck, named in its heading, with a link to its page
in Solid Memo. Its four tabs are links, the one shown marked
(`aria-current`):

- **Content**: Solid Memo's card editor (`CardContainer` in `ui`): the
  card as it is studied, its sides, pictures, notes, label and Markdown,
  Save, and Remove, which goes back to the deck's cards. Its wrong
  options are left to their own tab.
- **Wrong options**, with their number: the card's distractors
  ([`DistractorFields`](../packages/ui/src/ui/DistractorFields.tsx) in
  `ui`). Each shows its text, its note on why it is wrong, its id and
  how often a learner chose it (from the card's answers, as in its
  history), and is edited, retired, restored or deleted there. "Add a wrong
  option" writes a new one, in the back's language to start with. Each
  change is saved as it is made, as one write of the card
  (`updateCard`), which names each option with `sm:distractor` and
  `schema:suggestedAnswer` alike, and the status line says so. An
  option being written stays open until it is saved, so a failed save
  loses none of it.
- **Schedule**: the card's review state in each direction the deck
  studies, and in one it no longer does while a state is kept there
  ([`CardScheduleContainer`](../apps/studio/src/ui/CardScheduleContainer.tsx)).
  It shows when the card is due, its interval, ease and right answers in
  a row, and when it was first and last reviewed. A direction never
  studied says the card is new that way. Each state can be given a due
  day, or forgotten, once the user confirms ([below](#review-state)).
- **History**: the card's answers in its deck, newest first
  ([`CardHistoryScreen`](../apps/studio/src/ui/CardHistoryScreen.tsx)):
  when each was given, which way, its grade, how (recalled, or chosen
  among options in a course) and, for a wrong choice, the wrong option
  chosen. One no longer on the card is named by its id. A line says
  how many answers there are, and how many forgot the card. The use
  case `cardAnswers` reads them from the
  [answer log](data-model.md#the-answer-log) (`loadAnswerLog`). Only the
  deck's answers count: a card moved in from another deck starts its
  history again ([below](#moving-and-copying-cards)). Answers given
  before a library upgrade count, named by the card's id.

The domain makes each change
([distractors.ts](../packages/domain/src/distractors.ts)):

- `addDistractor` creates one only once it has text, under
  `nextDistractorId`: `<card>-d<n>`, `n` one more than the highest such
  id the card or its release has used. So an id the release published
  is never used again; one deleted before it was published may be.
- `editDistractor` changes its text and note, keeping its id and
  whether it is retired.
- `retireDistractor` and `restoreDistractor` mark it retired
  (`owl:deprecated true`), or in use again. A retired one is kept, but
  never offered.
- `deleteDistractor` removes it, once the user confirms, but only one
  the release the deck came from never published. One it did is refused
  at once: a learner's history may name it, so it is retired instead.
  While the release is read, every one counts as published.
- `distractorIssues` lists what is worth a look: an option in use that
  is not in exactly the back's languages, and fewer than two in use,
  which a course asks with. In a pod's deck these are warnings, never
  refusals.

A copy of a library deck or a course says how the card stands to the
release it came from. A card still as the release has it gets a
warning: an edit, of its content or its wrong options, detaches it, so
a newer release no longer updates it (it may still retire it). A card
already changed says that newer releases no longer update it
([migrations.md](migrations.md#catching-up-with-the-library)).

Solid Memo's own card page edits the wrong options too, under the
card's fields. There they are saved with the card, by its Save. Left as
they were, they follow the card as it is read afresh (a change in the
inspector meanwhile included), and the save does not state them, so the
card keeps its own.

While the deck is set aside, or the data check is under way, every tab
is shown but nothing in it can be changed ([below](#data-set-aside)).

Opened at a field (`field`, as the [health](#health) screen links to
one), the inspector puts the focus there: on the text, or on the wrong
option's Edit button (`data-arrival`, as `useScreenFocus` in `ui`
takes it). Another tab opens at none.

The inspector reads the deck's cards with the same query as the
workbench and Solid Memo, so an edit in one shows in the others. The
schedule tab reads the review states with the workbench's query too.

## Review state

The domain makes both changes
([reviewStateEdits.ts](../packages/domain/src/reviewStateEdits.ts)):

- `resetStates` forgets cards: their states go, so the scheduler sees
  them as new. The inspector forgets one direction; the workbench
  forgets every direction of the selected cards. Every SM-2 state of the
  card that way goes, read or not, so no second one is read in its
  place; another scheduler's state stays.
- `rescheduleState` sets a state's due day. Its interval, ease and
  repetitions stay. It drops the state's snapshot for resetting the
  study day (`previous`, [srs.md](srs.md#resetting-the-day)), so that
  reset can never bring back a state from before the new due day. A
  day that is no date is refused.

The states are those Solid Memo reads
([data-model.md](data-model.md#decks-and-cards)): joined to their card
by `sm:reviewOf` and `sm:reviewDirection`, the fragment rule only where
a state leaves them out, so a state another app named its own way is
edited in place. Only `sm:sm2` states are touched.

Neither touches the answer log: the card's answers stay in its history
and in the statistics. The use cases `resetCards` and
`rescheduleCards` read the deck's review states, write the change in
one write of the reviews document (none when no card has a state), and
bring the deck's schedule in the digest up to date. The screens then
read the review states afresh and drop the deck's study queue. The
end-to-end tests hold both against real servers
([reviewStateEdits.integration.test.ts](../e2e/pod/src/reviewStateEdits.integration.test.ts)).

## Moving and copying cards

**Move to deck…** and **Copy to deck…** open a form
([`TransferCardsDialog`](../apps/studio/src/ui/TransferCardsDialog.tsx)).
It offers the instance's other decks, and **Keep their progress**,
ticked to start with. It says what becomes of the cards' history. A
moved card leaves the selection.

The domain plans the transfer
([cardTransfer.ts](../packages/domain/src/cardTransfer.ts),
`planCardTransfer`):

- A card keeps its id when the target's cards document has no subject
  of that id, nor of its wrong options' ids. Else it gets the first free
  id of `<id>-2`, `<id>-3` and so on. Its wrong options are then
  renumbered after it (`<new id>-d1`, `-d2`…), as the inspector names
  new ones. The status line says how many cards got a new id.
- A card keeps its content, its creation time and whether it is
  retired. The target's document keeps its own links: the card is its
  deck's.
- Only what Solid Memo knows of a card goes with it. Triples another
  app put on the card or its wrong options are not copied to the
  target, and a move removes them from the source with the card
  ([data-model.md](data-model.md#write-discipline)).
- With **Keep their progress**, the card's review states go with it,
  under its id in the target, their snapshot for resetting the study
  day included. Without, the card starts as new there. A state is
  found by the card its `sm:reviewOf` names, whatever its subject is
  called, and is written in the target naming the card there
  (`sm:reviewOf` into the target's cards document), at the subject the
  fragment rule names, or a new `#review-<uuid>` when another's is
  there.
- A card written in the target names its wrong options with
  `sm:distractor` and `schema:suggestedAnswer` alike, each typed
  `sm:Distractor` and `schema:Answer`.
- A move then removes the cards from the source, with every SM-2 state
  they have, read or not. A copy leaves the source as it is. Another
  scheduler's states are never moved, copied or removed: they stay in
  the source, naming the card there.
- Past answers are not touched. They keep naming the source, so a
  moved card's history starts again in the target
  ([data-model.md](data-model.md#the-answer-log)).

The use case `transferCards` writes the target first: its cards
document in one write, made only if it is still as read (If-Match),
then its reviews document. For a move, it then writes the source's
reviews document, and last its cards document, If-Match too. A
document changed meanwhile, or made since it was read as absent, has
the whole transfer planned again, three times in all, then it stops with
"changed elsewhere". Then the schedules of the decks it touched are
brought up to date in the digest. The workbench reads both decks
afresh, and the instance's decks for their counts.

A move stopped half way (the target written, the source not, or only
its review states) leaves the cards in both decks, never in neither.
Making it again finishes it. The plan names the same ids each time,
and a card the target holds already under its id, saying the same, is
not written again; a state it has there is kept. Two cards of the
source saying the same are never both found at one id. The source's
states go before its cards: a card is never removed while its states
stay behind, where nothing would clean them up. The end-to-end tests
hold this against real servers, a move stopped before the source's
cards were written included
([cardTransfer.integration.test.ts](../e2e/pod/src/cardTransfer.integration.test.ts)).

## A deck's schedule

A deck's schedule ([`DeckInsightContainer`](../apps/studio/src/ui/DeckInsightContainer.tsx))
shows what its study will be. The domain computes it
([scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts),
[cardHistory.ts](../packages/domain/src/cardHistory.ts)), and the use
case `deckInsight` reads what it needs. It writes nothing to the deck.

- **Tiles**: the reviews today and in the next 7 days, the cards
  studied (each way), and the leeches.
- **Reviews to come**, the next 30 days (`forecastOf`), as bars, with a
  table. A day counts what falls due on it, and today what is due by
  today. The reviews a day are capped as study caps them: by the deck's
  pace, else the instance's preferences (`deckPreferences`), today's
  less what was reviewed today. What the cap holds back waits for the
  next day. The due days come from the deck's schedule in the
  [digest](data-model.md#the-digest) (`sm:dueOnDay`) while it was
  computed from the documents as they are (`freshSchedule`: the same
  versions, direction and day boundary). Else they come from the review
  states, and the digest is brought up to date.
- **Intervals and eases**, as bars, with tables: how many cards, each
  way, have each interval (1 day, 2–3, 4–7, up to a year and more) and
  each ease (from 1.3, in steps of 0.2). Only cards in use count, in
  the directions the deck studies.
- **Lapses and leeches.** A lapse is a wrong answer, below grade 3
  (`lapseIndex`), in the deck's answers in the
  [answer log](data-model.md#the-answer-log). The log goes back only
  so far, so the screen names the month of the deck's first answer in
  it. A leech is a card in use
  forgotten 4 times or more (`LEECH_LAPSES`, `leechesOf`), the most
  forgotten first. Each links to its card's history, and a link shows
  them all in the workbench (`state=leech&sort=lapses&order=desc`).
  A time-budget test keeps `lapseIndex` fast over five years of answers.

The charts are the statistics' own (`BarChart` and `StatTile` in `ui`):
a bar pointed at, or tapped, says what it holds, and each chart has its
figures as a table.

## A deck's about screen

The about screen ([`DeckAboutContainer`](../apps/studio/src/ui/DeckAboutContainer.tsx))
shows what a deck says of itself and how it is studied, with a link to
its page in Solid Memo. Each part has its own form, and a status line
says when a save is made:

- **Name**: the deck's name in every language it has, renamed as in
  Solid Memo's deck preferences (`renameDeck`).
- **About this deck**: its description, topics and keywords, with
  Solid Memo's own form (`DeckAboutSection` in `ui`, `describeDeck`).
- **Authors and licence**: an author a line, "Name" or "Name <email>",
  and a licence chosen from those offered (`KNOWN_LICENSES` in
  [license.ts](../packages/domain/src/license.ts), each named as
  `licenseLabel` names it). A licence another app wrote is offered too,
  so it can be kept. The domain tidies and checks them
  ([deckProvenance.ts](../packages/domain/src/deckProvenance.ts)): two
  authors that would share one agent node are refused, and the form
  stays until the save is made. Nothing here says anyone reviewed the
  deck. `setDeckProvenance` reads the deck's entry afresh and writes it
  again on a 412, three times in all.
- **Study**: its direction and its pace, a limit left empty following
  the instance's preferences, which are set in Solid Memo
  (`setDeckPace`, then `setDeckDirection` when that changed).
- **Languages**: its card sides whose language is not stated, set as in
  Solid Memo (`DeckLanguagesSection` in `ui`).
- **Course progress**, for a copy of a course: its chapters in order,
  each done, open or locked. A chapter done can be marked not done, and
  the course restarted, once the user confirms, so the first chapter
  opens again. A chapter completed that the release no longer has is
  listed by its id, to mark not done too. Answers and review states
  stay as they are either way (`setCompletedChapters`,
  [courses.md](courses.md#use-cases-and-ports)).

After a save the decks are read afresh, and the deck's study queue is
dropped, as Solid Memo does after a change of its pace.

## The instance

The instance's screen ([`InstanceAboutContainer`](../apps/studio/src/ui/InstanceAboutContainer.tsx))
shows where the instance is, and links to its study preferences in
Solid Memo. Its forms:

- **Name**: `renameInstance` writes it everywhere it is kept: the meta
  document, the catalogue and the type index registrations
  ([data-model.md](data-model.md#the-catalogue)). Then the instances
  are read afresh, so every screen names it anew. An empty name is
  refused.
- **Catalogue**: its description, required, and its licence, from the
  same list as a deck's (`describeCatalog`). Its publisher, the pod's
  owner, is shown, never edited. An instance without a catalogue (one
  not updated yet) says so instead. The form starts again from each
  read of the catalogue, as a rename can change its description.

Both forms are held until the data check is done, and while the
catalogue or a group is set aside ([below](#data-set-aside)).

The meta document and catalogue writes pass the shape check. The type
index renames have no shape, so they are If-Match writes only. Each
write is made again from a fresh read on a 412, three times in all. The end-to-end tests hold these edits
against real servers
([metadata.integration.test.ts](../e2e/pod/src/metadata.integration.test.ts)).

## Health

The health screen ([`HealthContainer`](../apps/studio/src/ui/HealthContainer.tsx))
shows everything wrong with a deck, or with the instance. It is there
for every user, not only in developer mode. "Check again" reads it all
afresh.

A deck's health is the use case `checkDeck`. The domain puts it
together ([deckHealth.ts](../packages/domain/src/deckHealth.ts)). A line
counts the problems, then the screen has four parts:

- **Data check**: the [shape check](validation.md) of the deck's
  subjects in the catalogue (its entry, its distribution and its
  authors' agent nodes), and of its cards and reviews documents
  (`deckReport`). It is made as the check made when
  an instance is opened: a document still at the version the
  [digest](data-model.md#the-digest) says conformed is not checked
  again. Each result says what is wrong, in the shape's own words, and
  links to where it is fixed: a card's field in the inspector
  (`cardSpotOf`, by the result's predicate), a wrong option, a review
  state on the schedule tab, or the deck's about screen (for its entry
  and its distribution). Solid Memo's
  own [repairs](validation.md#repair) of these are offered, and a
  subject no repair covers can be removed once the user confirms.
- **Languages**: the card sides that state no language, of the cards
  the user may settle (`unstatedSides`, as
  [deckLanguages.ts](../packages/domain/src/deckLanguages.ts) leaves out
  a card still as its release has it), each a link to its side, and a
  link to the about screen, which states them all at once. When the
  release cannot be read, which those are is not known, and it says so.
- **Cards that say the same** (`duplicateCardsOf`): cards in use with
  the same front and back, as plain text, in the same languages, and
  the same pictures. White space aside, case counts.
- **Markdown**: what the markdown package's check (`markdownProblems`)
  finds in the cards written in Markdown, field by field, held to the
  rules of the card editor's hints ([markdown.md](markdown.md)). The
  domain reads no Markdown: the screen passes the check in
  (`deckTextCheck` in `ui`).

Each counts toward the badge on [Home](#home): every violation
(warnings aside), every side to settle, every group of cards that say
the same, and every Markdown finding (`healthProblemCount`).

While the deck is held (set aside, or the instance blocked:
[below](#data-set-aside)), its forms change nothing, so the screen
does not send the user there. Every place is named, not linked, and a
line says why. The repairs and removals stay:
they are the way out. A problem no repair covers is then removed here,
or corrected in the pod by other means. What the deck's check finds
(as its screen opens, after a repair, or on "Check again") takes the
place of what the instance's check found of that deck
(`withDeckReport`), in the same place in its list, and that is what
holds it. So a deck mended either way is let go without a reload, and
without the whole instance being checked again. A check overtaken by
another, such as one still running when a repair is made, is dropped:
it read the pod before the repair.

The instance's health is the check made when it is opened
(`checkInstance`, the same query as Home's), with its repairs, then
every deck with its badge, a link to its own health. A result about a
deck (its entry, its distribution, a subject of its documents) links
to that deck's health. A badge checks its deck once: a repair or a
removal here reads every check of the instance afresh (their queries
are under its key); on a deck's health, only the deck's. The deck's
health is read afresh each time its screen opens. What a badge's check
finds holds its deck too, as above. The
end-to-end tests hold `checkDeck` against real servers, the documents
it checks again and a removal that clears it included
([deckHealth.integration.test.ts](../e2e/pod/src/deckHealth.integration.test.ts)).

## Library copies

The library copies screen ([`LibraryCopiesContainer`](../apps/studio/src/ui/LibraryCopiesContainer.tsx))
lists the instance's decks copied from a library release (they have
`prov:wasDerivedFrom`), a row each: the release it came from, the
library's current one, and what upgrading would change. It links to
Solid Memo's deck library.

The use case `listLibraryUpdates` reads the instance's decks and the
library's index once, however many copies of a deck there are. The
domain puts them together
([library.ts](../packages/domain/src/library.ts), `libraryCopiesOf`): a
copy of the current release, or of one the index lists as no older, is
up to date (`offersNewerRelease`, as Solid Memo's offer tells it). A copy
whose deck the index no longer lists says so. A release the index does
not list is an unknown release.

For each copy with a newer release, the screen asks what upgrading
would do (`planLibraryUpgrade`, the plan Solid Memo's deck page offers;
[migrations.md](migrations.md#catching-up-with-the-library)). It gives
the copy's series, as the index listed it, so the index is not read
again for each copy. It says so in a sentence, as Solid Memo does, and
"What changes" folds out the
rest: what history is kept, the new releases' notes, and the cards
added, changed, retired, brought back, removed, and left as the user
has them. A newer release with nothing for the copy says so.

The copies that can be upgraded are selected by their checkbox, or all
at once; a copy set aside cannot be, nor any until the data check is
done ([below](#data-set-aside)). **Update 2 decks** (as many as are selected) upgrades them one
after another, each with Solid Memo's own upgrade (`applyLibraryUpgrade`), on the plan the user saw: a
deck changed since is refused, and left as it was. Nothing about an
upgrade is new here. While it runs, the screen names the deck, "2 of 3",
and its steps. Then a line for each deck says the release it is at now,
or the step it failed at and whether the deck changed: one cut off
part-way can be studied as it is, and updating it again finishes it
([migrations.md](migrations.md#how-an-upgrade-is-applied)). A failure is
that deck's alone; the next is upgraded all the same. Everything an
upgrade touched is read afresh, the copies among it, and so is a failed
deck the upgrade changed in part. A failed deck is planned again too: it
may have changed in another tab. Each
upgrade still reads the index once more, to plan again with the deck as
it now is. The end-to-end tests hold `listLibraryUpdates` and a
batch of two upgrades against real servers
([deckUpgrade.integration.test.ts](../e2e/pod/src/deckUpgrade.integration.test.ts)).

A copy of a release outside the library's index (one imported by its
URL, once that can be) shows as no longer in the library: there is no
index to find a newer release in.

## Import and export

Import and export ([`TransferContainer`](../apps/studio/src/ui/TransferContainer.tsx))
saves decks as files and makes decks of files. A file is Turtle or
JSON-LD, one deck to a file, as
[data-model.md](data-model.md#decks-as-files) describes it.

**Export** lists the instance's decks, as they are arranged. The decks
ticked are in the URL, so Home's bulk Export and the workbench's link
open the screen with them ticked. The user picks the format and
whether their progress goes too: the cards' review states and a
course's completed chapters. **Export** saves each deck as a file of
its own, named after its title (`capitals.ttl`), one after another;
the screen names the deck it is at. The use case `exportDeckFile`
reads the deck's documents (`DeckArchive.exportDeck`) and hands the
text to the browser to save as a download (`FileExchange.save`). It
writes nothing to the pod. A browser lets a page start one download
by itself; for more, Chrome and others ask the user to allow several
downloads, and save none of the rest if they say no. The app cannot
tell, so after several decks the screen says how many it handed the
browser, not how many were saved, and that the browser may ask.

**Import** asks for a file (`openDeckFile`, `FileExchange.open`): a
`.ttl`, `.jsonld` or `.json` file. Its format goes by its name, else by
its text. The screen then says what the file holds: its deck, its
cards, its progress, how many of its parts were in an older format and
are brought up to date, and how many cannot be read and are left out.
A file in a newer format than the app reads is refused, as is one
without exactly one deck, or one that does not parse. **Import into**
the instance (`importDeckFile`) makes a new deck of it, with its
progress when the file has some and the user leaves it ticked. Its
cards document goes first, only if none is at its URL yet, then its
review states, then its entry in the catalogue, so the deck shows only
once it is whole. One left behind by an import cut off makes the deck
take a fresh id, once. The deck's schedule in the digest is then
brought up to date, and the screen links to the deck's cards. Every
query of the instance's decks is read afresh.

The deck is written as any deck Solid Memo writes: its wrong options
named with `sm:distractor` and `schema:suggestedAnswer`, its states
naming their card in the new deck. It needs no type-index registration
of its own: the instance's registrations of its decks, cards and
review states cover it ([data-model.md](data-model.md#decks-as-files)).
While the data check is under way, or the catalogue is set aside, the
import is held ([below](#data-set-aside)); a file can still be read.

A file in a newer format is refused as `deckFileTooNew`, not as
`writtenByNewerApp`: that one refuses to save over pod data a newer
version wrote, while here nothing is saved over, and the file is what
the app cannot read.

Each write passes the shape check. Turtle and JSON-LD go through
`@inrupt/solid-client`, and files through the browser's own
`Blob` and file input: no new library
([boundaries.md](boundaries.md#files-without-a-vendor-library)). Unit
tests take a deck with Markdown, pictures, wrong options (one retired),
text in two languages, a retired card and review states through both
formats and back
([solidDeckArchive.test.ts](../packages/solid/src/solidDeckArchive.test.ts)),
and the end-to-end tests do so against real servers
([deckFiles.integration.test.ts](../e2e/pod/src/deckFiles.integration.test.ts)).

## Drafts

A creator writes a deck or a course as a **draft** of a release, in the
instance, before publishing it as a release others can add. The drafts
screen ([`DraftsContainer`](../apps/studio/src/ui/DraftsContainer.tsx))
lists the instance's drafts, each with its kind (deck or course), the
version it drafts and whether it is being written, was released, or
cannot be read; one is deleted, with its documents, once the user
confirms. Where and how a draft is kept is in
[data-model.md](data-model.md#drafts-and-releases); it is private, in
the private type index alone.

Each draft that can be read links to its [overview](#a-drafts-overview),
on this screen and on Home.

A new draft starts from

- **a blank deck or a blank course**, by its name in a language the
  user states: version 1 of a series of its own, with its Turtle
  distribution, a course studied front to back;
- **a deck of the instance** (`deckToDraft` in
  [deckToDraft.ts](../packages/domain/src/release/deckToDraft.ts)): what
  a release says and the deck does too, every card under its id, its
  retired ones and wrong options with it, its authors the release's
  agents, the first its publisher. What is the learner's own is left
  behind: where its documents are, its study caps, its place among the
  groups, a course's progress. A deck copied from a release names it
  (`prov:wasDerivedFrom`), which is no source of the new release: the
  screen says the deck is based on it, and offers to start the next
  version of that release instead, which keeps what its learners
  studied;
- **the next version of a release**, by its address, in the library or
  in a pod (`nextVersionDraft` in
  [releaseVersion.ts](../packages/domain/src/release/releaseVersion.ts)):
  the release whole, as version N + 1 after it, in its series, with no
  release time or notes yet. Everything it published is carried: no
  card, chapter, step or distractor of it can be deleted, only retired,
  and none of their ids can be another's; how it was made (its
  activities) is kept as it is;
- **a release saved as a file**, Turtle or JSON-LD, as it is
  (`releaseToDraft` in
  [releaseToDraft.ts](../packages/domain/src/release/releaseToDraft.ts)).

A release is made a draft only if its version is 1, 2, … and every id
in it is one a draft can keep: letters A to Z, digits, `.`, `_` and
`-`, starting with a letter or digit (`unsupportedIdOf`). A chapter is
kept in a document named after its id, which another id would not
survive; such a release is refused (`releaseIdUnsupported`) before
anything is written.

It is named after its title, or its release's name, unlike the
instance's other drafts of that version. The use cases are
`listReleaseDrafts`, `createReleaseDraft`, `getReleaseDraft`,
`editReleaseDraft` and `deleteReleaseDraft`
([releaseDrafts.ts](../packages/application/src/releaseDrafts.ts)), over
the `ReleaseDraftRepository` port. When a document changed
elsewhere meanwhile, the changes are made again on the draft as it is
now; if they are then refused because part of them was written before
(a chapter they add is there), what they changed is kept where nothing
else changed it (`mergedDraft`). What a release before a draft
published is read from that release (`dcat:prev`), once, since a
release never changes; while it cannot be read, everything the draft
has counts as published, so nothing is deleted that might have been. Making or deleting a draft
changes the catalogue, so both are held until the data check is done,
and while the catalogue is set aside ([below](#data-set-aside)). A
draft made with a deleted draft's name has its URL, so what the screens
read of a draft is forgotten when one is deleted or made.

A draft changes by `DraftChange`s
([releaseDraft.ts](../packages/domain/src/release/releaseDraft.ts),
`UseCases.editReleaseDraft`): what the release says of itself, its
agents, chapters and steps (added, edited, moved, retired, restored or
deleted, the chapters and steps in use numbered 0, 1, … again), cards
and their wrong options, where a question is asked, its sources, and
the checks it had. A change is refused, writing nothing, when it would
break what a release promises: deleting what an earlier release
published (it is retired instead), giving an id that is another
subject's or was an earlier release's, asking a card from a second
place, a course not studied front to back, or rewriting how an earlier
release was made. No change touches what an activity carried from an
earlier release states: one that would (removing an agent it names) is
refused. A check informs, and a source is used by, the activity of the
draft's own that generated the release; a next version, generated only
by activities carried over, is given one when it first needs it,
`#revision-<N>`. A check is recorded only as a machine's or an AI's,
in words that say it was no human review ("Scope: …; an AI check, not a
human review."). A creator names the ids, the way
[courses.md](courses.md#writing-a-course) says.

## Writing a draft

A draft is written in five screens: its overview, a chapter, a step, a
question, and its cards. They share the draft as one query, read once
(`getReleaseDraft`), and change it by `DraftChange`s
([below](#how-edits-are-saved)).

### How edits are saved

Every edit is made at once on the screen, then written in the pod
(`editReleaseDraft`), by the editor's hook
([draftEditor.ts](../apps/studio/src/ui/draftEditor.ts),
`useDraftEditor`):

- **Optimistic.** The draft on screen is the draft with the change
  made. A change the draft refuses (an id taken, say) is not made, and
  the screen says why.
- **Debounced.** Text is written once its document has been still for
  0.8 seconds (`DEBOUNCE_MS`). The changes typed in that time are
  written together. Leaving the screen, or an edit that is not typing,
  writes what waits first.
- **Debounced per document.** Typing in one document of the draft
  (`changedDocuments` in
  [draftLayout.ts](../packages/domain/src/release/draftLayout.ts)) waits
  on its own. A change of several documents (a move, say) is written at
  once.
- **Queued per draft.** The writes of a draft wait for one another, in
  one mutation scope, whatever their documents and whichever screen
  made them. Each write reads the draft after the writes before it, so
  the draft the last one returns holds them all. Only that one is put
  on the screen: an earlier one's would undo changes not yet written.
- **Said.** A status line says "Saving…" while a change waits or is
  written, then "All changes saved." A write that fails, or that the
  draft as it now is refuses, says why. Once the writes after it are
  done, the draft is read afresh: the screens then show what the pod
  has.

A draft released is frozen: every screen shows it, and changes nothing
in it. Its next version is started from the drafts. While the
instance's data check is under way, or blocks the instance, nothing is
changed either ([below](#data-set-aside)).

### A draft's overview

The overview
([`DraftOverviewContainer`](../apps/studio/src/ui/DraftOverviewContainer.tsx))
names the draft, its kind and version. Its title and description are
saved as they are typed. For a course, it shows the outline, adds a
chapter (its title, and its id), and lists the chapters retired, to
restore. It counts the draft's cards, with a link to their table; a
deck's cards are added here. The release check is not in the Studio
yet: a line says so where it will count the draft's problems.

### The outline

The outline ([`DraftOutline`](../apps/studio/src/ui/DraftOutline.tsx))
is a course's chapters in their order, each with its steps ("Step
1.2"), each step with the questions that check it, in the order of their
ids. Each links to its editor. Chapters and steps are arranged as the
deck list's groups and decks are, with the same code in `ui`:

- **Drag** (`deckTree/useDragReorder.ts`): a chapter among the chapters,
  a step anywhere in a chapter, or into a chapter by its header. The
  outline's rules (`OUTLINE_RULES`, `DropRules` in
  `deckTree/dropZones.ts`) keep a chapter at the top and a step in a
  chapter, and make no new group of two.
- **The row's menu** (`MoveItems`), for the keyboard and screen readers:
  up, down, and, for a step, to another chapter. It also retires the
  chapter or step, or deletes one no release published, once the user
  confirms.

Each move is a `moveChapter` or `moveStep` change (`outlineMove` in
[draftOutline.ts](../packages/domain/src/release/draftOutline.ts)). A
drop the draft no longer has a place for (it changed under the drag)
comes to nothing, and says so.

### A chapter

A chapter's screen
([`ChapterEditorContainer`](../apps/studio/src/ui/ChapterEditorContainer.tsx))
edits its title, always plain text, and its description, with "Format
with Markdown" (`sm:textFormat` of the chapter) and a preview as the
course's screen shows it. It orders the chapter's steps, up or down,
adds one, and restores one retired. It lists the questions asked only
in the chapter's final review, and adds one.

### A step

A step's screen
([`StepEditorContainer`](../apps/studio/src/ui/StepEditorContainer.tsx))
edits its theory, in each language it has, with "Format with Markdown"
(`sm:textFormat` of the step). In Markdown, each text is hinted at where
it would not show as meant, by the rules of prose (`PROSE`,
[markdown.md](markdown.md)). Under it, a preview shows the theory as the
course player does (`ProseField` in `ui`, with the player's
`DataProse`). The screen lists the questions that check the step, and
adds one: its front and back, and its id.

### A question

A question's screen
([`QuestionEditorContainer`](../apps/studio/src/ui/QuestionEditorContainer.tsx))
says where the card is asked: a step, a chapter's final review, or
nowhere yet. Choosing another moves it there (`moveQuestion`). Its
content is Solid Memo's card editor (`CardContentFields`), saved by
Save. Its wrong options are the inspector's own (`DistractorFields`),
each change saved as it is made (`distractorChanges`). A preview asks
the card as the course will (`CourseQuestion`, with `MultipleChoice`),
as typed: it can be answered, and asked again.

### A draft's cards

A draft's cards
([`DraftCardsContainer`](../apps/studio/src/ui/DraftCardsContainer.tsx))
are a table, a row each, by id: its front (a link to its editor), its
back, where it is asked, its wrong options in use, and its id. The URL
holds the view ([above](#routes)). The filters keep the cards asked
nowhere (in a course), asked from two places, with fewer than two wrong
options in use, or retired; the language keeps those with text in it on
their front or back. A page holds 50. A new card is added under the
table, asked nowhere yet.

### Ids

The id assistant
([courseIds.ts](../packages/domain/src/release/courseIds.ts)) suggests
each new subject's id, the way [courses.md](courses.md#writing-a-course)
names them: `ch-<title>` for a chapter, `<chapter>-<n>` for a step,
`q-<topic>-<n><letter>` for a step's question, sorting after its last,
and `q-<topic>-r<nn>` for a review question. The user may write another.
The field says at once when an id is none a subject can have, or one
the draft or a release before it has. A step asks its questions in the
order of their ids, and a published id is never renamed, so a new
question's id sorts after the step's last. Past `z`, it is the last's id
with a number after it. `idBetween` finds an id that sorts between two
others: a number after the first when one fits, else one made code unit
by code unit. A seeded property test checks that it keeps the order.

Nothing an earlier release published is deleted: a learner's progress
may name it. Its Delete is held, and the screen offers to retire it
instead. A wrong option it published is likewise only retired.

## Data set aside

Every Studio screen holds to the check Solid Memo makes when an
instance is opened, and to the user's invalid data policy
([validation.md](validation.md)). `useDataCheck` in `ui` reads both, with
the same queries as Solid Memo's workspace, so the check is made once
and again after a repair. A deck checked again on its own (its
[health](#health)) puts what that check found in its place:

- **Until the check is done**, nothing can be changed, under any policy
  but "only warn": a deck set aside is not known yet. The screens are
  shown, and say so.
- **A deck set aside** (under "set invalid data aside", one whose entry
  or documents have invalid data) is shown read-only in every screen:
  its about screen, its workbench (cards are found and selected, but no
  edit is offered), and its card inspector, every tab. A line says why,
  with a link to its [health](#health), where it is repaired. It is
  left out of every bulk action: Home and the library copies do not let
  it be selected, and moving or copying cards does not offer it.
  Groups does not rename or delete it.
- **The arrangement set aside** (the catalogue or a deck group invalid):
  Groups cannot be rearranged, Home moves no deck into a group, and the
  instance's name and catalogue, an import, and making or deleting a
  draft are held.
- **Under "block the instance"**, invalid data holds every deck and the
  instance, as a set-aside deck is held.
- **What another app wrote** only warns: it sets nothing aside.
- **A draft** is held while the check is under way, or blocks the
  instance. Drafts are not set aside one by one.

A held form is a disabled `fieldset` (`ReadOnlyScope`), so no control
in it can be used, while links still lead on; what is typed in it stays.
The health screen's repairs are never held: they are the way out. It
does not link a held deck's problems to its forms
([health](#health)).

## Groups

Groups ([`GroupsContainer`](../apps/studio/src/ui/GroupsContainer.tsx))
is Solid Memo's deck list without the study: the same screen
(`DeckListScreen`) and the same edits, kept by `useDeckTreeEditor` in
`ui`, which Solid Memo's `DeckListContainer` uses too. Decks and groups
are dragged, moved from their menus, grouped, renamed and deleted there.
What is not arranging (a deck's page, its preferences, a course, a new
deck, the library) opens in Solid Memo. As in Solid Memo, a deck set
aside says so, and nothing is rearranged until the data check is done,
nor while the arrangement is set aside. Unlike Solid Memo, a deck held
([above](#data-set-aside)) cannot be renamed or deleted either
(`deckHeld`), and a line says why, with a link to the instance's
health.

## How it is built and served

- The Studio has no page or build of its own. Solid Memo's Vite build
  ([apps/web/vite.config.ts](../apps/web/vite.config.ts)) bundles it,
  through the dynamic `import("@solid-memo/studio")` in
  `apps/web/src/main.tsx`, as a chunk of its own. Solid Memo's build
  test ([build.test.ts](../apps/web/src/build.test.ts)) checks that
  nothing the page loads up front holds any of the Studio, and checks
  the whole bundle, the Studio's chunk included, for HTML sinks
  ([markdown.md](markdown.md#safety)).
- `npm run build` and `npm run dev` therefore build and serve the
  Studio with the site: `npm run dev` serves it at
  `http://localhost:5173/#/studio`.
