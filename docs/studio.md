# Studio

Solid Memo Studio is a second app beside Solid Memo, at
`https://solid-memo.com/studio/`. It is where users manage their decks.
Later it is also where creators build decks and courses and publish
them. For now it shows the decks of an instance in a table, changes
several of them at once, arranges them into groups, and lists a deck's
cards to search, filter, sort, select and edit at once.

## What it shares with Solid Memo

The Studio is its own package, `@solid-memo/studio` in
[`apps/studio/`](../apps/studio/). It sits on the same layers as
Solid Memo's app ([boundaries.md](boundaries.md)):

- Its [`src/main.tsx`](../apps/studio/src/main.tsx) calls
  `createAppUseCases` from `@solid-memo/composition`, as the name
  "Solid Memo Studio", and renders `StudioApp`.
- `StudioApp` is `AppShell` from `@solid-memo/ui` (the same as Solid
  Memo's `App`): the session restore, the landing page and its login,
  the connected Pod, the masthead, the language, the theme and the
  footer. Only the name and the tagline differ.
- Its screens are in [`apps/studio/src/ui/`](../apps/studio/src/ui/),
  containers over use cases and screens over props, as in `ui`. They
  reuse `ui`'s components, such as `InstancePickerContainer`,
  `Breadcrumbs` and `ReaderText`.
- Its text is in `ui`'s message files, under `studio.*`, in English and
  Swedish ([i18n.md](i18n.md)).

Both apps are served from one origin. So they share the browser's
storage: the guest's pod, the language and theme chosen on this
device, and the update journal. So while one app updates an instance,
the other refuses to write to it ([migrations.md](migrations.md)).
They also share the login library's session, but a session restores
only in the app it was logged in from
([authentication.md](authentication.md#two-apps-on-one-origin)). Moving
between the apps therefore takes a login in the other app, which the
identity provider usually answers without a password.

## Routes

The Studio has its own hash router
([`src/ui/router.ts`](../apps/studio/src/ui/router.ts)). It keeps the
hash with the same core as Solid Memo's router (`routerCore.ts` in
`ui`, [routing.md](routing.md)).

| Hash | Screen |
| --- | --- |
| `#/instances` | the instance picker. A new instance is made in Solid Memo, so its link goes to Solid Memo's storage picker. |
| `#/?instance=…[&q=…&sort=…&order=desc]` | Home: every deck of the instance as a table ([below](#home)). `q` filters it, `sort` names the column it is sorted by, and `order=desc` sorts it the other way. |
| `#/groups?instance=…` | Groups: the instance's decks arranged into groups, as Solid Memo's deck list arranges them. |
| `#/cards?deck=…[&q&field&lang&state&has&sort&order&page&size]` | the card workbench: a deck's cards as a table ([below](#card-workbench)). The deck names the instance: its catalog's folder. |

Anything else, `#/` among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker, and an unknown deck to its instance's Home. Like Solid
Memo's fallbacks, these replace the history entry.

Changing Home's filter or sort, or the workbench's query, replaces the
history entry: it is the same screen, looked at another way, so Back
leaves it.

Solid Memo links to Home as `studio/#/?instance=…` ("Open in Studio",
in its instance bar, each deck's actions menu and the deck page;
[routing.md](routing.md)). The Studio has no screen of one deck yet, so
a deck's link opens its instance's Home.

The trail is Instances › Decks, then › Groups on the Groups screen, or
› Cards of *deck* in the workbench. The document title is the trail's
last step and "Solid Memo Studio". After a move, the screen's heading
takes the focus (`useScreenFocus`). The header has a link back to
Solid Memo (`../#/`), at the open instance's decks when there is one.
The landing page and the Pod connection screen have it too
(`headerLink` in the Studio's `AppIdentity`), so a visitor who is not
signed in can go back.

## Home

Home ([`DeckTableContainer`](../apps/studio/src/ui/DeckTableContainer.tsx))
is a table with a row per deck. Its columns are:

- the deck's name, a link to its page in Solid Memo, and its badges:
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
- **deleted**, with their cards, once the user confirms a question that
  names each deck.

Each is one write of `catalog.ttl`, made in turn with the other writes
of the catalog, and the table is read afresh after it
([data-model.md](data-model.md#deck-groups)). A deck whose data is
invalid fails the write check, so a pace or direction that includes it
is refused, and nothing is written.

## Card workbench

The workbench ([`CardWorkbenchContainer`](../apps/studio/src/ui/CardWorkbenchContainer.tsx))
lists a deck's cards in a table, a row each: the front (a link to the
card), the back, when it is due, its interval and its ease, when it
was added, and its id. A retired card says so. A card studied both
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
  ways is in a state when either direction is.
- `has`: a `picture`, `distractors` (wrong options), `markdown` or
  `notes`.
- `sort` and `order=desc`: by `id`, `created`, `front`, `back`, `due`,
  `interval` or `ease`. A column's name sorts by it, then the other way,
  then back to the deck's order, as on Home. A side sorts by the text
  the table shows the reader, in the order of the UI's language. A card
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

A card opens in Solid Memo's card editor (`../#/card?…`), for now. The
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
- **Delete**, with the cards' review states, once the user confirms.

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

## Groups

Groups ([`GroupsContainer`](../apps/studio/src/ui/GroupsContainer.tsx))
is Solid Memo's deck list without the study: the same screen
(`DeckListScreen`) and the same edits, kept by `useDeckTreeEditor` in
`ui`, which Solid Memo's `DeckListContainer` uses too. Decks and groups
are dragged, moved from their menus, grouped, renamed and deleted there.
What is not arranging (a deck's page, its preferences, a course, a new
deck, the library) opens in Solid Memo.

## How it is built and served

- The Studio builds with `base: "./"` into `apps/studio/dist/`
  ([vite.config.ts](../apps/studio/vite.config.ts)). Its page has the
  same Content Security Policy as Solid Memo's, and its own build test
  ([build.test.ts](../apps/studio/src/build.test.ts)) checks it and the
  bundle as Solid Memo's does ([markdown.md](markdown.md#safety)).
- Solid Memo's build depends on the Studio's
  ([apps/web/turbo.json](../apps/web/turbo.json)), so `npm run build`
  builds the Studio first. Solid Memo's Vite build then copies
  `apps/studio/dist/` into `apps/web/dist/studio/` (`builtAppPlugin` in
  [publishApp.ts](../packages/vocab/tooling/publishApp.ts)). One artifact
  serves both apps ([deployment.md](deployment.md)).
- So build the site through turbo: `npm run build`, or
  `npx turbo run build --filter=@solid-memo/web`. `vite build` in
  `apps/web` (or `npm run build -w @solid-memo/web`) skips the Studio's
  build and copies whatever build is in `apps/studio/dist/`, perhaps an
  old one. With none there, it warns and publishes no Studio.
- The Studio reads the site's documents (the shapes, the vocabulary and
  the deck library) from the folder above it, where the site serves
  them.
- Both apps get the same build values (the commit and the shapes'
  ruleset) from `siteDefines` in
  [siteBuild.ts](../packages/vocab/tooling/siteBuild.ts).

`npm run dev:studio` serves the Studio from source on a port of its
own, with the site's documents beside it. Its link back to Solid Memo
opens the Studio again there; `npm start` serves both apps together.
