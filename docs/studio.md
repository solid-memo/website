# Studio

Solid Memo Studio is a second app beside Solid Memo, in the same page,
at `https://solid-memo.com/#/studio`. It is where users manage their
decks, and where creators write decks and courses and publish them.

To manage, it shows the decks of an instance in a table, changes
several of them at once, and arranges them into groups. It lists a
deck's cards to search, filter, sort, select, edit at once, and move or
copy to another deck. It edits one card, its wrong options and its
schedule, with its history of answers. It shows a deck's schedule to
come, its lapses and leeches, and everything wrong with a deck or the
instance. It lists the decks copied from the library or added from a
link, and upgrades them to newer releases. It exports decks as Turtle
or JSON-LD files, and imports them. It edits what a deck says of itself
(its authors and license among it), a course's progress, and the
instance's name and catalog.

To create, it keeps the drafts of releases a creator writes in the
instance. A draft is started from nothing, from a deck, as the next
version of a release, or from a release saved as a file. It is written:
what the release says of itself, a course's outline, its chapters,
steps and questions, their wrong options, and how it was made and from
what. It is checked by every rule a release is held to, previewed as
the library will list it, played in a sandbox as learners will play
it, compared with the release it follows, and deleted. A draft is
released by publishing it in the pod, where anyone can read it, or by
saving it as a file for the library. The releases an instance published
are listed, each to share or to start the next version of. A learner
adds a published release in Solid Memo from its link
([deck-library.md](deck-library.md#from-a-link)).

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
- Its text is in `ui`'s message files, under `studio.*`, in English,
  Swedish and Korean ([i18n.md](i18n.md)).

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

## Layout

The Studio is a workspace for authors, not a column to read
([`shell/StudioShell.tsx`](../apps/studio/src/ui/shell/StudioShell.tsx)).
It takes the whole window, and the window does not scroll:

- **The header** is one row: the sidebar's button, the masthead (the
  Studio's name, who is signed in, Log out), the open instance, the
  palette's button (**Search or run…**, [below](#quick-open-and-commands)),
  the theme and the language list, and the link back to Solid Memo. Who
  is signed in is cut short (to no less than 12rem) to keep it one row in
  a language of longer words. On a narrow screen (48rem or less) it is
  two: the button, the name and Log out, then the rest; who is signed in
  is left out there.
- **The open instance**, for a user with several, is a menu
  ([`shell/InstanceSwitcher.tsx`](../apps/studio/src/ui/shell/InstanceSwitcher.tsx)):
  each other instance, at its decks, and All instances, the picker.
- **The sidebar**, beside the main content while an instance is open
  ([`shell/StudioSidebar.tsx`](../apps/studio/src/ui/shell/StudioSidebar.tsx),
  a navigation named Studio), links to the instance's sections: Decks
  (Home), Groups, Drafts, Releases, Health, Library copies, Import and
  export, and Name and catalog. The one shown is marked
  (`aria-current`); beside Health, the number of problems the instance's
  check found, once a screen has made it (the sidebar makes none). Under
  them, the instance's decks, each at its cards, and its drafts, each at
  its overview with its version, the deck or draft shown marked, both
  kept to those whose name holds the filter above them, case and
  accents aside. They are the screens' own queries, so a deck or draft
  made, renamed or deleted shows there too. Above the decks, those opened
  last (Recently opened, five at most, the last first), but those pinned:
  each deck and draft has a pin beside it (**Pin** *name*, pressed while
  it is pinned), and those pinned are listed at the sidebar's top
  (Pinned), in the order pinned, above the sections. A deck is opened by
  any of its screens, a draft by any of its. Its button in the header, or
  Ctrl+B, hides it, and the main content takes its room; the device
  remembers. Hidden with the focus in it, it gives the focus to its
  button, as the aside and the dock give theirs, never to the page. On a narrow screen it is a drawer over the page, closed
  until its button opens it, and closed again by a link followed in it,
  a press outside it, Escape, or its own **Close**, since the drawer
  covers the button that opened it.
- **The main content**, beside it, scrolls on its own: the trail, the
  tabs of the deck or draft shown, then the screen. A table's header
  row stays in sight as it scrolls, and a table too wide for it scrolls
  it sideways; on a narrow screen such a table scrolls sideways in its
  own box.
- **The aside**, right of the main content, a complementary region
  named for what it shows: on a course draft's screens, its
  [outline](#the-outline), but on the overview, which shows the outline
  itself to arrange; on Home, the deck at its table's cursor (named
  Deck, [below](#home)); on the library copies, what upgrading the copy
  at their table's cursor would do (named Upgrade,
  [below](#library-copies)). Its button at the header's end, its own **Hide**,
  or Ctrl+\ hides it, and the main content takes its room; its
  splitter, on its left edge, sets its width (with the pointer, or the
  arrow keys, Home and End once it has the focus). The device remembers
  both. However wide it is set, the main content keeps 20rem beside the
  sidebar's room (the aside is at most the window less 35rem), so a
  width set on a wide window holds on a narrower one. On a screen 64rem
  wide or less it is a drawer over the page, at its right, closed until
  its button opens it, and closed again as the sidebar's drawer is; but
  Escape in a dialog of it (a question of the outline's) closes the
  dialog alone.
- **A card beside its deck's cards**: on a card's route, wider than
  64rem, the main content is the deck's [workbench](#card-workbench)
  and the aside, named Card, the [card inspector](#card-inspector). It
  is shown while the route names the card: its **Close**, or Ctrl+\,
  goes to the deck's cards alone, a Back stop as a link is. It has a
  splitter of its own, wider than the outline's. On a screen 64rem wide
  or less the card's route shows the inspector alone, as the main
  content.
- **The dock**, under the main content and the aside, a region named
  Panel: hidden until its button in the status bar, or Ctrl+J, shows
  it; the device remembers that, and its height, which its splitter on
  its top edge sets. Hidden from its **Hide** or with Ctrl+J, the focus
  in it goes to **Panel** in the status bar. It has two tabs ([below](#the-dock)): Problems
  and Activity.
- **The status bar**, at the foot, beside the site's footer, names the
  open instance, says on a draft's screens whether the draft is saved
  ("Saving the draft…", then "Draft saved", or "Last change not saved"
  when its write failed or the draft refused it;
  [below](#how-edits-are-saved)), and whether it can be published: **Ready
  to publish**, a link to its Release tab, while the release check finds
  no error that keeps it from it, **Released** once it is (both
  [below](#publishing-a-release)). Then it counts the problems of the deck or
  the draft shown (a button that opens the dock at them), saying, once,
  how many keep a draft from being published: "3 problems block
  publishing" when they all do (or the check shown is for another
  policy, which lists fewer), "5 problems, 3 block publishing" when some
  others do not. Then it shows or hides the dock (**Panel**), switches
  the density, and shows the keys (**? Keys**).

**Tabs.** A deck's screens have the deck's tabs, under the trail
([`shell/ContextTabs.tsx`](../apps/studio/src/ui/shell/ContextTabs.tsx),
a navigation named Deck): Cards (a card in the inspector among them),
Schedule, Health, About, and Export, which opens import and export with
the deck checked. A draft's screens have the draft's (named Draft):
Overview (its chapters and steps under it), Cards (its questions under
them), Check, which counts the problems the release check finds ("Check
3", heard as "Check 3 problems"), Preview, Trial, Changes (only for a
draft that follows a release) and Release. The one shown is marked
`aria-current="page"`; on a page under a tab (a card, a chapter, a step
or a question), that tab is marked `aria-current="true"`, so only the
page's own tab is the page. Both look the same, bold and underlined. Which
tabs a route has, and which is shown, is worked out from the route
alone ([`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts)).
The card inspector's tabs and the release check's policies are tabs of
the same kind.

The sidebar and the tabs are links: each is a Back stop. Hiding the
sidebar, the aside or the dock, opening a drawer, or sizing a pane, is
not.

**What each screen has around it**, worked out from its route alone
([`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts):
`sectionOf`, `deckOf`, `contextTabsOf`, `asideOf`):

| Screens | The sidebar marks | Tabs | The aside | The dock's problems |
| --- | --- | --- | --- | --- |
| the instances | no sidebar: no instance is open | none | none | none |
| Home | Decks | none (its views are its own) | the deck at the table's cursor (Deck) | none |
| the library copies | Library copies | none | the upgrade of the copy at the table's cursor (Upgrade) | none |
| groups, drafts, releases, the instance's health, import and export, name and catalog | that section | none | none | none |
| a deck's cards, schedule, health and about screen | the deck | the deck's | none | what the deck's health found |
| a card | the deck | the deck's, Cards marked as the card's | on a wide screen, the card (Card), the deck's cards in the main content; else the card is the main content | what the deck's health found |
| a draft's overview | the draft | the draft's | none | its release check's |
| a draft's other screens: its cards, check, preview, trial, changes and release | the draft | the draft's | a course's outline (Outline) | its release check's |
| a chapter, a step, a question | the draft | the draft's, Overview or Cards marked as theirs | a course's outline, the item edited marked | its release check's |

**What is saved, and when.** A draft's changes are saved as they are
typed or made, and the status bar says so ([below](#how-edits-are-saved)).
Elsewhere a button, a menu's item or a drag changes the pod at once
(asking first when something is lost), and what is typed into a form
waits for its Save: a card's content, its wrong options, a deck's or
the instance's about screen, a cell edited in place (Enter saves it).
A card's content changed and not saved, and a cell changed and not
saved, are asked about (Save, Discard or Stay) before anything leaves
them, Back and Forward among it ([below](#card-inspector)). How the
Studio is laid out is kept on the device as it changes
([Density](#layout), below), never in the pod.

Its look is calm: headings in the body's type, sections flat with a
thin border, and no tilt, stamp or pop as a screen comes in. Its
colors are Solid Memo's, so the theme and an instance's colors carry
over ([theme.md](theme.md)).

**Density.** Rows and controls are compact, about 28px high, on every
screen and on touch too: above the 24px minimum target of WCAG 2.2, the
W3C's accessibility guidelines ([glossary](glossary.md#solid-and-the-web)).
The status bar's Comfortable makes them 44px; Compact goes back. The choice
is kept on the device, never in the pod
([`shell/prefs.ts`](../apps/studio/src/ui/shell/prefs.ts), key
`solid-memo:studioLayout.v1`; storage that is missing or refuses gives
compact), and changes no history entry. So are whether the sidebar,
the aside and the dock are shown, and the aside's width (the outline's,
and a card's beside its deck's cards) and the dock's height (each kept
within its bounds), and the columns each table hides. What the device
keeps of each instance is under a key of its own
(`solid-memo:studioInstances.v1`, by the instance's URL): the views
saved of Home and of the workbench ([below](#home)), the decks and
drafts pinned, and those opened last. Storage that refuses keeps them
for the page's life only.

**Keys.** The Studio has one listener of keys, in its shell
([`shell/useShortcuts.ts`](../apps/studio/src/ui/shell/useShortcuts.ts)),
and its keymap is data
([`shell/shortcuts.ts`](../apps/studio/src/ui/shell/shortcuts.ts)),
each key of one scope: anywhere in the Studio, or in a table
(`useRowKeys`, [`shell/useRowKeys.ts`](../apps/studio/src/ui/shell/useRowKeys.ts)).
The key help lists them by their scope:

| Keys | Where | What they do |
| --- | --- | --- |
| Ctrl+K, Cmd+K | anywhere, a field too | search, go to or run a command, in the palette ([below](#quick-open-and-commands)); **Search or run…** in the header does too |
| `?` | anywhere | list every key, in a dialog; **? Keys** in the status bar does too |
| `/` | anywhere | go to the screen's search or filter: Home's, the workbench's, a draft's cards', the releases' |
| F6, Shift+F6 | anywhere, a field too | go to the next region, or the one before: the header, the sidebar, the main content, the aside, the dock (each while it is shown), the status bar |
| `g d`, `g g`, `g r`, `g p`, `g h`, `g l`, `g t` | with an instance open | go to its decks (Home), groups, drafts, releases, health, library copies, or import and export |
| `g i` | anywhere | go to the instances |
| Ctrl+B | with an instance open | show or hide the sidebar; on a narrow screen, open or close the drawer |
| Ctrl+\ | Home, the library copies, a course draft's screens but its overview; a card beside its deck's cards | show or hide the aside (the deck, the copy's upgrade, the outline); on a screen not wide, open or close its drawer; close the card, going to the deck's cards |
| Ctrl+J | with an instance open | show or hide the dock |
| F8, Shift+F8 | a deck's or a draft's screens, a field too | go to the field of the next problem in the dock's list, or the one before, round from either end ([below](#the-dock)) |
| `]`, `[` | a deck's or a draft's screens | go to the next tab, or the one before, round from either end |
| `1` … `9` | a deck's or a draft's screens, but the trial | go to the tab of that number; in the trial they are the learner's, a grade or an option |
| `j`, `k`, `x`, Enter | a table: the card workbench (a card beside it too), Home, the library copies, a draft's cards, the releases | the next row, the one before (beside a card, show it; on Home and the library copies, show it in the aside), select it, open it ([below](#card-workbench)) |
| Shift+J, Shift+K, Escape | a table whose rows are selected | select the row and the next, or the one before; clear the selection |
| `.` | a table whose rows are selected | open the first menu of the selection's bar, or go to its first button ([below](#bulk-edits)) |
| F2 | a table with cells to edit: Home, the card workbench | edit the cell the focus is in, or the row's first that can be edited ([below](#layout)) |
| Ctrl+Enter, Cmd+Enter | a text of several lines | submit its form, as Enter does a text of one line (`ui`'s `LangTextField`); the key help leaves it out |
| Escape | a drawer, a dialog, the palette, a cell edited in place | close it, the cell unchanged |

**Single-key shortcuts** (a character alone: `?`, `/`, the `g` chords,
`[`, `]`, `1` … `9`, and a table's `j`, `k`, `x`, `.`, Shift+J and
Shift+K) can be turned off in the key help, which the device remembers
(`characterKeys`, [Density](#layout)), so that speech input, or a key
pressed by mistake, sets nothing off (WCAG 2.1.4); the keys with Ctrl,
the F keys, Enter, Escape and the buttons work still. A character typed
with AltGr, or with Option on a Mac (`[` is AltGr+8 on a Swedish
keyboard), is the character, as one typed with Shift is; Windows
reports AltGr as Ctrl+Alt, so there Ctrl+\ cannot be told from a `\`
typed with AltGr, and the aside's button, or the palette, shows or
hides it instead.

A pair such as `g d` is pressed one key after the other, the second
within 1.5 seconds; a key held down counts once, so a held `g` is not
`g g`. A `g` chord, and a tab's key, goes where a link would, and is a
Back stop as a link is, except to the page already shown. While the user types in a field (a text, a search,
a list to choose from), the field keeps its keys, Ctrl+K, F6,
Shift+F6, F8 and Shift+F8 aside. A key goes first to what has the focus, which may take it (a
menu's arrows, say); then to the screen's own keys (`useScreenKeys`),
then to the Studio's. While a dialog is open, keys are the dialog's,
wherever the focus is (on the page's body, once a press on the
dialog's text took it from its buttons), but Ctrl+K
(Cmd+K), which closes the dialog and opens the palette in its place,
rather than reach the browser; while a menu is open (Columns, say),
every key is the menu's, so `j` and `k` do not move the table under it. A field or
button with a key says so to screen readers (`aria-keyshortcuts`): the
search or filter `/` goes to is the one marked so. The key help is a
modal dialog, the browser's own
([`shell/Dialog.tsx`](../apps/studio/src/ui/shell/Dialog.tsx)): Escape
or Close closes it, and the focus goes back where it was. A saved view
renamed has the focus once it shows its new name, and one removed
gives it to **+ Save view**: the menu button the dialog would give it
back to went with the view.

A splitter ([`shell/Splitter.tsx`](../apps/studio/src/ui/shell/Splitter.tsx))
is a separator, as screen readers know one, that takes the focus: its
value is the pane's size in pixels, between its least and its most.
Left and Right (Up and Down, for the dock's) move it 16 pixels, Home
and End to either end; the pointer drags it. The sums are in
[`shell/splitter.ts`](../apps/studio/src/ui/shell/splitter.ts).

**Filters and the selection.** A table's filters (the workbench's,
Home's, a draft's cards') are one row over it, wrapping only on a
narrow screen, each label small and beside its field, and the counts at
the row's end. Rows selected in a table (the workbench, Home, the
library copies, a draft's cards) bring up a bar under it
([`shell/BulkBar.tsx`](../apps/studio/src/ui/shell/BulkBar.tsx)), a
group named for them ("Selected cards"), which stays in sight at the
foot of the main content as the table scrolls: how many are selected,
what can be done with them all at once (a few buttons, and menus of the
rest), and **Clear selection**. It is there only while some are; a
status line, there throughout, says how many. **`.`** opens its first
menu.

**Questions and forms in a dialog.** Whatever loses something asks
first, in the Studio's own dialog, not the browser's
([`shell/ConfirmDialog.tsx`](../apps/studio/src/ui/shell/ConfirmDialog.tsx),
`useConfirm`): a heading, the question, the action (it has the focus)
and Cancel; Escape or Close does nothing either. So does deleting
cards, decks, a draft or a part of it, forgetting progress, restarting
a course, and removing data from the pod on the health screen. The
components the Studio shares with Solid Memo ask through `ui`'s
`AskFirst` ([`askFirst.ts`](../packages/ui/src/ui/askFirst.ts)), which
the Studio gives its `useConfirm`, and Solid Memo leaves to the
browser's `confirm`: removing a card, deleting a wrong option, and
deleting an instance. Deleting a group, or a deck from the groups'
tree, still asks in the browser's: its focus, once the deck is gone,
is worked out from the button the question leaves it on. A bulk
edit that needs to be told more (a language, a day, a deck, a group)
asks in a dialog too, not in the page above the table.

**Editing in a cell.** Some cells are edited where they are
([`shell/EditableCell.tsx`](../apps/studio/src/ui/shell/EditableCell.tsx)):
on Home a deck's direction and pace, on the workbench a card's front
and back. Such a cell is a button that shows what the cell does (named
"New per day of Kanji N5: 20 (instance)"), outlined as it is pointed at;
a click, Enter on it or F2 on its row opens a field in the cell (F2
opens the cell the focus is in, else the row's first: a card's front,
whose cell is its link, opens so alone). **Enter**, or its **Save**,
saves it the way the bulk edits do, and the cell has the focus again;
**Escape**, or **Cancel**, leaves the value as it was. A value refused
stays in the field, marked invalid, and the screen says why. A value
changed and not saved stays in its field as the focus goes elsewhere,
and is asked about before it is left, as a card's edits are
([below](#card-inspector)); one left unchanged closes as the focus
leaves it. Saved from that question, it is saved as the cell is edited
then: a deck's pace saved from another cell of its row since is kept.
Discarded there, its field closes, the edit gone from sight as from
the question. Enter and Escape that an input method takes, to end or
drop a syllable it composes (Korean, say), are the input method's.
A side's field is marked with the side's language, as the full form's
is: an Arabic side reads right to left, in its font, and a screen
reader and the spellcheck take it as Arabic. Nothing is saved unasked.

**Saved views.** Beside a table's own views (Home's and the
workbench's, [below](#home)), **+ Save view** saves the table's query
under a name, asked in a dialog
([`shell/SavedViews.tsx`](../apps/studio/src/ui/shell/SavedViews.tsx)).
Each view saved is a tab with the others, pressed while the table is in
its query, which a press puts it in (no Back stop, as a view's tab); its
menu renames it or removes it, once the user confirms. A name is a
view's own: a view saved or renamed under a name taken replaces that
view. The device keeps them for each instance ([Density](#layout)), a
view of the workbench for every deck of it. A view keeps the query as
its URL has it (`q=kanji&show=due`; [`shell/views.ts`](../apps/studio/src/ui/shell/views.ts)),
the workbench's without its page.

### The dock

The dock ([`shell/BottomDock.tsx`](../apps/studio/src/ui/shell/BottomDock.tsx))
has two tabs, a tablist (Left and Right go from one to the other):

- **Problems**, counted in its tab and in the status bar, on a deck's
  or a draft's screens ([`WorkspaceProblems.tsx`](../apps/studio/src/ui/WorkspaceProblems.tsx)).
  A draft's are its [release check](#the-release-check)'s, the shapes
  left out: for a pod, or, on the check, for the policy it shows. It is
  the very check the overview and the check make, one query, so it is
  made once for each version of the draft whichever shows it; they are
  listed as the check lists them (`ProblemList`), by severity, then by
  what they are in, each a link to its field. A deck's are what its
  [health](#health) found, as Home's badges and its health screen check
  it: the check of its data in one line, a link to the deck's health,
  then each side whose language is not stated, each group of cards that
  say the same, and each finding in its Markdown, each a link to its
  field in the card inspector. A deck's screens do not check it: what
  is counted is what a badge or its health screen found, and the dock,
  shown at its problems, checks it if none has. Off a deck's or a
  draft's screens the tab says where problems are listed.
- **Activity**: what the Studio's screens said they did since the page
  was opened, the last first, each after its time, 50 at most: the
  draft saved (or its last change not), a draft made or deleted, Home's
  bulk changes, the workbench's bulk edits, undo, moves and copies, a
  card saved in the inspector, an export or an import, a release
  published or saved as a file. A line said again just after itself is
  not repeated: the last line counts it ("Draft saved ×5"), at the
  time it was said last (`addActivity`). A screen
  tells it through `ActivityLog` (`useActivity`, in
  [`shell/activity.ts`](../apps/studio/src/ui/shell/activity.ts)), the
  line its status says; what a screen shows as it opens is not told.

F8 goes to the field of the next problem in the Problems list, Shift+F8
to the one before, as a link does, round from either end: from the
problem gone to last while its page is shown (so two problems in one
field are each gone to), else from the page shown
(`stepProblem` in [`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts)).

**Its stylesheet** is
[`studio.css`](../apps/studio/src/ui/studio.css), over the site's
`style.css`, and holds every rule of the Studio's own: the workspace's,
and its screens' (its tables, badges, filters, tabs, the outline, the
listing preview), which `style.css` holds none of. The shell imports
it, so it comes with the Studio's chunk and a learner never downloads
it. Solid Memo shares the page, and the app switches between the two
without a reload, so every rule holds under
`<html data-surface="studio">`, which the shell sets while it is shown
and takes away after; the density is `data-density` beside it. The
screens' rules come first, their scope in `:where()`, which weighs
nothing: so the workspace's rules after them, the density's among
them, win over them. A test
([studio.test.ts](../apps/studio/src/ui/studio.test.ts)) checks the
rules through the cascade, and that Solid Memo's screens are left as
they were.

### Quick open and commands

The palette ([`shell/CommandPalette.tsx`](../apps/studio/src/ui/shell/CommandPalette.tsx),
a dialog named Quick open) opens with Ctrl+K (Cmd+K on a Mac), or
with **Search or run…** in the header. It finds, as the user types:

- the **commands** of the screen shown, and the Studio's own (show the
  keys, show or hide the sidebar, the aside or the dock);
- the **tabs** of the deck or draft shown, each with its number;
- the open instance's **sections**, each with its `g` chord, and All
  instances;
- the user's **instances**, each at its decks;
- the open instance's **decks**, each at its cards, and its **drafts**
  (those that can be read), each at its overview;
- the **cards of the deck shown**, each in the inspector, only once
  something is typed.

It lists what the workspace has read, from its cache, as it was when
the palette opened: it reads nothing from the pod, so a deck's cards
are there once a screen of the deck has read them. Which entries there
are, and how they rank, is worked out apart from the page
([`shell/commandIndex.ts`](../apps/studio/src/ui/shell/commandIndex.ts)):
an entry matches when its name holds the letters typed in their order,
case and accents aside ("kn5" finds Kanji N5); a letter at the start of
a word, or right after the one before, counts for more, and a shorter
name a little. The best come first, each group under its heading where
its best is, 50 at most. With nothing typed, the decks and drafts
pinned in the sidebar come first, under Pinned; then the entries the device
remembers as used last, under Recently used (eight at most, those pinned aside,
the last first; [`shell/prefs.ts`](../apps/studio/src/ui/shell/prefs.ts),
key `solid-memo:studioRecent.v1`, each by its group and where it goes,
or by its command), then the rest but the cards. Each entry shows the
keys that do the same, if any.

The field is a combobox over the list, as screen readers know it: the
focus stays in the field, and the entry picked is its
`aria-activedescendant`. Down and Up pick the next entry or the one
before, round from either end; Enter, or a click, chooses it; Escape
closes the palette, as Ctrl+K (Cmd+K) does again from anywhere in it,
rather than reach the browser; the focus goes back where it was. An entry
that goes somewhere goes as a link does, a Back stop, except to the
page already shown; a command is done once the palette has closed.

A screen adds its commands while it is shown, and only those it can
do at the moment (`useScreenCommands`, in
[`shell/useScreenCommands.ts`](../apps/studio/src/ui/shell/useScreenCommands.ts)):

The shell's own commands show the keys, and show or hide the sidebar,
the aside (where there is one; beside a card, Close the card) and the
dock. A screen's:

| Screen | Command | What it does |
| --- | --- | --- |
| [Drafts](#drafts) | New draft | goes to the new draft's form, while a draft can be made |
| [Health](#health), an instance's or a deck's | Check again | checks again, while it is not checking |
| [Import and export](#import-and-export) | Export *n* decks | exports the decks checked, as the form's button does, while some are and none is being exported |

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
| `#/studio?instance=…[&q=…&sort=…&order=desc&show=…&deck=…]` | Home: every deck of the instance as a table ([below](#home)). `q` filters it, `sort` names the column it is sorted by, and `order=desc` sorts it the other way. `show` is the view its tabs show: `due`, `courses`, `copies` or `attention`; every deck without it. `deck` is the deck beside the table, at its cursor. |
| `#/studio/groups?instance=…` | Groups: the instance's decks arranged into groups, as Solid Memo's deck list arranges them. |
| `#/studio/cards?deck=…[&q&field&lang&state&has&sort&order&page&size]` | the card workbench: a deck's cards as a table ([below](#card-workbench)). The deck names the instance: its catalog's folder. |
| `#/studio/card?deck=…&card=…[&tab=distractors\|schedule\|history&field=…][&q&in&lang&state&has&sort&order&page&size]` | the card inspector: one card, its content, with `tab=distractors` its wrong options, with `tab=schedule` its review state, or with `tab=history` its answers ([below](#card-inspector)). The content is the default tab, and is left out of the URL. `field` opens it at one field: a text of the content (`front`, `backNote`…), or a wrong option by its id. The rest is the query of the workbench beside the card, as the workbench's own, but `in` for its `field` (where to look); without it, the deck's cards as listed. |
| `#/studio/schedule?deck=…` | a deck's schedule: the reviews to come, its intervals and eases, its lapses and leeches ([below](#a-decks-schedule)). |
| `#/studio/about?deck=…` | a deck's about screen: what it says of itself, how it is studied and, for a course, the learner's progress ([below](#a-decks-about-screen)). |
| `#/studio/instance?instance=…` | the instance's name and its catalog ([below](#the-instance)). |
| `#/studio/health?instance=…[&deck=…]` | everything wrong with the instance, or with one of its decks ([below](#health)). |
| `#/studio/library?instance=…` | the instance's copies of library releases, the newer releases and what upgrading would change ([below](#library-copies)). |
| `#/studio/transfer?instance=…[&deck=…&deck=…]` | import and export: the instance's decks to save as files, those of each `deck` checked, and a file to make a deck of ([below](#import-and-export)). |
| `#/studio/drafts?instance=…` | the instance's drafts of releases, and a new one to start ([below](#drafts)). |
| `#/studio/draft?draft=…[&field=…]` | a draft's overview: what the release says of itself and, for a course, its outline ([below](#a-drafts-overview)). `draft` is the draft's release document, which names the instance. |
| `#/studio/chapter?draft=…&chapter=…[&field=…]` | a chapter of a course draft, by its id ([below](#a-chapter)). |
| `#/studio/step?draft=…&step=…[&field=…]` | a step of a course draft, by its id ([below](#a-step)). |
| `#/studio/question?draft=…&card=…[&field=…]` | a card of a draft, by its id: a course's question, or a deck's card ([below](#a-question)). |
| `#/studio/draft-cards?draft=…[&filter=…&lang=…&sort=…&order=desc&page=…]` | a draft's cards as a table ([below](#a-drafts-cards)): `filter` is `unasked`, `askedTwice`, `fewDistractors` or `retired`, `lang` a language, `sort` the column it is sorted by (`front`, `back`, `place`, `distractors` or `id`; by id without it), and `order=desc` the other way. |
| `#/studio/check?draft=…[&policy=library]` | a draft's release check ([below](#the-release-check)): for a release in a pod, or with `policy=library` for the Solid Memo library. |
| `#/studio/preview?draft=…` | a draft as the library will list it ([below](#the-listing-preview)). |
| `#/studio/trial?draft=…[&chapter=…&part=review]` | a draft played in a sandbox ([below](#the-trial)): a course's page, with `chapter` (an id) that chapter's steps, and with `part=review` its final review; a deck's study. |
| `#/studio/diff?draft=…` | a draft against the release it follows ([below](#the-release-diff)): what it changes, and what learners' copies would get. |
| `#/studio/release?draft=…[&field=…]` | what a draft's release says of itself beyond its listing, how it was made and from what ([below](#the-releases-metadata-and-provenance)), then its publishing and its download ([below](#publishing-a-release)). |
| `#/studio/releases?instance=…` | the releases the instance published ([below](#releases)). |

`#/studio/` and its query count as `#/studio`. Anything else under
`#/studio`, `#/studio` itself among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker, an unknown deck to its instance's Home, and an unknown card
(one removed, say) to its deck's cards. A chapter, step or card a draft
does not have (one deleted, say) falls back to the draft's overview.
`field` opens a draft's screen at one of its fields, where the release
check links: the overview's `title`, `description` or `outline`; a
chapter's `title`, `description`, `steps` or `review`; a step's
`theory` or `questions`; a question's text (`front`, `backNote`…), its
wrong options (`distractors`) or one of them (`distractor:<id>`); the
release screen's `versionNotes`, `languages`, `themes`, `license`,
`publisher`, `authors`, `making`, `sources` or `checks`. A field the screen does
not have is left out.
Like Solid Memo's fallbacks, these replace the history entry.

Changing Home's filter, sort or view, the deck beside its table, the
workbench's query, the inspector's tab, the decks checked to export, or
the view of a draft's cards, replaces the history entry: it is the
same screen, looked at another way, so Back leaves it. So does going
from card to card beside the deck's cards (`j` and `k`, Previous and
Next); opening a card from the list is a Back stop, as is opening a
deck from Home or a card from a draft's cards with Enter.

Solid Memo links to Home as `#/studio?instance=…` ("Open in Studio",
in its instance bar, each deck's actions menu and the deck page;
[routing.md](routing.md)). A deck's link opens its instance's Home too.

The trail is Instances › Decks, then › Groups on the Groups screen,
› Cards of *deck* in the workbench, › Cards of *deck* › *card* in the
inspector, › Cards of *deck* › Schedule on a deck's schedule, › About *deck* on a deck's about screen, or › Name and
catalog on the instance's screen, › Health on the instance's health,
› Health › *deck* on a deck's, › Library copies on the library
copies, › Import and export on import and export, › Drafts on the
drafts, and › Releases on the releases. A draft's screens go on from › Drafts: › *draft* on its
overview, › *draft* › *chapter* on a chapter, › *draft* › *chapter* ›
Step 2 on a step, › *draft* › Cards on its cards, › *draft* › Cards
› *card* on a question, › *draft* › Release check on its check,
› *draft* › Listing preview on its preview, › *draft* › Trial on its
trial, › *draft* › Changes on its comparison, and › *draft* › Release
on its release metadata (`crumbsOf`, in
[`shell/titles.ts`](../apps/studio/src/ui/shell/titles.ts), from the
route and the deck, card or draft it names). The document title is
the trail's last step and "Solid Memo Studio". After a move, the screen's heading
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
  `prov:wasDerivedFrom`), **From \<host>** for a copy of a release
  added from a link, which no index lists
  ([deck-library.md](deck-library.md#from-a-link)), **Course** for a
  copy of a course, wherever it came from, **Invalid
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

Beside a copy's name, "Release 2 out" when a newer release of it is
out, a link to the [library copies](#library-copies). It too is looked
up once its row is on the screen: one read of the library's index for
every copy (`listLibraryUpdates`), and for a copy from a link its
creator's catalog. A copy up to date, or one whose newer releases
cannot be known, gets no badge.

The instance's other sections, and its drafts, are in the
[sidebar](#layout); with no decks yet, Home says to make or import them
in Solid Memo.

The table starts in the order the user arranged the decks. A column's
name sorts by it, then the other way, then back to that order; the
sorted column says so (`aria-sort`). A figure not known yet sorts last,
either way. The filter keeps the decks whose name, in any language, or
whose groups' names hold its text, case and accents aside. The domain
does both ([deckTable.ts](../packages/domain/src/deckTable.ts)).

**Views.** Tabs above the table (a group named Views, the one shown
pressed) each keep the decks of one kind, and count them: All, Due
today (cards due today, and those whose cards are still counted, their
count a loader meanwhile, so none is hidden while it may be due),
Courses (copies of a course), Library copies (copies of a release,
from the library or a link) and Needs attention (invalid data, or
cards that could not be read). Each is a preset of Home's query
([`shell/views.ts`](../apps/studio/src/ui/shell/views.ts)): it sets
the view (`show`), and keeps the filter's text and the sort. A deck's
problems ([health](#health)) and its newer release are found only as
its row comes into view, so no view keeps decks by them. After them,
the views the user saved, and **+ Save view** ([Layout](#layout)).

**Editing a deck in its row.** A deck that may be changed has its
direction, new cards per day and reviews per day edited in their cells
([Layout](#layout)): a choice of the directions, or a whole number,
which left empty follows the instance's pace again. Each is saved as the
bulk edits save it, for that deck alone, and said as they say it ("Set
the pace of 1 deck.").

The table is a [`DataTable`](#card-workbench): **j** and **k** move its
cursor, **x** selects a deck, and **Enter** opens the deck's about
screen. Its **Columns** menu shows or hides each column but the
deck's name; the device keeps which are hidden, as it keeps the
layout, and every column is shown until hidden there. The workbench
and a draft's cards have the menu too, each table its own.

**The deck beside the table.** The deck at the table's cursor is in
the aside, named Deck ([`DeckPeekContainer`](../apps/studio/src/ui/DeckPeekContainer.tsx)):
its groups, its cards, today's due and new cards, when it last
changed, its health, and links to its tabs (Cards, Schedule, Health,
About, Export). It reads the table's own queries, so it reads nothing
the table has not. The URL names it (`deck`), each move of the cursor
replacing the history entry; a deck the instance does not have shows
none. Before the cursor has moved, the aside says how to show one.

Decks are selected by their checkbox, or all those shown at once, and
the selection's bar ([Layout](#layout)) offers what can be done with
them: **Edit** (a menu of the first three, each asking how in a
dialog), Export and Delete. The selected decks the table shows can be (a
selected deck the filter hides stays selected, but is left alone until
it is shown again):

- **moved into a group**, or to the top level, at its end, in their
  order in the table (not when a newer version arranged the groups);
- **given a pace**: a limit left empty follows the instance's
  preferences again;
- **given a direction**;
- **exported**: Export opens [import and export](#import-and-export)
  with them checked;
- **deleted**, with their cards, once the user confirms a question that
  names each deck (a ConfirmDialog).

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
- `field`: where to look: the front, the back, the notes, the labels or
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
  ways is in a state when either direction is. `leech` has 4 lapses
  or more (`LEECH_LAPSES`, [below](#a-decks-schedule)).
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

**Views.** Tabs above the filters (a group named Views) put the cards
in one state: All (none), Due, New and Leeches; the one the query is
in is pressed, none when its state is another. A view keeps the rest of
the query, and goes to the first page. After them, the views the user
saved ([Layout](#layout)), each a whole query, for any deck of the
instance.

**Editing a card in its row.** A plain text card (not in Markdown) has
its front and back edited in their cells, each side only while its text
is in one language, stated ([Layout](#layout)). It is an edit of that
card alone (`setText` in [cardBulk.ts](../packages/domain/src/cardBulk.ts)),
planned and written as the bulk edits are: the status line says it,
and **Undo** undoes it ([below](#bulk-edits)). A side left empty is
refused; one written as it was is closed with nothing written. A card
in Markdown, or a side in several languages, is edited in the
[inspector](#card-inspector).

The table is the Studio's `DataTable`
([`shell/DataTable.tsx`](../apps/studio/src/ui/shell/DataTable.tsx)):
its header row and its first column (the checkboxes and the fronts)
stay in sight as it scrolls. Cards are selected by their checkbox, or
all those on the page at once; a click with Shift held selects, or
not, every card from the one checked last. The selection stays while
the view changes, and the selection's bar under the table counts it
([Layout](#layout)). The keys say so, quietly, under the bar: **j** and **k** move the cursor between the rows (the focus
goes to the row's front), **x** selects the row, **Shift+J** and
**Shift+K** select on from where the selection was last made, **Escape**
clears the selection, **Enter** opens the card, **F2** edits the
row's front, or the cell the focus is in, and **`.`** opens the
bar's first menu. The cursor's row is
marked, as is each row selected. **j** and **k** work wherever the
focus is: from outside the table, they go on from the cursor's row, or
to the first. **x**, **Enter** and the Shift keys act on the row the
focus is in, or, with the focus on the page's body, the cursor's;
Enter on a row's link or button is the link's or the button's. The
keys are left to the search and the filters while they have the
focus, and to whatever took them first; they are the screen's own keys
of the Studio's ([Keys](#layout); `useRowKeys`). What is selected,
how the table is sorted, where the cursor goes and which columns show
is worked out apart from the page
([`shell/tableModel.ts`](../apps/studio/src/ui/shell/tableModel.ts)).
Home, the library copies, a draft's cards, the releases and a card's
answers are DataTables too, each with the keys and the marks it has
use for. A row that cannot be selected now (a deck set aside, a copy
with nothing to upgrade) has its checkbox disabled, or none, and a
range or a page's checkbox passes over it. Its **Columns** menu shows
or hides each column but the first ([Home](#home)).

The selected cards can be edited at once ([below](#bulk-edits)).

The lapses column counts each card's lapses, in either direction, in
the [answer log](data-model.md#the-answer-log): its reviews graded below
3, not its first answer, an answer the same day after another, or a
course answer ([statistics.md](statistics.md#what-the-figures-count)). The log goes back only
so far, so the row of filters ends with the month of the deck's first
answer in it: "since March 2025", after how many cards the query keeps. The workbench reads the whole log once (`loadAnswerLog`). While
it is read, the cards show without their lapses, and a query that needs
them (`state=leech`, `sort=lapses`) waits. When it cannot be read, the
line says so, and such a query shows why. The deck's tabs go to its
[schedule](#a-decks-schedule), its [health](#health) and its export
([import and export](#import-and-export), the deck checked).

A card opens in the [card inspector](#card-inspector): on a screen
wider than 64rem beside the workbench, which stays as it is, its query,
selection and Undo with it. The
workbench reads the cards and the review states with the same queries
as Solid Memo, and the instance's preferences for today's study day.
A test keeps a query over 5,000 cards linear: timed on the same machine, eight times the cards take less than four times as long as an eighth of them eight times over.

## Bulk edits

The selected cards the query keeps can be edited at once, on any page
([`CardBulkActions`](../apps/studio/src/ui/CardBulkActions.tsx)), from
the selection's bar ([Layout](#layout)). A selected card the query hides
stays selected, but is left alone. The bar groups the edits: **Edit**
(Write in Markdown, Write as plain text, State language, Find and
replace), **Schedule** (Set due date, Forget progress), **Move or
copy** (Move to deck…, Copy to deck…), then Retire, Restore and
Delete. An edit that needs to be told more asks in a dialog; one that
loses something asks first ([Layout](#layout)). While the deck may not
be changed, the bar has Clear selection alone. The edits are:

- **Retire** and **Restore**. A retired card keeps its review state.
- **Write in Markdown** and **Write as plain text**. Plain text is
  written as `sm:plainText`, a choice of its own
  ([markdown.md](markdown.md)).
- **State language**: the language of the sides whose language is not
  stated yet, both or one of them. The text stays as it is.
- **Find and replace**
  ([`FindReplaceDialog`](../apps/studio/src/ui/FindReplaceDialog.tsx)):
  text as written (Markdown as its source), never a pattern. It looks in
  the fields checked (the front, the back, the notes, the labels, the wrong
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
in Solid Memo. On a screen wider than 64rem it is in the aside, beside
the deck's cards in the workbench, as the card's route has them
([Layout](#layout)): the card's row there is marked (`aria-current`)
and is the cursor's, and a card opened from the list takes the focus
to its heading; closed, the cursor stays on its row, and the focus
goes back there. **Previous** and **Next** at its heading's end, or
**k** and **j**, show the card before it in the list, or the one after
(each at its page of the list), on the same tab, with no Back stop; at
either end of the list, or for a card the query does not keep, there
is none. A card opened from elsewhere (the palette, a deck's schedule,
a link) puts the list at its page, so that its row is in sight,
replacing the history entry. Below that width the inspector is the
main content alone.

Its four tabs are links, the one shown marked
(`aria-current`):

- **Content**: Solid Memo's card editor (`CardContainer` in `ui`): the
  card as it is studied (small here, its faces side by side, so the
  fields under it are in sight), its sides, pictures, notes, labels and Markdown,
  Save, and Remove, which goes back to the deck's cards. Its wrong
  options are left to their own tab. Each save is told to the
  [dock](#the-dock)'s activity, as each change of the wrong options is.
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
  chosen. One no longer on the card is named by its id. A column's
  name sorts the answers by it (but the wrong option's), then the
  other way, then newest first again; beside the deck's cards, **j**
  and **k** stay the cards' table's. A line says
  how many answers there are, and the card's lapses, counted as the
  cards' table counts them ([statistics.md](statistics.md#what-the-figures-count)):
  an answer below grade 3 is marked forgotten, but only a scored review
  is a lapse. The use
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

**Edits not saved.** The content tab's card editor says while it holds
changes not saved, since it opened or was last saved. Leaving them then
(another card by `j`, `k`, Previous, Next or a row of the list, Close,
another tab, any other link or key that goes to another page, or the
browser's Back and Forward, or a hash typed in) first asks, in a dialog ([`shell/ConfirmDialog.tsx`](../apps/studio/src/ui/shell/ConfirmDialog.tsx),
on the Studio's `Dialog`): **Save** saves them as Save does, then goes
on, unless the save failed or was refused, which the editor shows;
**Discard** goes on without them, and a cell that stays on the page
shows them no longer; **Stay**, Escape or Close goes
nowhere ([`shell/unsavedEdits.tsx`](../apps/studio/src/ui/shell/unsavedEdits.tsx)).
A table's cell edited and not saved ([Layout](#layout)) is asked about
the same way, beside a card's edits: Save saves them all, and goes on
only once each is saved.
Back or Forward is undone before the question, before the Studio's
router hears of it: the browser goes as many entries the other way
(the router numbers the history's entries, `historyPosition` in
[routerCore.ts](../packages/ui/src/ui/routerCore.ts)), and once the
question is answered so, as many again, where Back or Forward went,
the entries after it kept for Forward; a hash typed in, a new entry,
is undone as Back is. A card's edits are never saved unasked.
Leaving the app (a reload, closing the tab) meanwhile is asked by the
browser itself (`beforeunload`). The edits are kept as the window
crosses 64rem, the card going from beside its deck's cards to alone,
or back: the editor starts again from what the one before held
(`keep`, in `CardScreen`), until another card or tab is shown.

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
checked to start with. It says what becomes of the cards' history. A
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
- **Lapses and leeches.** A lapse is a review graded below 3, in the
  deck's answers in the [answer log](data-model.md#the-answer-log)
  (`lapseIndex`, by `isLapse`): not a card's first answer, an answer
  the same day after another to the same prompt (a card back in the
  session), or a course answer. These count toward a card's leech
  state no longer, so a card is a leech later than it was when every
  wrong answer counted ([statistics.md](statistics.md#why-the-figures-changed)). The log goes back only
  so far, so the screen names the month of the deck's first answer in
  it. A leech is a card in use
  with 4 lapses or more (`LEECH_LAPSES`, `leechesOf`), the most
  forgotten first. Each links to its card's history, and a link shows
  them all in the workbench (`state=leech&sort=lapses&order=desc`).
  A test keeps `lapseIndex` linear over a year of answers: timed on the same machine, eight times the answers take less than four times as long as an eighth of them eight times over.

The charts are the statistics' own (`BarChart` and `StatTile` in `ui`):
a bar pointed at, tapped or reached with the arrow keys says what it
holds, and each chart has its figures as a table.

## A deck's about screen

The about screen ([`DeckAboutContainer`](../apps/studio/src/ui/DeckAboutContainer.tsx))
shows what a deck says of itself and how it is studied, with a link to
its page in Solid Memo. Each part has its own form, and a status line
says when a save is made:

- **Name**: the deck's name in every language it has, renamed as in
  Solid Memo's deck preferences (`renameDeck`).
- **About this deck**: its description, topics and keywords, with
  Solid Memo's own form (`DeckAboutSection` in `ui`, `describeDeck`).
- **Authors and license**: an author a line, `Name` or `Name <email>`,
  and a license chosen from those offered (`KNOWN_LICENSES` in
  [license.ts](../packages/domain/src/license.ts), each named as
  `licenseLabel` names it). A license another app wrote is offered too,
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
  document, the catalog and the type index registrations
  ([data-model.md](data-model.md#the-catalog)). Then the instances
  are read afresh, so every screen names it anew. An empty name is
  refused.
- **Catalog**: its description, required, and its license, from the
  same list as a deck's (`describeCatalog`). Its publisher, the pod's
  owner, is shown, never edited. An instance without a catalog (one
  not updated yet) says so instead. The form starts again from each
  read of the catalog, as a rename can change its description.

Both forms are held until the data check is done, and while the
catalog or a group is set aside ([below](#data-set-aside)).

The meta document and catalog writes pass the shape check. The type
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
  subjects in the catalog (its entry, its distribution and its
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
lists the instance's decks copied from a release (they have
`prov:wasDerivedFrom`), from the library or added from a link, a row
each: the release it came from, the newest one out, and what upgrading
would change. It links to Solid Memo's deck library.

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
the copy as the copies were found, its series with it, so the index is
not read again for each copy, nor a link's catalog. It says so in a sentence, as Solid Memo does. A newer release with nothing for the copy says so.

The table is a [`DataTable`](#card-workbench): **j** and **k** move its
cursor, and the copy at the cursor is shown in the aside (named
Upgrade, [Layout](#layout)), with the rest of its plan: what history
is kept, the new releases' notes, and the cards added, changed,
retired, brought back, removed, and left as the user has them. Which
copy that is lives in the page, not in the URL; on another screen and
back, none is shown until the cursor moves.

The copies that can be upgraded are selected by their checkbox, or all
at once; a copy set aside cannot be, nor any until the data check is
done ([below](#data-set-aside)). **Update 2 decks** (as many as are
selected), in the selection's bar ([Layout](#layout)), upgrades them one
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

A copy whose series the index does not list is looked up as a copy
of a release added from a link
([deck-library.md](deck-library.md#from-a-link)). Its release is read,
and its row says "From \<host>". Its creator's catalog, found in the
folders above the release and read as anyone reads it, lists the
releases its instance published (`sm:publishedRelease`): the newest of
the copy's series is its upgrade, planned and applied as a library
copy's. Each release a catalog links is read once for all the copies,
and none the copy's own release lists, which is no newer. Before an
upgrade is planned, the newer release and those in between are checked
against the library's shapes, as the first was; one that breaks them
is refused (`releaseNotConforming`). When no public catalog of its
creator lists the release, it is unknown whether a newer version is
out, and the row says "Not known: no public catalog of its creator
lists it". A catalog can be private (an instance's is, unless its
owner shares it), or not link the release. A copy whose release cannot
be read either shows as no longer in the library.

## Import and export

Import and export ([`TransferContainer`](../apps/studio/src/ui/TransferContainer.tsx))
saves decks as files and makes decks of files. A file is Turtle or
JSON-LD, one deck to a file, as
[data-model.md](data-model.md#decks-as-files) describes it.

**Export** lists the instance's decks, as they are arranged. The decks
checked are in the URL, so Home's bulk Export and a deck's Export tab
open the screen with them checked. The user picks the format and
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
progress when the file has some and the user leaves it checked. Its
cards document goes first, only if none is at its URL yet, then its
review states, then its entry in the catalog, so the deck shows only
once it is whole. One left behind by an import cut off makes the deck
take a fresh id, once. The deck's schedule in the digest is then
brought up to date, and the screen links to the deck's cards. Every
query of the instance's decks is read afresh.

The deck is written as any deck Solid Memo writes: its wrong options
named with `sm:distractor` and `schema:suggestedAnswer`, its states
naming their card in the new deck. It needs no type-index registration
of its own: the instance's registrations of its decks, cards and
review states cover it ([data-model.md](data-model.md#decks-as-files)).
While the data check is under way, or the catalog is set aside, the
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
on this screen and in the sidebar. A draft made opens at its overview
at once, the [activity](#the-dock) saying it was made; but a draft of a
deck copied from a release stays on this screen, which offers to start
that release's next version instead (below).

A new draft starts from

- **a blank deck or a blank course**, by its name in a language the
  user states: version 1 of a series of its own, with its Turtle
  distribution, about education (the data theme EDUC, which the
  release check asks of every release), a course studied front to back;
- **a deck of the instance** (`deckToDraft` in
  [deckToDraft.ts](../packages/domain/src/release/deckToDraft.ts)):
  what a release says and the deck does too, every card under its id,
  its retired ones and wrong options with it, its authors the
  release's agents, the first its publisher, its themes and EDUC. What
  is the learner's own is left behind: where its documents are, its
  study caps, its place among the groups, a course's progress. A deck
  copied from a release names it (`prov:wasDerivedFrom`), which is no
  source of the new release: the screen says the deck is based on it,
  and offers to start the next version of that release instead, which
  keeps what its learners studied;
- **the next version of a release**, by its address, in the library or
  in a pod (`nextVersionDraft` in
  [releaseVersion.ts](../packages/domain/src/release/releaseVersion.ts)):
  the release whole, as version N + 1 after it, in its series, with no
  release time or notes yet. Everything it published is carried: no
  card, chapter, step or distractor of it can be deleted, only retired,
  and none of their ids can be another's; how it was made (its
  activities) is kept as it is. A series and publisher the release
  names in another document (a library's index) are read from it, as
  no one, and described in the draft, so the release it makes is whole
  on its own: the series by what an index says of one, a publisher by
  its class and name only. A document that cannot be read gives
  nothing: the draft is made without it, and the release check says
  what the draft lacks;
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
instance's other drafts of that version. Only a draft's place taken
meanwhile (its release document made there first) gives it the next
name; any other failure, such as the catalog's link refused on 412
a few times, takes back what was written and is thrown, so no draft is
left that the catalog does not link. The use cases are
`listReleaseDrafts`, `createReleaseDraft`, `copyReleaseDraft` (a
guest's draft, as the guest's study is added to an instance,
[guest-mode.md](guest-mode.md#adding-to-an-instance)), `getReleaseDraft`,
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
changes the catalog, so both are held until the data check is done,
and while the catalog is set aside ([below](#data-set-aside)). A
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
human review."). The release screen makes these changes
([below](#the-releases-metadata-and-provenance)). A creator names the ids, the way
[courses.md](courses.md#writing-a-course) says.

## Writing a draft

A draft is written in six screens: its overview, a chapter, a step, a
question, its cards, and its release metadata and provenance. They share the draft as one query, read once
(`getReleaseDraft`), and change it by `DraftChange`s
([below](#how-edits-are-saved)). Four more read it: its release
check, its listing preview, its trial, and its comparison with the
release it follows.

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
  once. What waits is the draft's, not an editor's: the screen's editor
  and the outline's beside it share it, so a move in the outline writes
  the text typed on the screen first, and no write's draft is put on
  the screen while typing waits that it does not hold.
- **Queued per draft.** The writes of a draft wait for one another, in
  one mutation scope, whatever their documents and whichever screen
  made them. Each write reads the draft after the writes before it, so
  the draft the last one returns holds them all. Only that one is put
  on the screen: an earlier one's would undo changes not yet written.
- **Said.** A status line says "Saving…" while a change waits or is
  written, then "All changes saved.", and the status bar says so too,
  whichever of the draft's screens is open ([above](#layout)). A write that fails, or that the
  draft as it now is refuses, says why. Once the writes after it are
  done, the draft is read afresh: the screens then show what the pod
  has.

A draft released is frozen: every screen shows it, and changes nothing
in it. Its next version is started from the drafts, its release screen
or the releases ([below](#publishing-a-release)). While the
instance's data check is under way, or blocks the instance, nothing is
changed either ([below](#data-set-aside)).

### A draft's overview

The overview
([`DraftOverviewContainer`](../apps/studio/src/ui/DraftOverviewContainer.tsx))
names the draft, its kind and version. Its title and description are
saved as they are typed. For a course, it shows the outline, adds a
chapter (its title, and its id), and lists the chapters retired, to
restore. It counts the draft's cards, with a link to their table; a
deck's cards are added here. It counts the problems the release check
finds (for a pod, the shapes left out); the draft's tabs go to the
check itself, the listing preview and the release's metadata and
provenance.

### The outline

The outline ([`DraftOutline`](../apps/studio/src/ui/DraftOutline.tsx))
is a course's chapters in their order, each with its steps ("Step
1.2"), each step with the questions that check it, in the order of their
ids. Each links to its editor. The list is named Outline. Chapters
and steps are arranged as the deck list's groups and decks are, with
the same code in `ui`:

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

A chapter, step or question the release check finds problems in has a
badge beside it ("2 problems"), a link to the check.

On a course draft's other screens the outline is in the aside
([`OutlineAside`](../apps/studio/src/ui/OutlineAside.tsx),
[above](#layout)), to go from one chapter, step or question to another
and to arrange them there too. The one the page shown edits is marked
(`aria-current="page"`; `currentOutlineKey` in
[`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts)),
and each badge links to where its first problem is fixed, as the
check's links do (`targetRoute`). The overview keeps the outline in its
main content, with its new chapter and its retired ones, and has no
aside: the outline is shown once.

### A chapter

A chapter's screen
([`ChapterEditorContainer`](../apps/studio/src/ui/ChapterEditorContainer.tsx))
edits its title, always plain text, and its description, with "Format
with Markdown" (`sm:textFormat` of the chapter) and a preview as the
course's screen shows it (beside the field on a screen 80rem wide or
more, under it on a narrower one). It orders the chapter's steps, up or down,
adds one, and restores one retired. It lists the questions asked only
in the chapter's final review, and adds one.

### A step

A step's screen
([`StepEditorContainer`](../apps/studio/src/ui/StepEditorContainer.tsx))
edits its theory, in each language it has, with "Format with Markdown"
(`sm:textFormat` of the step). In Markdown, each text is hinted at where
it would not show as meant, by the rules of prose (`PROSE`,
[markdown.md](markdown.md)). Beside it on a screen 80rem wide or more,
and under it on a narrower one, a preview shows the theory as the
course player does (`ProseField` in `ui`, with the player's
`DataProse`). The screen lists the questions that check the step, and
adds one: its front and back, its id, and the question it is asked
before, if not after the last.

### A question

A question's screen
([`QuestionEditorContainer`](../apps/studio/src/ui/QuestionEditorContainer.tsx))
says where the card is asked: a step, a chapter's final review, or
nowhere yet. Choosing another moves it there (`moveQuestion`). Its
content is Solid Memo's card editor (`CardContentFields`), saved by
Save. Its wrong options are the inspector's own (`DistractorFields`),
each change saved as it is made (`distractorChanges`). A preview asks
the card as the course will (`CourseQuestion`, with `MultipleChoice`),
as typed: it can be answered, and asked again. On a screen 80rem wide
or more it is beside the form, and stays in sight as the form scrolls;
on a narrower one it is under it.

### A draft's cards

A draft's cards
([`DraftCardsContainer`](../apps/studio/src/ui/DraftCardsContainer.tsx))
are a table, a row each, by id: its front (a link to its editor), its
back, where it is asked, its wrong options in use, and its id. The URL
holds the view ([above](#routes)). The filters keep the cards asked
nowhere (in a course), asked from two places, with fewer than two wrong
options in use, or retired; the language keeps those with text in it on
their front or back. A column's name sorts by it, then the other way,
then by id again, from the first page. A page holds 50. The table is a
[`DataTable`](#card-workbench): cards are selected by their checkbox,
or a page's at once, and **Retire 2 cards** or **Restore 1 card**, in
the selection's bar ([Layout](#layout)), retires or restores those
selected the filter keeps, in one edit;
nothing is selected while the draft may not be changed. **Enter**
opens a card's editor, as its link does. A new card is added under the
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
with a number after it. A new question may instead be asked before one
the step or review asks already ("Ask it", `questionIdBefore`): its id
then sorts between that one and the one before it, a free letter when
there is one, else an id from `idBetween`. Before the first, the
place's own name (`q-<topic>-<n>`, `q-<topic>-r00`) is the lower end.
When no id sorts there, the form says so, and the user writes one.
An id the user writes is asked where it sorts: when that is not where
"Ask it" says, the form says so too.
`idBetween` finds an id that sorts between two others, by code unit,
and is none taken: a number after the first when one fits, else one
made code unit by code unit. A seeded property test checks that it
keeps the order and never gives an id taken.

Nothing an earlier release published is deleted: a learner's progress
may name it. Its Delete is held, and the screen offers to retire it
instead. A wrong option it published is likewise only retired.

## The release check

The release check
([`ReleaseCheckContainer`](../apps/studio/src/ui/ReleaseCheckContainer.tsx))
runs every rule a release is held to on the draft, as the release it
will be. They are the rules `npm run library:check` runs on `decks/`
([deck-library.md](deck-library.md)), from one source: the domain's
([`release/`](../packages/domain/src/release/)). The use case is
`checkReleaseDraft(draft, markdownCheck, policy)`. It finds:

- **Rules** (`ruleProblems` in
  [releaseCheck.ts](../packages/domain/src/release/releaseCheck.ts)):
  the course's (`courseProblems`), what a release needs that a draft may
  lack (`readinessProblems`: a title and a description with English
  text, a publisher, a version, a series, a distribution, the theme
  EDUC, and each chapter's and step's fields the draft shapes relax),
  the policy's curation (`curationProblems`), and how the release says
  it was made (`provenanceProblems`,
  [below](#what-the-check-asks-of-a-releases-provenance)).
- **Library** (the library policy only): the draft's place in the
  library, by its live index (`readLibraryIndex`): its name, its
  version among the deck's others, and its metadata against that place
  (`libraryProblems`).
- **Drops**: against the release it follows, when there is one
  (`continuityProblems`): nothing dropped, no id given to another kind
  of subject, and its version the next.
- **Markdown**: its text formats, its text in Markdown, and how a
  step's theory is split into chunks: none empty, and as many in each
  language (`markdownProblems`, [markdown.md](markdown.md#chunks)). The
  domain reads no Markdown: the screen passes the markdown package's
  check in (`releaseMarkdownCheck` in `ui`, its `problems` and
  `chunks`), which keeps the problems of every text it has checked, by
  field rule, and the chunks of every theory.
  A course has thousands of texts, so a check of a draft just changed
  reads only the text that changed.
- **Shapes**, when asked: the release as it is assembled, moved to its
  address (`mapIris`), each subject against its library shape
  (`LibraryDeckV6` for the release), and the whole against DCAT-AP and
  SKOS with the reference data (`ShapeValidator.validateRelease`). For
  the library, its index is beside it, with the release's series in it
  (described from the release when the index lists it not yet). In a
  pod nothing else is read: a publisher or series the release does not
  describe fails DCAT-AP's class check, as the release is not whole on
  its own ([validation.md](validation.md)). They
  take a while on a large draft, so a button runs them, for the draft
  as it is then; once it changes, they say so and offer to check again.
  When they fail, the same button runs them again.

The library and drops parts read what is elsewhere: the library's
index, and the release the draft follows. One that cannot be read is a
problem of its own (`libraryUnread`, `previousUnread`), and the rest of
the check stands. Such a check is not kept, so the next one reads again:
the screen checks again when it is opened again, when its window is
focused, or when asked: such a check, or one that failed, has a button
to check the draft again.

The draft checked is the editor's, changes not yet written included, so
a problem fixed clears at once. Each version of it is checked once:
the editor makes a new draft for each change, and the use case keeps
each part per draft. The release a draft follows is read once.

The policy is a pod's by default: a release in a pod is held to its
data's rules only. `policy=library` adds the Solid Memo library's
curation (`repoPolicy`: English and Swedish keywords, the theme EDUC)
and its place among the library's decks. Neither names a series,
author or host: a library is its index, and a policy is data.

Problems are codes, never text ([problems.ts](../packages/domain/src/release/problems.ts)).
The screen words each in the reader's language
(`studio.problem.<code>`, [problemText.ts](../apps/studio/src/ui/problemText.ts)),
by severity, errors first, then by what it is in: a list each, named
Errors and Warnings after its heading. Each subject links
to its editor, and each problem to its field there (`problemTarget`):
a wrong option's problem opens its question at it. The editor opens
with that field focused. The outline's badges count a wrong option's
problems under its question.

Not every problem can be fixed in the Studio yet:

- No screen has a field yet for the version, the series (`inSeries`,
  `isVersionOf`) or the distribution. A blank draft and a deck's have
  them all, so only a draft of a release that lacks one does. A
  problem about one of them links to the overview. A problem about the
  release's license, publisher, languages, themes, version notes or
  authors, a source, an agent or an activity links to the
  [release screen](#the-releases-metadata-and-provenance), at its
  part.
- The library policy places the draft at `decks/<draft name>/v<N>.ttl`
  and reports each link that differs from that place. A draft that
  follows a release in a pod links to that release, its series and its
  publisher, so it has a `linkMismatch` for each. It also reports a
  draft that states no license (`noLicense`, a library rule:
  [deck-library.md](deck-library.md#checks)), linked to the release
  screen's license field.
- A version the library's index lists already shows up as a
  `versionGap`, with that version twice.

So a new draft's problem count may not reach zero.

## The listing preview

The listing preview
([`ListingPreviewContainer`](../apps/studio/src/ui/ListingPreviewContainer.tsx))
shows the draft as learners will see it in the library: its row in the
library's list (`LibraryDeckRow`) and its own page
(`LibraryDeckScreen`), Solid Memo's own components, over a library
deck built from the draft alone (`draftLibraryDeck` in
[draftListing.ts](../packages/domain/src/release/draftListing.ts)).
Both are inert: a picture, nothing in it to follow or press.

## The trial

The trial
([`TrialContainer`](../apps/studio/src/ui/TrialContainer.tsx)) plays the
draft as learners will play the release it will be: a course with Solid
Memo's own course screens (its page, a chapter's steps, its final
review), a deck with Solid Memo's study. It is the draft's Trial tab.

It is played in a sandbox, so nothing done in it reaches the user's
pod. The use case is `openTrial(draft, instanceUrl)`
([useCases.ts](../packages/application/src/useCases.ts)), which sets the
sandbox up with `startTrial`
([trial.ts](../packages/application/src/trial.ts)):

- **A pod of its own.** Each trial has a new pod, kept in memory, at
  `https://trial.solid-memo.invalid/` (`TRIAL_ORIGIN` in
  [release/trial.ts](../packages/domain/src/release/trial.ts)), which
  never resolves. `createTrialUseCases`
  ([trialUseCases.ts](../packages/composition/src/trialUseCases.ts))
  wires the same Solid adapters and use cases over it as the page's own
  (`routedFetch`). Any other request goes to the page's pods, through a
  fence that refuses every method but GET and HEAD (`readOnlyFetch`): a
  trial never writes to a real pod. It has no login, and none of the
  device's language, theme or update journal.
- **The draft as a library.** The trial's library is the draft alone,
  as the editor keeps it, made afresh at each read
  (`createDraftDeckLibrary` in
  [draftDeckLibrary.ts](../packages/solid/src/draftDeckLibrary.ts)): the
  site's library keeps what it reads, as the releases of `decks/` never
  change. Its cards and a course's outline are read from the draft as a
  release's are. What it says of itself is the listing preview's
  (`draftLibraryDeck`).
- **The same shapes.** Its writes are checked by the page's validator,
  over the trial's pod (`over`): the same shapes, loaded once.
- **Set up as a guest's.** The trial's pod is started as a
  guest's is (a profile, then an instance with its meta document and
  its catalog), with new preferences but for the answer scale and the
  hour the day rolls over, which are the user's. Then the draft is
  started as a course (`startCourse`), or imported as a deck.

A draft that cannot be played is refused, with what keeps it from it
(`trialProblems`), each a link to its field, as in the release check:
the course's rules, and what a release needs that the player needs too
(its title, and each chapter's and step's fields). What a release says
of itself besides its title (its publisher, version, series,
distribution and theme) does not keep a draft from being played.

The course's screens link to the trial's routes, not Solid Memo's:
`CourseLinks` in `ui`
([courseLinks.ts](../packages/ui/src/ui/courseLinks.ts)) holds where a
course's page and its final review link to a chapter, Solid Memo's
course routes unless a provider says otherwise. Each trial has its own
query client too, so nothing it reads mixes with the user's.

Its controls (`TrialControls`):

- **Open a chapter**, as a learner who completed every chapter before
  it: the course restarted, then each one before it completed. The
  answers given stay.
- **Answer all right, or all wrong**: every question of the chapter in
  view, or of the one to take next (its steps', then its review's), a
  wrong answer its first wrong option. A chapter answered right is
  completed. For a deck, every card to study now.
- **Days ahead**: the trial's clock moved ahead by a number of days
  (`Clock` in `ui`, which the course and study screens answer by), to
  play the days to come.
- **Start over**: a new pod and a new query client, for the same draft.
- **Reload the draft**: the draft read afresh from the pod, then a new
  trial of it.

After each control, what is shown is read again and starts afresh. A
trial lasts while its screen is open: leaving it, or reloading the
page, forgets it.

## The release diff

The release diff
([`ReleaseDiffContainer`](../apps/studio/src/ui/ReleaseDiffContainer.tsx))
compares a draft with the release it follows (its `dcat:prev`). It is
the draft's Changes tab, which a draft has when there is one. A draft
of a first version follows none, and the screen (still at its address)
says so. The use case is `diffReleaseDraft(draft)`
([releaseDrafts.ts](../packages/application/src/releaseDrafts.ts)).
It reads the release once, as the release check does, and fails when
it cannot be read. It shows:

- **Rules of the series**: the problems of the check's drops part
  (`continuityProblems`): a subject dropped, an id given to another
  kind of subject, a version that is not the next.
- **What it says of itself**: which of its title, description,
  keywords, themes, study direction, license, authors, languages and
  sources changed, and whether it became a course or a deck
  (`releaseDiff` in
  [releaseDiff.ts](../packages/domain/src/release/releaseDiff.ts)).
- **Its content**: each chapter, step, card and wrong option the draft
  adds, changes, retires or brings back, a link each to its editor,
  and how many of each kind are as they were. Subjects are matched by
  their ids. A card compares as an upgrade compares it (`sameContent`
  in [libraryUpgrade.ts](../packages/domain/src/libraryUpgrade.ts)),
  its wrong options aside, which are listed on their own. Retiring a
  subject is its own change; one retired and changed says both.
- **What learners get** (`simulateLearnerUpgrade`): Solid Memo's own
  upgrade plan (`planLibraryUpgrade`) for a learner's copy of the
  release, as an import makes it, the learner having changed nothing.
  A course's learner has reached every question and completed every
  chapter, so new questions come as they are reached. The sentence is
  the one Solid Memo's update offer says, but for a plan that changes
  only retired cards: no author studies them, so it says "updates only
  retired cards". Then what progress learners would lose: the history
  of the cards the draft drops, and, of a course, the completion of
  the chapters it drops. Both are found by id, whatever the draft's
  version. A draft that retires what it no longer uses loses nothing.
  Learners are offered only a newer version, so a draft whose version
  does not come after the release's offers them nothing.

The learner's copy is built in memory from the release and the draft
as libraries are (`draftLibraryContent` in
[draftListing.ts](../packages/domain/src/release/draftListing.ts)):
nothing is read or written for it. Each version of the draft is
compared once, as the editor keeps it, changes not yet written
included.

## The release's metadata and provenance

The release screen
([`ReleaseMetadataContainer`](../apps/studio/src/ui/ReleaseMetadataContainer.tsx))
edits what a draft's release says of itself beyond its listing, who
made it and how, and what it was made from. It is the draft's Release
tab. It writes the release as the
library's releases are written
([deck-library.md](deck-library.md#provenance)). Each change is a
`DraftChange`, saved as the other screens save theirs
([above](#how-edits-are-saved)). Its parts:

- **About this version**: the version notes (`adms:versionNotes`, one
  text), the languages (`dcterms:language`), the themes
  (`dcat:theme`), the license and the publisher. The languages are
  those of the EU's table that the reference data describes
  (`EU_LANGUAGES`, generated from
  [external.ttl](../ns/vocab/external.ttl): [vocab.md](vocab.md)),
  each named in the reader's language. One the release states outside
  the table is shown by its IRI, to keep or leave out. The themes are
  in groups: the EU's data theme EDUC, which the release check asks of
  every release; Solid Memo's topics (`TOPICS`, from
  [topics.ttl](../ns/vocab/topics.ttl)), optional, each named in the
  reader's language and each narrower one under its broader one; and
  any other the release states, by its IRI, to keep or leave out. The
  license is one of `KNOWN_LICENSES`
  ([license.ts](../packages/domain/src/license.ts)), or the one it
  has. `setLicense` types it `dcterms:LicenseDocument`, as DCAT-AP
  asks; the license it replaces loses that type, unless a source still
  names it. The publisher is one of the release's agents, or the one
  it names elsewhere.
- **Authors**: the release's own agents (`foaf:Agent`, `#<name>`), its
  `dcterms:creator`s, each with a name and an optional email
  ([releaseMetadata.ts](../packages/domain/src/release/releaseMetadata.ts)).
  Removing an author removes its agent too, unless it publishes the
  release or a statement names it (an earlier version's making may: that
  is never rewritten). Authors another document describes are named, and
  kept as they are.
- **How it was made**: the attribution, and notes. The attribution is
  "Compiled by <the authors' names>", with or without "with the help of
  AI", in English and Swedish ("Sammanställd av …"), two `rdfs:comment`s
  of the release's own making (`setAttribution`). It needs an author to
  name, and is written again whenever the authors change. Only a comment
  worded exactly so, for the authors the release names, is read as the
  attribution: a note that starts "Compiled by hand…" stays a note. Nothing here
  can say that anyone reviewed the release. The notes are the making's
  other comments: each paragraph one comment, in its language
  (`setMakingNotes`). A release that names no making is given one,
  `#compilation`, when it first needs it; a next version, its own
  `#revision-<N>`, as for a check.
- **Sources**: each by its address, shown as text and never opened, with
  its title, its creator (as text), its license, and the evidence for
  that license (a comment that quotes or describes it). Each says
  whether the release is derived from it (`prov:wasDerivedFrom`) and
  whether this version's making used it (`prov:used`). It is at least
  one of the two: else nothing would name what the draft states of it,
  and the change is refused (`unusedSource`). Only one an earlier
  version's making used may be neither. A release that names no making
  is given `#compilation` for a source it used. What else the
  draft states of a source is kept as it is. Its license is an address
  (`http:` or `https:`), as a source's is, not a name such as "CC BY
  4.0" (`sourceLicenseValid`); one it states already is kept. A source
  only an earlier version's making used says so, and cannot be removed:
  that making still names it. Removing a source takes away this
  version's mentions of it; what it states stays while an earlier
  version's making uses it. An activity of this version deleted takes
  with it what the draft states of a source it alone used, so nothing
  stays that nothing names. Only the source being edited has a
  form, so a release of hundreds of sources stays light. A new source
  is a web address (`http:` or `https:`) the release does not name yet.
- **Checks**: each check this version had, by a machine or by AI, with
  what it looked at, its scope, its outcome, the day it ended and the
  language it is written in. It is recorded in words that say it was no
  human review (`checkActivityTriples`). An activity written otherwise
  can be deleted, not edited (`readCheckActivity` reads only what the
  Studio writes). Those carried from earlier versions are listed apart,
  and never changed.

### What the check asks of a release's provenance

The release check warns of what a reader of how the release was made
would miss (`provenanceProblems` in
[provenanceRules.ts](../packages/domain/src/release/provenanceRules.ts)).
Each is a warning, never an error, and links to the release screen:

- **A source that does not describe itself** (`sourceUndescribed`): it
  states no title, no creator, or neither a license nor a comment with
  the evidence for one.
- **A source used, not derived from** (`usedNotDerived`): this
  version's own making used it, but the release does not say it is
  derived from it. What an earlier version's making used is not held to
  this: that making is never rewritten.
- **A count that disagrees** (`countDisagrees`): a comment of the
  release's own making states how many chapters, steps, sources
  (or documents) or cards it has, in English or Swedish, and the release
  has another number. Chapters and steps count only in a course, and
  cards only as a total ("466 cards in all"), as a deck's comments often
  count a part of them. An earlier version's making counted that
  version, so it is not held to this one.

The library's command reads a release alone, and cannot tell which of
its making an earlier version's is, so it does not run these rules: the
Studio runs them on a draft, which knows
(`quadsToReleaseModel` marks no making `carried`).

## Publishing a release

Below a draft's metadata, the release screen
([`ReleasePublishContainer`](../apps/studio/src/ui/ReleasePublishContainer.tsx))
releases it, two ways.

**Publish to my Pod** (`publishRelease` in
[releasePublishing.ts](../packages/application/src/releasePublishing.ts)):

- **Where.** In a folder of the pod, the instance's `releases/` unless
  the user types the address of another, at `<folder><name>/v<N>.ttl`
  (`releaseUrlIn` in
  [releasePlace.ts](../packages/domain/src/release/releasePlace.ts)): the
  draft's name and version, as the library names its releases. The
  screen shows the address before anything is written.
- **The user's word.** The user checks that the release will be public:
  anyone with its address can read it, and once published it is never
  changed or taken back here. Publishing waits for that, for the
  changes typed above to be saved, and for the catalog to be writable
  ([below](#data-set-aside)).
- **Checked.** The screen counts the errors the release check finds
  (its rules, for a pod), with a link to it; so does the status bar, on
  every screen of the draft ([Layout](#layout); `publishErrors` in
  [releaseCheck.ts](../apps/studio/src/ui/releaseCheck.ts)). Publishing checks the draft
  again, as the release check does for a pod, the shapes too: an error
  stops it (`releaseHasErrors`), and nothing is written. A warning does
  not.
- **Written once.** The draft is made one Turtle document at the
  address (`assemble`, at library deck format 6, [data-model.md](data-model.md#drafts-and-releases)),
  written only where nothing is (`If-None-Match: *`). An address taken,
  by an earlier release or anything else, is refused (`releaseTaken`):
  a release is never written over.
- **Public.** Then that document alone is made readable by everyone,
  as its server's access control says it: its own ACL on a server with
  Web Access Control, its ACR on one with Access Control Policies
  (`ReleasePublisher`, [boundaries.md](boundaries.md#access-control)).
  This is the only place the app changes who may read something.
- **Listed.** The catalog links it (`sm:publishedRelease`).
- **Frozen.** The draft names the release it was published as
  (`sm:releasedAs`), and changes no more: every screen shows it, frozen.
- **One version.** The draft is read once. What is checked is what is
  written, and what is marked released: the draft at the version read
  (If-Match). A draft changed elsewhere meanwhile, in another tab or
  app, is `changedElsewhere`. Before the release is written, nothing is
  written. After, the release stays, as it was checked, and the draft is
  not marked.
- **Finished again.** Publishing cut short after the release is written
  (the catalog, the draft or the network failed) is finished by
  publishing again, at the same address. The document there states what
  this release does, its time of issue aside, so it is this one: it is
  made public, listed and its draft frozen, as if just written. A
  document that states something else is `releaseTaken`, and so is a
  release another of the instance's drafts names as its own, though this
  draft would state the same.

A pod that will not make the release public (it has no access control
the app can write, it refuses the write, or it names the folder's
access control as the release's, so the write would change the whole
folder's) still has the release, written and listed, readable by its
owner alone. The draft is released all the same: what is written there
is frozen. The screen says so ("Only you can read it"), with **Make it
public**, which tries the access again (`makeReleasePublic`;
`publicAccessRefused` when it still fails). Whether a release is public
is asked as someone with no login would ask (`isReleasePublic`, a
request without credentials).

A guest's draft is not published: a guest's pod is in this browser, and
no one else could read it. The screen offers the download alone.

A released draft shows where its release is, a link to copy, whether
anyone can read it, and **Start the next version**: a new draft of
version N + 1, which keeps everything the release published
([above](#drafts)), and opens. A released draft can also be deleted
from the drafts; the release stays.

**Download .ttl** (`downloadRelease`) saves the draft as a release
file, `<name>-v<N>.ttl`, at the address the library would publish it
at (`libraryReleaseUrl`, by the library's index), to propose it for the
library. Nothing in the pod changes, and nothing is checked: the
library's own check does that. The screen lists the steps of a pull
request, in a copy of the repository:

1. Put the file in `decks/` as `decks/<name>/v<N>.ttl`.
2. `npm run format:turtle && npm run library`.
3. `npm run library:check -- --base main`.
4. `npm run check && npm run crosscheck`.
5. Open a pull request with the new file and the index.

It links to the draft's release check for the library first
([above](#the-release-check)).

## Releases

The releases screen
([`ReleasesContainer`](../apps/studio/src/ui/ReleasesContainer.tsx),
`listPublishedReleases`) lists the releases the instance published, as
its catalog links them. Each has its address, named by it ("capitals,
version 2") when it is named as releases are, a link to copy, who can
read it (everyone, or only its owner, with **Make it public**), and
**Start the next version**, which makes a draft of it and opens it.
Each links the draft it was published from (the draft says what it was
released as), while the instance has it. It changes no release. The
table is a [`DataTable`](#card-workbench): a column's name sorts it,
then the other way, then as the catalog lists them, **Enter** opens
the release at the cursor, as its name's link does, and a filter
keeps the releases whose name or address holds its text, case and
accents aside. The sidebar and the drafts screen link to it
("Published releases" there). A learner adds a release in Solid Memo by
the link copied here ([deck-library.md](deck-library.md#from-a-link)).

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
- **The arrangement set aside** (the catalog or a deck group invalid):
  Groups cannot be rearranged, Home moves no deck into a group, and the
  instance's name and catalog, an import, making or deleting a draft,
  publishing a release and starting a next version are held.
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
  nothing the page loads up front holds any of the Studio, its
  stylesheet included ([above](#layout)), and checks
  the whole bundle, the Studio's chunk included, for HTML sinks
  ([markdown.md](markdown.md#safety)).
- `npm run build` and `npm run dev` therefore build and serve the
  Studio with the site: `npm run dev` serves it at
  `http://localhost:5173/#/studio`.
