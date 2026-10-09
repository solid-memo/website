# Studio

Solid Memo Studio is a second app beside Solid Memo, at
`https://solid-memo.com/studio/`. It is where users manage their decks.
Later it is also where creators build decks and courses and publish
them. For now it shows the decks of an instance in a table, changes
several of them at once, and arranges them into groups.

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

Anything else, `#/` among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker. Like Solid Memo's fallbacks, these replace the history
entry.

Changing Home's filter or sort replaces the history entry: it is the
same screen, looked at another way, so Back leaves it.

Solid Memo links to Home as `studio/#/?instance=…` ("Open in Studio",
in its instance bar, each deck's actions menu and the deck page;
[routing.md](routing.md)). The Studio has no screen of one deck yet, so
a deck's link opens its instance's Home.

The trail is Instances › Decks, then › Groups on the Groups screen. The document title is the trail's last
step and "Solid Memo Studio". After a move, the screen's heading takes
the focus (`useScreenFocus`). The header has a link back to Solid Memo
(`../#/`), at the open instance's decks when there is one. The landing
page and the Pod connection screen have it too (`headerLink` in the
Studio's `AppIdentity`), so a visitor who is not signed in can go back.

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
- its cards, retired ones aside, a link to its card list in Solid Memo.

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
