# Studio

Solid Memo Studio is a second app beside Solid Memo, in the same page,
at `https://solid-memo.com/#/studio`. Users manage their decks there,
and creators write decks and courses and publish them.

To manage, it edits and groups an instance's decks in a table, and a
deck's cards one by one or at once, with their wrong options,
schedules and answers. It shows a deck's schedule to come and
everything wrong with a deck or the instance, upgrades copies of
releases, exports and imports decks as files, and draws the instance's
data as a graph.

To create, it keeps a creator's drafts of releases in the instance:
decks and courses, with their metadata and provenance. A draft is
checked by every rule a release is held to, previewed, tried, compared
with the release it follows, and published in the pod or saved as a
file for the library. A learner adds a published release in Solid Memo
from its link ([deck-library.md](deck-library.md#from-a-link)).

## What it shares with Solid Memo

The Studio is its own package, `@solid-memo/studio` in
[`apps/studio/`](../apps/studio/), with its own screens, tests and
router, on the same layers as Solid Memo's app
([boundaries.md](boundaries.md)):

- Its entry point is `StudioWorkspace`, the signed-in Studio. Solid
  Memo's page ([`apps/web/src/App.tsx`](../apps/web/src/App.tsx))
  shows it for the hashes under `#/studio`.
- Around it is the page's one `AppShell` from `@solid-memo/ui`: the
  session restore, the landing page and its login, the connected Pod,
  the masthead, the language, the theme and the footer. At the Studio's
  routes the shell names the Studio (`STUDIO`, an `AppIdentity` in
  `ui`): its name, its tagline, its home (`#/studio`, the wordmark's
  link) and a link back to Solid Memo.
- Its screens are in [`apps/studio/src/ui/`](../apps/studio/src/ui/),
  containers over use cases and screens over props, as in `ui`. They
  reuse `ui`'s components, such as `InstancePickerContainer`,
  `Breadcrumbs` and `ReaderText`.
- Its text is in its own message files,
  [`apps/studio/src/i18n/`](../apps/studio/src/i18n/), under
  `studio.*`, in each of Solid Memo's languages
  ([i18n.md](i18n.md#the-studios-messages)). `ui`'s files keep only
  what the page says before the Studio's code is there: its name, its
  tagline, the link back to Solid Memo, the links that open it
  (`studio.open`), and that it's opening or couldn't be.

Both apps share one session and one login
([authentication.md](authentication.md#session-restore)), and link to
each other by hash. A login set off in the Studio, or a reload of one of
its routes, comes back to the Studio: the session gateway puts back the
hash the redirect drops. They share the use cases, their cached queries,
and the browser's storage: the guest's pod, the language and theme
chosen on this device, and the update journal. While a tab moves a
guest's study into a pod, the others refuse to write to it
([guest-mode.md](guest-mode.md#as-a-new-instance)).

The Studio's code is a chunk of its own, fetched the first time a
Studio route opens (`loadStudio`, in
[`apps/web/src/main.tsx`](../apps/web/src/main.tsx)). Its messages
come the same way: English in its chunk, and each other language in a
chunk of its own. The page adds them to its catalogs, and fetches the
one for its language before it shows the Studio (`addCatalogs`, in
`apps/web/src/App.tsx`). Meanwhile, under the masthead, the page says
the Studio is opening, and if the chunk or its messages can't be
fetched (offline, or after a new deploy), it says so.

## Layout

The Studio is a workspace for authors, not a column to read
([`shell/StudioShell.tsx`](../apps/studio/src/ui/shell/StudioShell.tsx)).
It takes the whole window, and the window doesn't scroll:

- **The header** is one row: the sidebar's button, the masthead (the
  Studio's name, who is signed in, Log out), the open instance, the
  palette's button ([below](#quick-open-and-commands)), the theme and
  language lists, and the link back to Solid Memo. Who is signed in is
  cut short (to no less than 12rem), and left out on a narrow screen
  (48rem or less), where the header is two rows: the button, the name
  and Log out, then the rest.
- **The open instance**, for a user with several, is a menu of the
  others, each at its decks, and All instances
  ([`shell/InstanceSwitcher.tsx`](../apps/studio/src/ui/shell/InstanceSwitcher.tsx)).
- **The sidebar**, beside the main content while an instance is open
  ([`shell/StudioSidebar.tsx`](../apps/studio/src/ui/shell/StudioSidebar.tsx),
  a navigation named Studio), links to the instance's sections: Decks
  (Home), Groups, Drafts, Releases, Graph, Health, Library copies,
  Import and export, and Name and catalog.
  - The section shown is marked (`aria-current`). Beside Health is the
    number of problems the instance's check found, once a screen has
    run it (the sidebar runs none).
  - Under the sections are the instance's decks, each at its cards, and
    its drafts, each at its overview with its version, the one shown
    marked, from the screens' own queries. A filter keeps those whose
    name holds its text, case and accents aside.
  - Above the decks are those opened last on any of their screens
    (Recently opened, five at most, the last first), less those pinned.
    Each has a pin (**Pin** *name*, pressed while pinned). Pinned ones
    are listed at the sidebar's top (Pinned), in the order pinned.
  - Its button, or Ctrl+B, hides it; the device remembers. Hidden with
    the focus in it, it gives the focus to its button, as the aside and
    the dock do.
  - On a narrow screen it's a drawer over the page, opened by its
    button and closed by a link followed in it, a press outside it,
    Escape, or its own **Close**.
- **The main content** scrolls on its own: the trail, the tabs of the
  deck or draft shown, then the screen. A table's header row stays in
  sight. A table too wide scrolls the main content sideways, or, on a
  narrow screen, its own box. What has the focus in a table is
  scrolled clear of the parts that stick over it (its header row, its
  first column and the bar of the rows selected)
  ([`shell/stickyClearance.ts`](../apps/studio/src/ui/shell/stickyClearance.ts)).
- **The aside**, right of the main content, is a complementary region
  named for what it shows (the table below: [Home](#home)'s deck, a
  [library copy](#library-copies)'s upgrade), such as a course draft's
  [outline](#the-outline). Its button at the header's end, its **Hide**,
  or Ctrl+\ hides it, and its splitter, on its left edge, sets its
  width; the device remembers both. The aside is at most the window less
  35rem, the main content keeping 20rem beside the sidebar's room. On a
  screen 64rem wide or less it's a drawer at the page's right, as the
  sidebar's is. Escape in a dialog of it (a question of the outline's)
  closes only the dialog.
- **A card beside its deck's cards**: on a card's route, wider than
  64rem, the main content is the deck's [workbench](#card-workbench)
  and the aside, named Card, is the [card inspector](#card-inspector).
  Its **Close**, or Ctrl+\, goes to the deck's cards alone, a Back
  stop. Its splitter is wider than the outline's. On a screen 64rem
  wide or less the card's route shows only the inspector.
- **The dock**, under the main content and the aside, is a region named
  Panel ([below](#the-dock)), hidden until its button in the status
  bar, or Ctrl+J, shows it. The device remembers that, and its height,
  which its splitter on its top edge sets. Hidden from its **Hide** or
  with Ctrl+J, it gives the focus to **Panel**.
- **The status bar**, at the foot, beside the site's footer, shows:
  - the open instance;
  - on a draft's screens, "Saving the draft…", "Draft saved", or "Last
    change not saved" when its write failed or the draft refused it
    ([below](#how-edits-are-saved));
  - on a draft's screens, **Ready to publish**, a link to its Release
    tab, while no error blocks it, or **Released** once it is
    ([below](#publishing-a-release));
  - the count of the problems of the deck or draft shown, a button that
    opens the dock at them: "5 problems, 3 block publishing", or "3
    problems block publishing" when all do (or the check shown is for
    another policy);
  - the dock's button (**Panel**), the density switch, and the keys
    (**? Keys**).

**Tabs.** A deck's screens have the deck's tabs, under the trail
([`shell/ContextTabs.tsx`](../apps/studio/src/ui/shell/ContextTabs.tsx),
a navigation named Deck): Cards (a card in the inspector among them),
Schedule, Health, About, and Export, which opens import and export with
the deck checked. A draft's screens have the draft's tabs (named
Draft):

- Overview (its chapters and steps under it);
- Cards (its questions under them);
- Check, which counts the problems the release check finds ("Check 3",
  heard as "Check 3 problems");
- Preview, Trial, Changes (only for a draft that follows a release) and
  Release.

The tab shown is marked `aria-current="page"`, and on a page under a
tab (a card, a chapter, a step or a question) that tab is marked
`aria-current="true"`; both look bold and underlined. The card
inspector's tabs and the release check's policies are tabs of the same
kind. The sidebar and the tabs are links, each a Back stop; hiding or
sizing a pane, or opening a drawer, isn't.

**What each screen has around it** comes from its route alone
([`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts):
`sectionOf`, `deckOf`, `contextTabsOf`, `asideOf`):

| Screens | The sidebar marks | Tabs | The aside | The dock's problems |
| --- | --- | --- | --- | --- |
| the instances | no sidebar: no instance is open | none | none | none |
| Home | Decks | none (its views are its own) | the deck at the table's cursor (Deck) | none |
| the library copies | Library copies | none | the upgrade of the copy at the table's cursor (Upgrade) | none |
| groups, drafts, releases, the instance's health, import and export, name and catalog | that section | none | none | none |
| the graph | Graph | none | the node selected (Node) | none |
| a deck's cards, schedule, health and about screen | the deck | the deck's | none | what the deck's health found |
| a card | the deck | the deck's, Cards marked as the card's | on a wide screen, the card (Card) | what the deck's health found |
| a draft's overview | the draft | the draft's | none | its release check's |
| a draft's other screens: its cards, check, preview, trial, changes and release | the draft | the draft's | a course's outline (Outline) | its release check's |
| a chapter, a step, a question | the draft | the draft's, Overview or Cards marked as theirs | a course's outline, the item edited marked | its release check's |

**What is saved, and when.** A draft's changes are saved as they're
made (How edits are saved, below). Elsewhere a button, a menu's item
or a drag changes the pod at once, asking first when something is
lost. A form waits for its Save: a card's content, its wrong options, a
deck's or the instance's about screen, a cell edited in place. A
card's content or a cell not saved is asked about (Save, Discard or
Stay) before anything leaves it. The layout is kept on the device,
never in the pod.

Its look is calm: headings in the body's type, sections flat with a
thin border, no tilt, stamp or pop, and Solid Memo's colors, theme and
instance colors among them ([theme.md](theme.md)).

**Density.** Rows and controls are about 28px high on every screen,
touch too: above the 24px minimum target of WCAG 2.2
([glossary](glossary.md#solid-and-the-web)). The status bar's
Comfortable makes them 44px; Compact goes back. The choice is kept on
the device
([`shell/prefs.ts`](../apps/studio/src/ui/shell/prefs.ts), key
`solid-memo:studioLayout.v1`; storage that's missing or refuses gives
compact), and changes no history entry. The same key keeps:

- whether the sidebar, the aside and the dock are shown;
- the aside's width (the outline's, and a card's beside its deck's
  cards) and the dock's height, each kept within its bounds;
- the columns each table hides.

Each instance's own state is under another key
(`solid-memo:studioInstances.v1`, by the instance's URL): the views
saved of Home and of the workbench (Saved views, below), the decks and
drafts pinned, and those opened last. Storage that refuses keeps them
for the page's life only.

**Keys.** The Studio has one listener of keys, in its shell
([`shell/useShortcuts.ts`](../apps/studio/src/ui/shell/useShortcuts.ts)).
Its keymap is data
([`shell/shortcuts.ts`](../apps/studio/src/ui/shell/shortcuts.ts)), each
key of one scope: anywhere in the Studio, or in a table (`useRowKeys`,
[`shell/useRowKeys.ts`](../apps/studio/src/ui/shell/useRowKeys.ts)). The
key help lists them by their scope:

| Keys | Where | What they do |
| --- | --- | --- |
| Ctrl+K, Cmd+K | anywhere, a field too | open the palette (Quick open and commands, below), as **Search or run…** does |
| `?` | anywhere | list every key, as **? Keys** does |
| `/` | anywhere | go to the screen's search or filter: Home's, the workbench's, a draft's cards', the releases', the graph's |
| F6, Shift+F6 | anywhere, a field too | go to the next region, or the one before: the header, the sidebar, the main content, the aside, the dock (each while it's shown), the status bar |
| `g d`, `g g`, `g r`, `g p`, `g h`, `g l`, `g t` | with an instance open | go to its decks (Home), groups, drafts, releases, health, library copies, or import and export |
| `g i` | anywhere | go to the instances |
| Ctrl+B | with an instance open | show or hide the sidebar; on a narrow screen, open or close the drawer |
| Ctrl+\ | Home, the library copies, the graph, a course draft's screens but its overview; a card beside its deck's cards | show or hide the aside, or its drawer on a screen not wide; close the card |
| Ctrl+J | with an instance open | show or hide the dock |
| F8, Shift+F8 | a deck's or a draft's screens, a field too | go to the field of the next problem, or the one before (The dock, below) |
| `]`, `[` | a deck's or a draft's screens | go to the next tab, or the one before, round from either end |
| `1` … `9` | a deck's or a draft's screens, but the trial | go to the tab of that number; in the trial they're the learner's, a grade or an option |
| `j`, `k`, `x`, Enter | a table: the card workbench (a card beside it too), Home, the library copies, a draft's cards, the releases | the next row (shown in the aside, where there is one), the one before, select it, open it (Card workbench, below) |
| Shift+J, Shift+K, Escape | a table whose rows are selected | select the row and the next, or the one before; clear the selection |
| `.` | a table whose rows are selected | open the first menu of the selection's bar, or go to its first button ([below](#bulk-edits)) |
| F2 | a table with cells to edit: Home, the card workbench | edit the cell the focus is in, or the row's first that can be edited (Editing in a cell, below) |
| Ctrl+Enter, Cmd+Enter | a text of several lines | submit its form, as Enter does a text of one line (`ui`'s `LangTextField`); the key help leaves it out |
| Escape | a drawer, a dialog, the palette, a cell edited in place | close it, the cell unchanged |

**Single-key shortcuts** are a character alone: `?`, `/`, the `g`
chords, `[`, `]`, `1` … `9`, and a table's `j`, `k`, `x`, `.`, Shift+J
and Shift+K. The key help can turn them off (WCAG 2.1.4, for speech
input), and the device remembers it (`characterKeys`, Density, above).
The keys with Ctrl, the F keys, Enter, Escape and the buttons still
work. A character typed with AltGr, or with Option on a Mac (`[` is
AltGr+8 on a Swedish keyboard), is the character. On Windows, Ctrl+\
can't be told from a `\` typed with AltGr (Ctrl+Alt there); the
aside's button or the palette shows or hides the aside instead.

A pair such as `g d` is pressed one key after the other, the second
within 1.5 seconds; a key held down counts once. A `g` chord, and a
tab's key, is a Back stop, except to the page already shown. A field
being typed in keeps its keys, Ctrl+K, F6, Shift+F6, F8 and Shift+F8
aside.

A key goes first to what has the focus (a menu's arrows, say), then to
the screen's own keys (`useScreenKeys`), then to the Studio's. While a
dialog is open, keys are the dialog's, wherever the focus is, but
Ctrl+K (Cmd+K) closes the dialog and opens the palette. While a menu is
open (Columns, say), every key is the menu's.

A field or button with a key, the one `/` goes to among them, says so to
screen readers (`aria-keyshortcuts`). The key help is a modal dialog,
the browser's own
([`shell/Dialog.tsx`](../apps/studio/src/ui/shell/Dialog.tsx)); Escape
or Close closes it, and the focus goes back where it was. A saved view
renamed keeps the focus; one removed gives it to **+ Save view**.

A splitter
([`shell/Splitter.tsx`](../apps/studio/src/ui/shell/Splitter.tsx)) is a
separator, as screen readers know one, that takes the focus. Its value
is the pane's size in pixels, between bounds that scale with the text
size over the browser's default 16px ([theme.md](theme.md#text-size)).
Left and Right (Up and Down, for the dock's) move it 16 pixels, Home
and End to either end; the pointer drags it
([`shell/splitter.ts`](../apps/studio/src/ui/shell/splitter.ts)).

**Filters and the selection.** A table's filters (the workbench's,
Home's, a draft's cards') are one row over it, wrapping only on a
narrow screen, each label beside its field, and the counts at the
row's end. Rows selected in a table (the workbench, Home, the library
copies, a draft's cards) bring up a bar under it
([`shell/BulkBar.tsx`](../apps/studio/src/ui/shell/BulkBar.tsx)), a
group named for them ("Selected cards") at the foot of the main
content. It stays in sight as the table scrolls, and it's there only
while some are selected. It shows what can be done with them all at
once (a few buttons, and menus of the rest), and **Clear selection**.
A status line, there throughout, says how many are selected.

**Questions and forms in a dialog.** Whatever loses something asks
first, in the Studio's own dialog, not the browser's
([`shell/ConfirmDialog.tsx`](../apps/studio/src/ui/shell/ConfirmDialog.tsx),
`useConfirm`): a heading, the question, the action (it has the focus)
and Cancel; Escape or Close does nothing either. Deleting cards, decks,
a draft or a part of it, forgetting progress, restarting a course, and
removing data from the pod on the health screen ask this way.

The components the Studio shares with Solid Memo (removing a card,
deleting a wrong option, deleting an instance) ask through `ui`'s
`AskFirst` ([`askFirst.ts`](../packages/ui/src/ui/askFirst.ts)): the
Studio gives it `useConfirm`, and Solid Memo the browser's `confirm`.
Deleting a group, or a deck from the groups' tree, still asks in the
browser's dialog: the focus afterward comes from the button the
question leaves it on. A bulk edit that needs more input (a language,
a day, a deck, a group) asks in a dialog too.

**Editing in a cell.** Some cells are edited where they are
([`shell/EditableCell.tsx`](../apps/studio/src/ui/shell/EditableCell.tsx)):
on Home a deck's direction and pace, on the workbench a card's front
and back.

- Such a cell is a button named for what it does ("New per day of
  Kanji N5: 20 (instance)"), outlined when pointed at.
- A click, Enter on it or F2 on its row opens a field in the cell; a
  card's front, whose cell is its link, opens only by F2.
- **Enter**, or **Save**, saves it as the bulk edits do, and the cell
  has the focus again. **Escape**, or **Cancel**, leaves it unchanged.
- A value refused stays in the field, marked invalid, and the screen
  says why.
- A value changed and not saved stays as the focus goes elsewhere, and
  is asked about before it's left, as a card's edits are; one
  unchanged closes as the focus leaves it. Saved from that question,
  it's saved onto the row as it is then (a deck's pace saved from
  another cell since is kept); discarded, the edit is gone.
- Enter and Escape that an input method takes, to end or drop a
  syllable it composes (Korean, say), are the input method's.
- A side's field is marked with the side's language (an Arabic side
  reads right to left, in its font).
- The names of the button and the field are put together from the
  page's text with `aria-labelledby`, so the deck's or card's name and
  the cell's text keep their languages ("Back of كتاب: Book").
- Nothing is saved unasked.

**Saved views.** Beside a table's own views (Home's and the
workbench's), **+ Save view** saves the table's query under a name,
asked in a dialog
([`shell/SavedViews.tsx`](../apps/studio/src/ui/shell/SavedViews.tsx)).
Each is a tab, pressed while the table is in its query, which a press
puts it in (no Back stop). Its menu renames it or removes it, once the
user confirms. A view saved or renamed under a name taken replaces that
view. The device keeps them for each instance, the workbench's for
every deck. A view keeps the query as its URL has it (`q=kanji&show=due`;
[`shell/views.ts`](../apps/studio/src/ui/shell/views.ts)), the
workbench's without its page.

### The dock

The dock
([`shell/BottomDock.tsx`](../apps/studio/src/ui/shell/BottomDock.tsx))
has two tabs, a tablist (Left and Right go from one to the other):

- **Problems**, counted in its tab and in the status bar, on a deck's or
  a draft's screens
  ([`WorkspaceProblems.tsx`](../apps/studio/src/ui/WorkspaceProblems.tsx)).
  - A draft's are its [release check](#the-release-check)'s, the shapes
    left out: for a pod, or, on the check, for the policy it shows.
    The query, shared with the overview and the check screen, runs once
    a version of the draft. They're listed as the check lists them
    (`ProblemList`): by severity, then by what they're in, each a link
    to its field.
  - A deck's are what its [health](#health) found. The check of its
    data is one line, a link to the deck's health. Each unstated
    language, group of cards that say the same, and Markdown finding
    links to its field. The dock, shown at a deck's problems,
    checks it if neither a Home badge nor its health screen has.
  - Off a deck's or a draft's screens the tab says where problems are
    listed.
- **Activity** lists what the screens said they did since the page was
  opened, the last first, each after its time, 50 at most:
  - the draft saved (or its last change not), and a draft made or
    deleted;
  - Home's bulk changes and the workbench's bulk edits;
  - undo, moves and copies, and a card saved in the inspector;
  - an export or an import, and a release published or saved as a file.

  A line said twice in a row is counted on the last, at the time it
  was last said ("Draft saved ×5", `addActivity`). A screen tells its
  status line through `ActivityLog` (`useActivity`, in
  [`shell/activity.ts`](../apps/studio/src/ui/shell/activity.ts)), but
  not what it shows as it opens.

F8 goes to the field of the next problem in the Problems list, Shift+F8
to the one before, as a link does, round from either end. It counts
from the problem gone to last while its page is shown, so two problems
in one field are each gone to, else from the page shown
(`stepProblem` in
[`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts)).

**Its stylesheet** is [`studio.css`](../apps/studio/src/ui/studio.css),
in the Studio's chunk, over the site's `style.css`, which holds none of
the Studio's rules. Every rule holds under
`<html data-surface="studio">`, which the shell sets while it's shown and
removes after;
the density is `data-density` beside it. The screens' rules come first,
their scope in `:where()`, so the workspace's rules after them win. A
test ([studio.test.ts](../apps/studio/src/ui/studio.test.ts)) checks
the rules through the cascade, and that Solid Memo's screens are left
as they were.

### Quick open and commands

The palette
([`shell/CommandPalette.tsx`](../apps/studio/src/ui/shell/CommandPalette.tsx),
a dialog named Quick open) opens with Ctrl+K (Cmd+K on a Mac), or with
**Search or run…** in the header. It finds, as the user types:

- the **commands** of the screen shown, and the Studio's own (show the
  keys, show or hide the sidebar, the aside or the dock);
- the **tabs** of the deck or draft shown, each with its number;
- the open instance's **sections**, each with its `g` chord (Graph and
  Name and catalog have none), and All instances;
- the user's **instances** (at their decks), the open instance's
  **decks** (at their cards) and **drafts** (those that can be read,
  at their overview);
- the **cards of the deck shown**, in the inspector, once something is
  typed.

It lists what the workspace's cache held when it opened, reading
nothing from the pod. The entries and their rank come from
[`shell/commandIndex.ts`](../apps/studio/src/ui/shell/commandIndex.ts):

- An entry matches when its name holds the letters typed in their
  order, case and accents aside ("kn5" finds Kanji N5).
- A letter at the start of a word, or right after the one before,
  counts for more, and a shorter name a little. The best 50 come
  first, each group under its heading where its best is.
- With nothing typed, the decks and drafts pinned come first (Pinned),
  then the entries used last (Recently used, eight at most, those
  pinned aside, the last first), then the rest but the cards. The
  device keeps those used last by group and target, or command
  ([`shell/prefs.ts`](../apps/studio/src/ui/shell/prefs.ts), key
  `solid-memo:studioRecent.v1`).
- Each entry shows the keys that do the same, if any.

The field is a combobox over the list: the focus stays in the field,
and the entry picked is its `aria-activedescendant`. Down and Up pick
the next entry or the one before, round from either end, and Enter, or
a click, chooses it. Escape, or Ctrl+K (Cmd+K) again, closes the
palette, and the focus goes back where it was. An entry that goes
somewhere is a Back stop, except to the page already shown; a command
runs once the palette has closed.

A screen adds the commands it can run at the moment
(`useScreenCommands`, in
[`shell/useScreenCommands.ts`](../apps/studio/src/ui/shell/useScreenCommands.ts));
beside a card, Close the card stands for the aside's. A screen's are:

| Screen | Command | What it does |
| --- | --- | --- |
| [Drafts](#drafts) | New draft | goes to the new draft's form, while a draft can be made |
| [Health](#health), an instance's or a deck's | Check again | checks again, while it isn't checking |
| [Import and export](#import-and-export) | Export *n* decks | exports the decks checked, as the form's button does, while some are and none is being exported |

## Routes

The Studio has its own hash router
([`src/ui/router.ts`](../apps/studio/src/ui/router.ts)), on the same
core as Solid Memo's (`routerCore.ts` in `ui`,
[routing.md](routing.md)). Its hashes all start with `#/studio`
(`STUDIO_PATH`, `isStudioHash` in `ui`'s router); Solid Memo's are the
others.

| Hash | Screen |
| --- | --- |
| `#/studio/instances` | the instance picker. Its link for a new instance goes to Solid Memo's storage picker. |
| `#/studio?instance=…[&q=…&sort=…&order=desc&show=…&deck=…]` | Home ([below](#home)). `q` filters it, `sort` names the column it's sorted by, and `order=desc` sorts it the other way. `show` is the view: `due`, `courses`, `copies` or `attention`; every deck without it. `deck` is the deck at the cursor. |
| `#/studio/groups?instance=…` | Groups ([below](#groups)). |
| `#/studio/cards?deck=…[&q&field&lang&state&has&sort&order&page&size]` | the card workbench ([below](#card-workbench)). The deck names the instance: its catalog's folder. |
| `#/studio/card?deck=…&card=…[&tab=distractors\|schedule\|history&field=…][&q&in&lang&state&has&sort&order&page&size]` | the card inspector ([below](#card-inspector)): its content (the default tab, left out of the URL), or with `tab` its wrong options, review state or answers. `field` opens it at one field: a text of the content (`front`, `backNote`…), or a wrong option by its id. The rest is the query of the workbench beside the card, but `in` for its `field`; without it, the deck's cards as listed. |
| `#/studio/schedule?deck=…` | a deck's schedule ([below](#a-decks-schedule)). |
| `#/studio/about?deck=…` | a deck's about screen ([below](#a-decks-about-screen)). |
| `#/studio/instance?instance=…` | the instance's name and its catalog ([below](#the-instance)). |
| `#/studio/health?instance=…[&deck=…]` | the instance's health, or one deck's ([below](#health)). |
| `#/studio/library?instance=…` | the library copies ([below](#library-copies)). |
| `#/studio/transfer?instance=…[&deck=…&deck=…]` | import and export, each `deck` checked ([below](#import-and-export)). |
| `#/studio/drafts?instance=…` | the instance's drafts ([below](#drafts)). |
| `#/studio/draft?draft=…[&field=…]` | a draft's overview ([below](#a-drafts-overview)). `draft` is the draft's release document, which names the instance. |
| `#/studio/chapter?draft=…&chapter=…[&field=…]` | a chapter of a course draft, by its id ([below](#a-chapter)). |
| `#/studio/step?draft=…&step=…[&field=…]` | a step of a course draft, by its id ([below](#a-step)). |
| `#/studio/question?draft=…&card=…[&field=…]` | a card of a draft, by its id: a course's question, or a deck's card ([below](#a-question)). |
| `#/studio/draft-cards?draft=…[&filter=…&lang=…&sort=…&order=desc&page=…]` | a draft's cards ([below](#a-drafts-cards)): `filter` is `unasked`, `askedTwice`, `fewDistractors` or `retired`, `lang` a language, `sort` the column (`front`, `back`, `place`, `distractors` or `id`; by id without it), and `order=desc` the other way. |
| `#/studio/check?draft=…[&policy=library]` | a draft's release check ([below](#the-release-check)), for a pod, or with `policy=library` for the Solid Memo library. |
| `#/studio/preview?draft=…` | a draft's listing preview ([below](#the-listing-preview)). |
| `#/studio/trial?draft=…[&chapter=…&part=review]` | a draft's trial ([below](#the-trial)): a course's page, with `chapter` (an id) that chapter's steps, and with `part=review` its final review; a deck's study. |
| `#/studio/diff?draft=…` | a draft's release diff ([below](#the-release-diff)). |
| `#/studio/release?draft=…[&field=…]` | the release's metadata and provenance ([below](#the-releases-metadata-and-provenance)), then its publishing ([below](#publishing-a-release)). |
| `#/studio/releases?instance=…` | the releases the instance published ([below](#releases)). |
| `#/studio/graph?instance=…[&node=…]` | the graph ([below](#graph)). `node` is the node selected, by its IRI. |

`#/studio/` and its query count as `#/studio`. Anything else under
`#/studio`, `#/studio` among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker, an unknown deck to its instance's Home, an unknown card
(one removed, say) to its deck's cards, and a chapter, step or card a
draft doesn't have to the draft's overview. A `node` the graph doesn't
have counts as none. Like Solid Memo's fallbacks, these replace the
history entry.

`field` opens a draft's screen at one of its fields, where the release
check links (a field the screen doesn't have is left out):

- the overview's `title`, `description` or `outline`;
- a chapter's `title`, `description`, `steps` or `review`;
- a step's `theory` or `questions`;
- a question's text (`front`, `backNote`…), its wrong options
  (`distractors`) or one of them (`distractor:<id>`);
- the release screen's `versionNotes`, `languages`, `themes`,
  `license`, `publisher`, `authors`, `making`, `sources` or `checks`.

These replace the history entry: Home's query and deck beside it, the
workbench's query, the inspector's tab, the decks checked to export, a
draft's cards' view, the graph's node selected, and the card beside
the deck's cards. Opening a card from the list, or a deck from Home or
a card from a draft's cards with Enter, is a Back stop.

Solid Memo links to Home as `#/studio?instance=…` ("Open in Studio",
in its instance bar, each deck's actions menu and the deck page;
`routing.md`). A deck's link opens its instance's Home too.

The trail starts Instances › Decks, then goes on by screen (`crumbsOf`,
in [`shell/titles.ts`](../apps/studio/src/ui/shell/titles.ts), from
the route and the deck, card or draft it names):

| Screen | The trail goes on |
| --- | --- |
| Groups | › Groups |
| the workbench | › Cards of *deck* |
| the inspector | › Cards of *deck* › *card* |
| a deck's schedule | › Cards of *deck* › Schedule |
| a deck's about screen | › About *deck* |
| the instance's screen | › Name and catalog |
| the instance's health | › Health |
| a deck's health | › Health › *deck* |
| the library copies | › Library copies |
| import and export | › Import and export |
| the drafts | › Drafts |
| the releases | › Releases |
| the graph | › Graph |
| a draft's overview | › Drafts › *draft* |
| a chapter | › Drafts › *draft* › *chapter* |
| a step | › Drafts › *draft* › *chapter* › Step 2 |
| a draft's cards | › Drafts › *draft* › Cards |
| a question | › Drafts › *draft* › Cards › *card* |
| a draft's check | › Drafts › *draft* › Release check |
| a draft's preview | › Drafts › *draft* › Listing preview |
| a draft's trial | › Drafts › *draft* › Trial |
| a draft's comparison | › Drafts › *draft* › Changes |
| a draft's release metadata | › Drafts › *draft* › Release |

The document title is the trail's last step and "Solid Memo Studio".
After a move, the screen's heading takes the focus (`useScreenFocus`).
The link back to Solid Memo, in the header, the landing page and the
Pod connection screen (`headerLink` in `STUDIO`), goes to the open
instance's decks when there is one. The Studio's links into Solid Memo
(a deck's page, its preferences, a new instance) are Solid Memo's own
hashes.

The Studio's old address, `/studio/`, is a small page
([`apps/web/public/studio/index.html`](../apps/web/public/studio/index.html))
that sends `/studio/#/x` on to `../#/studio/x`. Its script runs under a
Content Security Policy that allows only it, by its hash. A test
([studioRedirect.test.ts](../apps/web/src/studioRedirect.test.ts))
checks both.

## Home

Home ([`DeckTableContainer`](../apps/studio/src/ui/DeckTableContainer.tsx))
is a table with a row per deck. Its columns are:

- the deck's name, a link to its [about screen](#a-decks-about-screen),
  and its badges:
  - **Library** for a copy of a library deck (it has
    `prov:wasDerivedFrom`);
  - **From \<host>** for a copy of a release added from a link, which
    no index lists ([deck-library.md](deck-library.md#from-a-link));
  - **Course** for a copy of a course, wherever it came from;
  - **Invalid data** when the instance's check finds a problem in its
    entry or its documents ([validation.md](validation.md));
  - **Unreadable** when its cards couldn't be read;
- the groups it's in, outermost first, or "Top level";
- its direction, and its pace: new cards and reviews per day. A limit
  the deck doesn't set is the instance's, marked "(instance)";
- how many cards are due today and how many are new, as Solid Memo
  counts them (from the study digest when it's fresh);
- when it last changed (`dcterms:modified`, else when it was made);
- its cards, retired ones aside, a link to its cards in the
  [workbench](#card-workbench).

Beside a deck's name are its problems ([health](#health)), "3
problems", a link to the deck's health, and for a copy with a newer
release out, "Release 2 out", a link to the
[library copies](#library-copies). Both are looked up only once the row
is on the screen (`IntersectionObserver`): one read of the library's
index for every copy (`listLibraryUpdates`), and for a copy from a link
its creator's catalog. A deck with no problem gets no badge, nor does a
copy that's up to date or whose newer releases can't be known.

With no decks yet, Home says to make or import them in Solid Memo.

The table starts in the order the user arranged the decks. A column's
name sorts by it, then the other way, then back to that order; the
sorted column says so (`aria-sort`). A figure not known yet sorts last,
either way. The filter keeps the decks whose name, in any language, or
whose groups' names hold its text, case and accents aside. The domain
does both ([deckTable.ts](../packages/domain/src/deckTable.ts)).

**Views.** Tabs above the table (a group named Views, the one shown
pressed) each keep the decks of one kind, and count them:

- All;
- Due today: cards due today, and those still counted, a loader
  meanwhile;
- Courses: copies of a course;
- Library copies: copies of a release, from the library or a link;
- Needs attention: invalid data, or cards that couldn't be read.

Each is a preset of Home's query
([`shell/views.ts`](../apps/studio/src/ui/shell/views.ts)): it sets
the view (`show`), and keeps the filter's text and the sort. No view
keeps decks by their problems or a newer release. After them come the
views the user saved, and **+ Save view** ([Layout](#layout)).

**Editing a deck in its row.** A deck that may be changed has its
direction, new cards per day and reviews per day edited in their cells
(Editing in a cell, under Layout): a choice of directions, or a whole
number. One left empty follows the instance's pace again. Each is saved
as the bulk edits save it, for that deck alone ("Set the pace of 1
deck.").

The table is a `DataTable` (Card workbench, below): **j** and **k**
move its cursor, **x** selects a deck, and **Enter** opens the deck's
about screen. Its **Columns** menu shows or hides each column but the
deck's name, as the device keeps. Every column shows until hidden. The
workbench and a draft's cards have the menu too, each table its own.

**The deck beside the table.** The deck at the table's cursor is in the
aside, named Deck
([`DeckPeekContainer`](../apps/studio/src/ui/DeckPeekContainer.tsx)):
its groups, its cards, today's due and new cards, when it last changed,
its health, and links to its tabs, from the table's own queries. A
`deck` the instance doesn't
have shows none; before the cursor has moved, the aside says how to
show one.

Decks are selected by their checkbox, or all those shown at once. The
selection's bar offers **Edit** (a menu of the first three below, each
asking how in a dialog), Export and Delete. A selected deck the filter
hides stays selected, but is left alone until it's shown again. The
selected decks shown can be:

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
([data-model.md](data-model.md#deck-groups)). A deck set aside can't be
selected, nor can any deck until the data check is done
([below](#data-set-aside)). While the arrangement is set aside, no deck
is moved into a group.

## Card workbench

The workbench
([`CardWorkbenchContainer`](../apps/studio/src/ui/CardWorkbenchContainer.tsx))
lists a deck's cards in a table, a row each. The columns are the front
(a link to the card), the back, when it's due, its interval and its
ease, its lapses ([below](#a-decks-schedule)), when it was added, and
its id. A retired card says so. A card studied both ways shows the
direction that needs the most work: the earliest due day, the shortest
interval and the lowest ease. A copy of a course says its cards are
the course's questions.

The URL holds the query, which the domain applies
([cardQuery.ts](../packages/domain/src/cardQuery.ts)):

- `q`: text to find, case and accents aside. A card in Markdown is
  searched as its plain text ([markdown.md](markdown.md)).
- `field`: where to look: the front, the back, the notes, the labels or
  the wrong options. Without it, all of them and the pictures'
  descriptions.
- `lang`: only text in this language (`sv` finds `sv-fi` too), or
  `unstated` for a side whose language isn't stated; with `q`, the text
  is looked for in that language only. The filter offers the cards'
  languages, and the URL's own.
- `state`: `live` (in use) or `retired`, or, for a card in use, where
  its schedule is. `new` has a direction never reviewed, and `learning`
  was answered wrong last time. `young` has an interval under 21 days
  and `mature` one of 21 or more (`MATURE_INTERVAL_DAYS`). `due` is due
  by today's study day, and `leech` has 4 lapses or more
  (`LEECH_LAPSES`). A card studied both ways is in a state when either
  direction is.
- `has`: a `picture`, `distractors` (wrong options), `markdown` or
  `notes`.
- `sort` and `order=desc`: by `id`, `created`, `front`, `back`, `due`,
  `interval`, `ease` or `lapses`, a column's name cycling as on Home. A
  side sorts by the text the table shows, as plain text: the deck's
  card language first when it has one
  ([i18n.md](i18n.md#which-language)), in the order of the UI's
  language. Case and accents count only where that language makes a
  letter of one (in Swedish, `ä` after `z`). Numbers sort by value. A
  card without the value
  (one never studied) comes last, either way.
- `page` and `size`: 10, 50 (the default) or 200 cards a page, with the
  same pager as Solid Memo's Browser. A change of the search or a
  filter goes back to the first page.

**Views.** Tabs above the filters (a group named Views) put the cards
in one state: All (none), Due, New and Leeches, the one the query is in
pressed, or none when its state is another. A view
keeps the rest of the query, from the first page. After them come the
views the user saved ([Layout](#layout)).

**Editing a card in its row.** A plain text card (not in Markdown) has
its front and back edited in their cells (Editing in a cell, under
Layout), a side only while its text is in one stated language. It's a
bulk edit of that card alone (`setText` in
[cardBulk.ts](../packages/domain/src/cardBulk.ts)), with **Undo**
([below](#bulk-edits)). A side left empty is refused; one unchanged
writes nothing. Other cards are edited in the
[inspector](#card-inspector).

The table is the Studio's `DataTable`
([`shell/DataTable.tsx`](../apps/studio/src/ui/shell/DataTable.tsx)).
Its first column (the checkboxes and the fronts) stays in sight as it
scrolls. Cards are selected by their checkbox, or a page's at once; a
click with Shift held selects, or not, every card from the one checked
last. The selection stays while the view changes. The keys are listed
under the selection's bar:

- **j** and **k** move the cursor between the rows (the focus goes to
  the row's front);
- **x** selects the row;
- **Shift+J** and **Shift+K** select on from where the selection was
  last made;
- **Escape** clears the selection;
- **Enter** opens the card;
- **F2** edits the row's front, or the cell the focus is in;
- **`.`** opens the bar's first menu.

The cursor's row is marked, as is each row selected. **j** and **k**
work wherever the focus is, from the cursor's row, or the first.
**x**, **Enter** and the Shift keys act on the row the focus is in, or
the cursor's with the focus on the page's body; Enter on a row's link
or button is the link's or the button's. The search and the filters
keep the keys while focused. The selection, the sort, the cursor and
the columns shown are worked out in
[`shell/tableModel.ts`](../apps/studio/src/ui/shell/tableModel.ts).

Home, the library copies, a draft's cards, the releases and a card's
answers are DataTables too, each with the keys and the marks it has
use for. The workbench's **Columns** menu shows or hides each column
but the first ([Home](#home)). A row that can't be
selected now (a deck set aside, a copy with nothing to upgrade) has
its checkbox disabled, or none, and a range or a page's checkbox
passes over it.

The lapses column counts each card's lapses, in either direction, in the
[answer log](data-model.md#the-answer-log): reviews graded below 3, but
not a first answer, an answer the same day after another, or a course
answer ([statistics.md](statistics.md#what-the-figures-count)). The
row of filters ends with how many cards the query keeps and the month
of the deck's first answer in the log ("since March 2025"). The
workbench reads the whole log once (`loadAnswerLog`). Meanwhile the
cards show without their lapses, and a query that needs them
(`state=leech`, `sort=lapses`) waits. When it
can't be read, the line says so, and such a query shows why.

A card opens in the card inspector, on a screen wider than 64rem beside
the workbench, which keeps its query, selection and Undo. The workbench
reads the cards and review states with Solid Memo's queries, and the
instance's preferences for today's study day. A test keeps a query over
5,000 cards linear: timed on the same machine, eight
times the cards take less than four times as long as an eighth of them
eight times over.

## Bulk edits

The selected cards the query keeps, on any page, are edited from the
selection's bar
([`CardBulkActions`](../apps/studio/src/ui/CardBulkActions.tsx)),
which groups the edits:

- **Edit**: Write in Markdown, Write as plain text, State language,
  Find and replace;
- **Schedule**: Set due date, Forget progress;
- **Move or copy**: Move to deck…, Copy to deck…;
- then Retire, Restore and Delete.

A selected card the query hides stays selected, but is left alone.
While the deck may not be changed, the bar has only Clear selection.
The edits are:

- **Retire** and **Restore**. A retired card keeps its review state.
- **Write in Markdown** and **Write as plain text**, which is written
  as `sm:plainText` ([markdown.md](markdown.md)).
- **State language** of the sides whose language isn't stated yet,
  both or one of them, the text unchanged.
- **Find and replace**
  ([`FindReplaceDialog`](../apps/studio/src/ui/FindReplaceDialog.tsx)):
  text as written (Markdown as its source), never a pattern. It looks
  in the fields checked (the front, the back, the notes, the labels,
  the wrong options and their notes), in one language or all, matching
  case and whole words when asked. A preview lists every text changed,
  before and after, and every card left as it is, and why. Nothing's
  written until the user confirms.
- **Delete**, with every SM-2 and FSRS-6 state of each card, read or
  not, once the user confirms. Another scheduler's state stays
  ([data-model.md](data-model.md#decks-and-cards)). Undone, the cards'
  SM-2 states come back, and FSRS-6 estimates its own from them at the
  next review.
- **Set due date** and **Forget progress**, of the cards' review states
  in every direction ([below](#review-state)), a card not studied yet
  staying new. These have no Undo, and a forget asks first.
- **Move to deck…** and **Copy to deck…**, to another deck of the
  instance ([below](#moving-and-copying-cards)), with no Undo.

The domain plans each edit
([cardBulk.ts](../packages/domain/src/cardBulk.ts), `planCardEdit`). A
card it would change must pass the card editor's validation
(`validateCardContent`), else it's left as it is, as is a card the
edit doesn't change, and one whose side or wrong option a replace
would leave empty. A note or a label left empty is removed, as in the
card editor. Text whose language isn't stated can't be changed before
its language is.

The use case `editCards` plans the edit again on the cards as they are
now, and writes it in one If-Match PUT of the cards document
([data-model.md](data-model.md#write-discipline)). Then it writes the
review states of deleted cards in one write of the reviews document,
then the deck's schedule in the digest. When the cards document
changed meanwhile, or was made since it was read as absent, it reads
it and plans again, three times in all. Once that plan isn't the one
the user previewed, it stops with "changed elsewhere", writing nothing. The
deck's catalog entry is untouched. The end-to-end tests hold this
against real servers, a change made by another app during the edit
included
([cardEdits.integration.test.ts](../e2e/pod/src/cardEdits.integration.test.ts)).

After an edit, the status line says what it did, and **Undo** undoes
it: `undoCardEdit` writes the plan's inverse the same way, the deleted
cards' review states included, only while the cards are as the edit
left them. The plan is kept in the page only, so Undo goes with the
next edit, another deck, or leaving the page.

No edit takes a backup first: Solid Memo keeps none
([migrations.md](migrations.md#the-backup)).
Undo can't bring back triples another app put on a deleted card or its
wrong options, or a second state of a card that was never read.

## Card inspector

The card inspector
([`CardInspectorContainer`](../apps/studio/src/ui/CardInspectorContainer.tsx))
shows one card of a deck, named in its heading, with a link to its page
in Solid Memo. On a screen wider than 64rem it's in the aside, beside
the deck's cards ([Layout](#layout)); below that it's the main content
alone. The card's row is marked (`aria-current`) and is the cursor's.
A card opened from the list takes the focus to its heading; closed,
the focus goes back to its row.

**Previous** and **Next** at its heading's end, or **k** and **j**,
show the card before it in the list, or the one after, each at its
page of the list, in the same tab, with no Back stop. At either end, or
for a card the query doesn't keep, there is none. A card opened from
elsewhere (the palette, a
deck's schedule, a link) puts the list at its page, replacing the
history entry.

Its four tabs are links, the one shown marked (`aria-current`):

- **Content**: Solid Memo's card editor (`CardContainer` in `ui`): the
  card as it's studied (small, its faces side by side), its sides,
  pictures, notes, labels and Markdown, Save, and Remove, which goes
  back to the deck's cards. Each save, and each change of the wrong
  options, is told to the [dock](#the-dock)'s activity.
- **Wrong options**, with their number
  ([`DistractorFields`](../packages/ui/src/ui/DistractorFields.tsx) in
  `ui`): each with its text, its note on why it's wrong, its id and
  how often a learner chose it (from the card's answers), to edit,
  retire, restore or delete.
  "Add a wrong option" writes a new one, in the back's language to
  start with. Each change is saved as it's made, as one write of the
  card (`updateCard`) naming each option with `sm:distractor` and
  `schema:suggestedAnswer` alike, and the status line says so. An
  option being written stays open
  until it's saved.
- **Schedule**: the card's review state in each direction the deck
  studies, and in one it no longer does while a state is kept there
  ([`CardScheduleContainer`](../apps/studio/src/ui/CardScheduleContainer.tsx)).
  - SM-2's state: when the card is due, its interval, ease and right
    answers in a row, and when it was first and last reviewed.
  - An FSRS-6 part follows when the instance's preferences name FSRS-6,
    or the card has an FSRS-6 state that way. It shows its due day, its
    stability (in days), its difficulty (1 to 10, to a tenth) and the
    chance of recalling it now (`recallNow` in
    [`fsrs.ts`](../packages/domain/src/fsrs.ts), at whole study days
    since the last review).
    A line says which of the two sets the due days.
  - While FSRS-6 sets them but the state is missing or stale
    ([srs.md](srs.md#fsrs-6)), it says the state is estimated from
    SM-2's at the next review, SM-2's due day counting until then.
  - An FSRS-6 state with no SM-2 state beside it isn't shown. A
    direction never studied says the card is new.
  - Each state can be given a due day, starting at the one that sets
    it, or forgotten, once the user confirms ([below](#review-state)).
- **History**: the card's answers in its deck, newest first
  ([`CardHistoryScreen`](../apps/studio/src/ui/CardHistoryScreen.tsx)).
  - Each shows when it was given, which way, its grade, how (recalled,
    or chosen among options in a course) and, for a wrong choice, the
    wrong option chosen, by its id once it's no longer on the card.
  - A column's name sorts the answers by it (but the wrong option's),
    then the other way, then newest first again. Beside the deck's
    cards, **j** and **k** stay the cards' table's.
  - A line counts the answers and the card's lapses, as the cards'
    table counts them
    ([statistics.md](statistics.md#what-the-figures-count)). An answer
    below grade 3 is marked forgotten, but
    only a scored review is a lapse.
  - The use case `cardAnswers` reads the deck's answers from the
    [answer log](data-model.md#the-answer-log) (`loadAnswerLog`), so a
    card moved in from another deck starts its history again
    ([below](#moving-and-copying-cards)). Answers
    given before a library upgrade count, named by the card's id.

The domain makes each change
([distractors.ts](../packages/domain/src/distractors.ts)):

- `addDistractor` creates one only once it has text, under
  `nextDistractorId`: `<card>-d<n>`, `n` one more than the highest such
  id the card or its release has used. An id the release published is
  never used again; one deleted before it was published may be.
- `editDistractor` changes its text and note, keeping its id and
  whether it's retired.
- `retireDistractor` and `restoreDistractor` mark it retired
  (`owl:deprecated true`, kept but never offered), or in use again.
- `deleteDistractor` removes it, once the user confirms, but only one
  the release the deck came from never published; one it did (a
  learner's history may name it) is refused, to be retired instead.
  While the release is read, every one counts as published.
- `distractorIssues` lists an option in use that isn't in exactly the
  back's languages, and fewer than two in use, as warnings in a pod's
  deck, never refusals.

In a copy of a library deck or a course, a card still as the release
has it warns that an edit detaches it. A newer release then no longer
updates it, but may retire it.
A card already changed says so
([migrations.md](migrations.md#catching-up-with-the-library)).

Solid Memo's own card page saves the wrong options with the card. Left
as they were, they follow the card as it's read afresh (a change in
the inspector meanwhile included), and its save doesn't state them, so
the card keeps its own.

While the deck is set aside, or the data check is under way, every tab
is shown but nothing in it can be changed ([below](#data-set-aside)).

**Edits not saved.** The content tab's card editor says while it holds
changes not saved. Leaving them by any link, key, Close, another tab,
Back and Forward, or a hash typed in, first asks, in a dialog
([`shell/ConfirmDialog.tsx`](../apps/studio/src/ui/shell/ConfirmDialog.tsx)).
The answers are
([`shell/unsavedEdits.tsx`](../apps/studio/src/ui/shell/unsavedEdits.tsx)):

- **Save** saves them, then goes on, unless the save failed or was
  refused, which the editor shows;
- **Discard** goes on without them, and a cell that stays on the page
  shows them no longer;
- **Stay**, Escape or Close goes nowhere.

A table's cell edited and not saved is asked about the same way,
beside a card's edits; Save saves them all, and goes on only once each
is saved.

Back or Forward is undone before the Studio's router hears of it, by
as many entries the other way (the router numbers them,
`historyPosition` in
[routerCore.ts](../packages/ui/src/ui/routerCore.ts)). It's done again
once the question is answered so, the entries after it kept for
Forward. A hash typed in is undone as Back is. A card's edits are
never saved unasked. Leaving the app (a
reload, closing the tab) is asked by the browser (`beforeunload`). The
edits are kept as the window crosses 64rem (`keep`, in `CardScreen`),
until another card or tab is shown.

Opened at a field (`field`, as the [health](#health) screen links to
one), the inspector puts the focus there: on the text, or on the wrong
option's Edit button (`data-arrival`, as `useScreenFocus` in `ui`
takes it). Another tab opens at none. It reads the cards and review
states with the workbench's and Solid Memo's queries.

## Review state

The domain makes both changes
([reviewStateEdits.ts](../packages/domain/src/reviewStateEdits.ts)):

- `resetStates` forgets cards, so the scheduler sees them as new: one
  direction in the inspector, every direction of the selected cards in
  the workbench. Every SM-2 and FSRS-6 state that way goes, read or
  not; another scheduler's stays.
- `rescheduleState` sets a state's due day, keeping its interval, ease
  and repetitions. It drops the state's snapshot for resetting the
  study day (`previous`, [srs.md](srs.md#resetting-the-day)), so that
  reset can't bring back a state from before the new due day. A day
  that's no date is refused. The card's FSRS-6 state, when it has one,
  is set due that day too, its snapshot dropped, so the day holds
  whichever scheduler sets the due days, now or after a switch.

The states are those Solid Memo reads
([data-model.md](data-model.md#decks-and-cards)), joined to their card
by `sm:reviewOf` and `sm:reviewDirection`, the fragment rule only where
a state leaves them out, so a state another app named its own way is
edited in place. Only `sm:sm2` and `sm:fsrs6` states are touched.

Neither touches the answer log. The use cases `resetCards` and
`rescheduleCards` write the change in one write of the reviews
document (none when no card has a state), then the deck's schedule in
the digest. The screens then read the review states afresh and drop
the deck's study queue. The end-to-end
tests hold both against real servers
([reviewStateEdits.integration.test.ts](../e2e/pod/src/reviewStateEdits.integration.test.ts)).

## Moving and copying cards

**Move to deck…** and **Copy to deck…** open a form
([`TransferCardsDialog`](../apps/studio/src/ui/TransferCardsDialog.tsx))
that offers the instance's other decks and **Keep their progress**,
checked to start with, and says what becomes of the cards' history. A
moved card leaves the selection.

The domain plans the transfer
([cardTransfer.ts](../packages/domain/src/cardTransfer.ts),
`planCardTransfer`):

- A card keeps its id when the target's cards document has no subject
  of it or its wrong options' ids. Else it gets the first free id of
  `<id>-2`, `<id>-3` and so on, its wrong options renumbered after it
  (`<new id>-d1`, `-d2`…). The status line says how many cards got a
  new id.
- A card keeps its content, its creation time and whether it's
  retired, and becomes the target deck's.
- Triples another app put on the card or its wrong options aren't
  copied, and a move removes them from the source with the card
  ([data-model.md](data-model.md#write-discipline)).
- With **Keep their progress**, the card's review states go with it,
  under its id in the target, their snapshot for resetting the study
  day included; without, the card starts as new there.
  - A state is found by the card its `sm:reviewOf` names, whatever its
    subject is called.
  - It's written in the target naming the card there (`sm:reviewOf`
    into the target's cards document), under the subject the fragment
    rule names, or a new `#review-<uuid>` when another's is there.
  - Its FSRS-6 state goes with its SM-2 state the same way; where the
    card has none, a state the target held at that prompt goes. One
    with no SM-2 state beside it isn't carried, only removed.
- A card written in the target names its wrong options with
  `sm:distractor` and `schema:suggestedAnswer` alike, each typed
  `sm:Distractor` and `schema:Answer`.
- A move then removes the cards from the source, with every SM-2 and
  FSRS-6 state they have, read or not. A copy leaves the source as it
  is. Another scheduler's states are never moved, copied or removed;
  they stay in the source, naming the card there.
- Past answers keep naming the source, so a moved card's history
  starts again in the target
  ([the answer log](data-model.md#the-answer-log)).

The use case `transferCards` writes the target first: its cards
document in one write, made only if it's still as read (If-Match),
then its reviews document. For a move, it then writes the source's
reviews document, and last its cards document, If-Match too. A
document changed meanwhile, or made since it was read as absent, has
the whole transfer planned again, three times in all, then it stops
with "changed elsewhere". Then the decks' schedules in the digest are
brought up to date, and both decks and the instance's counts read
afresh.

A move stopped half way (the target written, the source not, or only
its review states) leaves the cards in both decks, never in
neither, and making it again finishes it. The plan names the same ids
each time, and a card the target holds already under its id, saying
the same, isn't written again (its state there is kept). Two cards of
the source saying the same are never both found at one id. The
source's states go before its cards. The end-to-end tests hold this
against real servers, and include a move stopped before the source's
cards were written
([cardTransfer.integration.test.ts](../e2e/pod/src/cardTransfer.integration.test.ts)).

## A deck's schedule

A deck's schedule
([`DeckInsightContainer`](../apps/studio/src/ui/DeckInsightContainer.tsx))
shows its study to come. The domain computes it
([scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts),
[cardHistory.ts](../packages/domain/src/cardHistory.ts)), and the use
case `deckInsight` reads what it needs, writing nothing.

- **Tiles**: the reviews today and in the next 7 days, the cards
  studied (each way), and the leeches.
- **Reviews to come**, the next 30 days (`forecastOf`).
  - A day counts what falls due on it, and today what is due by today.
  - The reviews a day are capped by the deck's pace, else the
    instance's (`deckPreferences`), today's less what was reviewed
    today, the rest waiting for the next day.
  - The due days come from the deck's schedule in the
    [digest](data-model.md#the-digest) (`sm:dueOnDay`) while it's
    fresh (`freshSchedule`: the same versions, direction and day
    boundary); else from the review states, and the digest is brought
    up to date.
- **Intervals and eases**, as bars, with tables: how many cards, each
  way, have each interval (1 day, 2–3, 4–7, up to a year and more) and
  each ease (from 1.3, in steps of 0.2). Only cards in use count, in
  the directions the deck studies. The intervals are those of the
  scheduler that sets the due days. The ease is SM-2's, kept on every
  review, as the chart's note says.
- **Lapses and leeches.** A lapse is a review graded below 3, in the
  deck's answers in the [answer log](data-model.md#the-answer-log)
  (`lapseIndex`, by `isLapse`).
  - A card's first answer isn't a lapse, nor is an answer the same day
    after another to the same prompt, nor a course answer
    ([statistics.md](statistics.md#why-the-figures-changed)).
  - The screen names the month of the deck's first answer in the log.
  - A leech is a card in use with 4 lapses or more (`LEECH_LAPSES`,
    `leechesOf`), the most forgotten first. Each links to its card's
    history, and a link shows them all in the workbench
    (`state=leech&sort=lapses&order=desc`).
  - A test keeps `lapseIndex` linear over a year of answers: timed on
    the same machine, eight
    times the answers take less than four times as long as an eighth
    of them eight times over.

The charts are the statistics' own (`BarChart` and `StatTile` in `ui`).
A bar pointed at, tapped or reached with the arrow keys says what it
holds, and each chart has its figures as a table.

## A deck's about screen

The about screen
([`DeckAboutContainer`](../apps/studio/src/ui/DeckAboutContainer.tsx))
shows a deck's metadata and how it's studied, with a link to its page in
Solid Memo. Each part has its own form and status line:

- **Name**: the deck's name in every language it has, renamed as in
  Solid Memo's deck preferences (`renameDeck`).
- **About this deck**: its description, topics and keywords, with
  Solid Memo's own form (`DeckAboutSection` in `ui`, `describeDeck`).
- **Authors and license**: an author a line, `Name` or `Name <email>`,
  and a license chosen from those offered (`KNOWN_LICENSES` in
  [license.ts](../packages/domain/src/license.ts), each named as
  `licenseLabel` names it), a license another app wrote among them.
  The domain tidies and checks them
  ([deckProvenance.ts](../packages/domain/src/deckProvenance.ts)): two
  authors that would share one agent node are refused, the form
  staying. Nothing here
  says anyone reviewed the deck. `setDeckProvenance` writes again from
  a fresh read on a 412, three times in all.
- **Study**: its direction and its pace, a limit left empty following
  the instance's (`setDeckPace`, then `setDeckDirection` when that
  changed).
- **Languages**: its card sides whose language isn't stated, set as in
  Solid Memo (`DeckLanguagesSection` in `ui`).
- **Course progress**, for a copy of a course: its chapters in order,
  each done, open or locked. A chapter done can be marked not done, and
  the course restarted, once the user confirms. A chapter completed
  that the release no longer has is listed by its id, to mark not done
  too. Answers and review states stay (`setCompletedChapters`,
  [courses.md](courses.md#use-cases-and-ports)).

After a save the decks are read afresh, and the deck's study queue is
dropped.

## The instance

The instance's screen
([`InstanceAboutContainer`](../apps/studio/src/ui/InstanceAboutContainer.tsx))
shows where the instance is, links to its study preferences in Solid
Memo, and has two forms:

- **Name**: `renameInstance` writes it everywhere it's kept: the meta
  document, the catalog and the type index registrations
  ([data-model.md](data-model.md#the-catalog)), and the instances are
  read afresh. An empty name is refused.
- **Catalog**: its description, required, and its license, from the
  same list as a deck's (`describeCatalog`). Its publisher, the pod's
  owner, is shown, never edited. An instance without a catalog (one
  not updated yet) says so instead. The form starts again from each
  read of the catalog (a rename can change its description).

Both forms are held until the data check is done, and while the
catalog or a group is set aside ([below](#data-set-aside)).

The meta document and catalog writes pass the shape check; the type
index renames are If-Match writes only. Each write is made again from
a fresh read on a 412, three times in all. The
end-to-end tests hold these edits against real servers
([metadata.integration.test.ts](../e2e/pod/src/metadata.integration.test.ts)).

## Health

The health screen
([`HealthContainer`](../apps/studio/src/ui/HealthContainer.tsx)) shows
everything wrong with a deck, or with the instance, for every user.
"Check again" reads it all afresh.

A deck's health is the use case `checkDeck`
([deckHealth.ts](../packages/domain/src/deckHealth.ts)): a line counts
the problems, then come four parts:

- **Data check**: the [shape check](validation.md) of the deck's
  subjects in the catalog (its entry, its distribution and its
  authors' agent nodes), and of its cards and reviews documents
  (`deckReport`).
  - It runs as the check run when an instance is opened: a document
    still at the version the [digest](data-model.md#the-digest) says
    conformed isn't checked again.
  - Each result says what is wrong, in the shape's own words. It links
    to a card's field (`cardSpotOf`, by the result's predicate), a
    wrong option, a review state, or the deck's about screen (for its
    entry and its distribution).
  - Solid Memo's own [repairs](validation.md#repair) of these are
    offered, and a subject no repair covers can be removed once the
    user confirms.
- **Languages**: the card sides that state no language, of the cards
  the user may settle (`unstatedSides`, which, like
  [deckLanguages.ts](../packages/domain/src/deckLanguages.ts), leaves
  out a card still as its release has it). Each links to its side, and
  a link goes to the about screen, which states them all at once. When
  the release can't be read, it says those aren't known.
- **Cards that say the same** (`duplicateCardsOf`): cards in use with
  the same front and back, as plain text, in the same languages, and
  the same pictures. White space aside, case counts.
- **Markdown**: what the markdown package's check (`markdownProblems`)
  finds in the cards written in Markdown, field by field, by the card
  editor's hints ([markdown.md](markdown.md)), passed in by the screen
  (`deckTextCheck` in `ui`).

Above them, on a deck's health and the instance's, a deck whose
documents are unclaimed (they don't say they're the deck's, and are
outside the instance's own folder,
[data-model.md](data-model.md#where-an-instances-documents-are)) is
named with its documents' addresses (`UnclaimedDecksNotice`). "These
are this deck's documents" asks once more, then marks them as the
deck's (`claimDeckDocuments`), and the checks are read afresh. Until
then nothing in those documents changes.

The badge on [Home](#home) counts every violation (warnings aside),
side to settle, group of cards that say the same, and Markdown finding
(`healthProblemCount`).

While the deck is held (set aside, or the instance blocked:
[below](#data-set-aside)), every place is
named, not linked, and a line says why. The repairs and removals are
never held; a problem no repair covers is then removed here, or
corrected in the pod by other means.

What the deck's check finds (as its screen opens, after a repair, or
on "Check again") takes the place of what the instance's check found
of that deck (`withDeckReport`), in the same place in its list. That
result is what holds it. A deck mended is let go without a reload or a
check of the whole instance. A check overtaken by another
(one still running when a repair is made) is dropped.

The instance's health is the check run when it's opened
(`checkInstance`, the same query as Home's), with its repairs, then
every deck with its badge, a link to its own health, as is a result
about a deck. A badge checks its deck once, and what it finds holds its
deck too. A repair or a removal here reads every check of the instance
afresh (their queries are under its key); on a deck's health, only the
deck's, which is read afresh each time its screen opens. The end-to-end
tests hold `checkDeck` against real servers, the documents it checks
again and a removal that clears it included
([deckHealth.integration.test.ts](../e2e/pod/src/deckHealth.integration.test.ts)).

## Library copies

The library copies screen
([`LibraryCopiesContainer`](../apps/studio/src/ui/LibraryCopiesContainer.tsx))
lists the instance's decks copied from a release (they have
`prov:wasDerivedFrom`), from the library or added from a link. A row
shows the release it came from, the newest one out, and what upgrading
would change. The screen links to Solid Memo's deck library.

The use case `listLibraryUpdates` reads the instance's decks and the
library's index once
([library.ts](../packages/domain/src/library.ts), `libraryCopiesOf`). A
copy of the current release, or of one the index lists as no older, is
up to date (`offersNewerRelease`, as Solid Memo's offer tells it). A
copy whose deck the index no longer lists says so. A release the index
doesn't list is an unknown release.

For each copy with a newer release, the screen asks what upgrading
would do (`planLibraryUpgrade`, the plan Solid Memo's deck page offers;
[migrations.md](migrations.md#catching-up-with-the-library)), with the
copy and its series as found, reading nothing again. It says what the
upgrade does in Solid Memo's sentence, or that it has nothing for the
copy.

The table is a [`DataTable`](#card-workbench). The copy at the cursor is
in the aside (named Upgrade), with the rest of its plan: what history is
kept, the new releases' notes, and its cards. Those are added, changed,
retired, brought back, removed, left as the user has them, or given what
the release says they're about (`about`: every card of a release that
changes only that). That copy isn't in the URL: on
another screen and back, none is shown until the cursor moves.

The copies that can be upgraded are selected by their checkbox, or all
at once; a copy set aside can't be, nor any until the data check is
done ([below](#data-set-aside)). **Update 2 decks** (as many as are
selected), in the
selection's bar, upgrades them one after another with Solid Memo's own
upgrade (`applyLibraryUpgrade`), on the plan the user saw: a deck
changed since is refused.

- While it runs, the screen names the deck, "2 of 3", and its steps.
- Then a line for each deck says the release it's at now, or the step
  it failed at and whether the deck changed. One cut off part-way can
  be studied as it is, and updating it again finishes it
  ([migrations.md](migrations.md#how-an-upgrade-is-applied)).
- A failure is that deck's alone; the next is upgraded anyway.
- Everything an upgrade touched is read afresh, a failed deck changed
  in part among it, and a failed deck is planned again.
- Each upgrade reads the index once more, to plan again.

The end-to-end tests hold `listLibraryUpdates` and a batch of two
upgrades against real servers
([deckUpgrade.integration.test.ts](../e2e/pod/src/deckUpgrade.integration.test.ts)).

A copy whose series the index doesn't list is looked up as a copy of a
release added from a link
([deck-library.md](deck-library.md#from-a-link)). Its release is read,
and its row says "From \<host>".

- Its creator's catalog, found in the folders above the release and
  read as anyone reads it, lists the releases its instance published
  (`sm:publishedRelease`). The newest of the copy's series is its
  upgrade, planned and applied as a library copy's.
- Each release a catalog links is read once for all the copies, and
  none that the copy's own release lists.
- Before an upgrade is planned, the newer release and those in between
  are checked against the library's shapes; one that breaks them is
  refused (`releaseNotConforming`).
- When no public catalog of its creator lists the release (an
  instance's catalog is private unless its owner shares it), the row
  says "Not known: no public catalog of its creator lists it".
- A copy whose release can't be read either shows as no longer in the
  library.

## Import and export

Import and export
([`TransferContainer`](../apps/studio/src/ui/TransferContainer.tsx))
saves decks as files and makes decks of files: Turtle or JSON-LD, one
deck to a file ([data-model.md](data-model.md#decks-as-files)).

**Export** lists the instance's decks, as they're arranged, those in
the URL checked. The user picks the format and whether their progress
goes too: the cards' review states and a course's completed chapters.
**Export** saves each deck as a file of its own, named after its title
(`capitals.ttl`), one after another, the screen naming the deck it's
at. Export writes nothing to the pod. The use case `exportDeckFile`
reads the deck's documents (`DeckArchive.exportDeck`) and hands the
text to the browser to save (`FileExchange.save`).

Browsers ask before a page's second download, and save none of the
rest on a no. The app can't tell, so after several decks the screen
says how many it handed the browser, and that the browser may ask.

**Import** asks for a file (`openDeckFile`, `FileExchange.open`): a
`.ttl`, `.jsonld` or `.json` file, its format by its name, else by its
text. The screen then says what the file holds: its deck, its cards,
its progress, how many parts are brought up from an older format, and
how many can't be read and are left out. A
file in a newer format than the app reads is refused (as
`deckFileTooNew`, not `writtenByNewerApp`, since nothing is saved
over), as is one without exactly one deck, or one that doesn't parse.

**Import into** the instance (`importDeckFile`) makes a new deck of
it, with its progress when the file has some and the user leaves it
checked. Its cards document goes first, only if none is at its URL
yet, then its review states, then its entry in the catalog, so the
deck shows only once it's whole. A cards document left behind by an
import cut off makes the deck take a fresh id, once. Then the deck's
schedule in the digest is brought up to date, the screen links to the
deck's cards, and the instance's decks are read afresh.

The deck is written as any deck Solid Memo writes: wrong options named
with `sm:distractor` and `schema:suggestedAnswer`, states naming their
card in the new deck. The instance's type-index registrations of its
decks, cards and review states cover it (`data-model.md`). While the data
check is under way, or the catalog is set aside, the import is held
([below](#data-set-aside)); a file can still be read.

Each write passes the shape check. Turtle and JSON-LD go through the
Solid client library, behind `client/resources.ts`, and files through the browser's own `Blob` and
file input: no new library
([boundaries.md](boundaries.md#files-without-a-vendor-library)). Unit
tests take a deck with Markdown, pictures, wrong options (one retired),
text in two languages, a retired card and review states through both
formats and back
([solidDeckArchive.test.ts](../packages/solid/src/solidDeckArchive.test.ts)),
and the end-to-end tests against real servers
([deckFiles.integration.test.ts](../e2e/pod/src/deckFiles.integration.test.ts)).

## Drafts

A creator writes a deck or a course as a **draft** of a release, in the
instance, before publishing it. The drafts screen
([`DraftsContainer`](../apps/studio/src/ui/DraftsContainer.tsx)) lists
the instance's drafts, each with its kind (deck or course), the version
it drafts and whether it's being written, was released, or can't be
read. One is deleted, with its documents, once the user confirms. A
draft is private, in the private type index alone
([data-model.md](data-model.md#drafts-and-releases)).

Each draft that can be read links to its [overview](#a-drafts-overview),
where a draft made opens, the [activity](#the-dock) saying so. A draft
of a deck copied from a release stays on this screen instead (below).

A new draft starts from

- **a blank deck or a blank course**, by its name in a language the
  user states: version 1 of a series of its own, with its Turtle
  distribution and the data theme EDUC. A course is studied front to
  back.
- **a deck of the instance** (`deckToDraft` in
  [deckToDraft.ts](../packages/domain/src/release/deckToDraft.ts)).
  - The draft takes every card under its id, its retired ones and
    wrong options with it, its authors as the release's agents, the
    first as its publisher, its themes and EDUC.
  - The learner's own is left behind: where its documents are, its
    study caps, its card language, its place among the groups, a
    course's progress.
  - A deck copied from a release names it (`prov:wasDerivedFrom`),
    which is no source of the new release. The screen says the deck is
    based on it, and offers to start the next version of that release
    instead, which keeps what its learners studied.
- **the next version of a release**, by its address, in the library or
  in a pod (`nextVersionDraft` in
  [releaseVersion.ts](../packages/domain/src/release/releaseVersion.ts)).
  - The draft is the release whole, as version N + 1 in its series,
    with no release time or notes yet. What it published can only be
    retired, never deleted or its id given to another, and its
    activities are kept.
  - A series and publisher the release names in another document (a
    library's index) are read from it, as no one. The draft describes
    them: the series by what an index says of one, a publisher by its
    class and name only. A document that can't be read gives nothing,
    and the release check says what the draft lacks.
- **a release saved as a file**, Turtle or JSON-LD, as it is
  (`releaseToDraft` in
  [releaseToDraft.ts](../packages/domain/src/release/releaseToDraft.ts)).

A release is made a draft only if its version is 1, 2, … and every id
in it has letters A to Z, digits, `.`, `_` and `-`, starting with a
letter or digit (`unsupportedIdOf`). A chapter's document is named
after its id. Else it's refused (`releaseIdUnsupported`). A draft
whose documents (perhaps written by another app) name a subject by
another id isn't opened, and no change gives a draft one
(`draftIdUnsupported`). Either is refused with nothing written.

A draft is named after its title, or its release's name, unlike the
instance's other drafts of that version. Only a draft's place taken
meanwhile (its release document made there first) gives it the next
name. Any other failure, such as the catalog's link refused on 412 a
few times, takes back what was written and is thrown, so no draft is
left that the catalog doesn't link.

The use cases are `listReleaseDrafts`, `createReleaseDraft`,
`copyReleaseDraft` (a guest's draft, as the guest's study is added to
an instance, [guest-mode.md](guest-mode.md#adding-to-an-instance)),
`getReleaseDraft`, `editReleaseDraft` and `deleteReleaseDraft`
([releaseDrafts.ts](../packages/application/src/releaseDrafts.ts)),
over the `ReleaseDraftRepository` port.

- When a document changed elsewhere meanwhile, the changes are made
  again on the draft as it is now. If they're then refused because
  part of them was written before (a chapter they add is there), what
  they changed is kept where nothing else changed it (`mergedDraft`).
- What a release before a draft published is read from that release
  (`dcat:prev`), once. While it can't be read, everything the draft has
  counts as published.
- A release that isn't in the library is read as no one, so its server
  learns nothing of who opens the draft. One in the user's own pod (a
  storage of theirs, or an instance they registered) is read as the
  user, since a release the pod wouldn't share is its owner's alone.
  A redirect from there isn't followed, as none is with the user's
  credentials ([authentication.md](authentication.md#authenticated-requests)).
- Making or deleting a draft is held until the data check is done, and
  while the catalog is set aside ([below](#data-set-aside)).
- A draft made with a deleted draft's name has its URL, so what the
  screens read of a draft is forgotten when one is deleted or made.

A draft changes by `DraftChange`s
([releaseDraft.ts](../packages/domain/src/release/releaseDraft.ts),
`UseCases.editReleaseDraft`), covering:

- the release's metadata and its agents;
- its chapters and steps: added, edited, moved, retired, restored or
  deleted, the chapters and steps in use numbered 0, 1, … again;
- cards and their wrong options, and where a question is asked;
- its sources, and the checks it had.

A change is refused, writing nothing, for:

- deleting what an earlier release published (it's retired instead);
- giving an id that's another subject's or was an earlier release's;
- asking a card from a second place;
- a course not studied front to back;
- rewriting how an earlier release was made, or what an activity
  carried from one states (removing an agent it names, say).

A check informs, and a source is used by, the draft's own activity
that generated the release. A next version, generated only by
activities carried over, is given one when it first needs it,
`#revision-<N>`. A check is recorded only as a machine's or an AI's,
in words that say it was no human review ("Scope: …; an AI check, not
a human review."). The release screen makes these changes
([below](#the-releases-metadata-and-provenance)). A creator names the
ids, the way [courses.md](courses.md#writing-a-course) says.

## Writing a draft

A draft is written in six screens: its overview, a chapter, a step, a
question, its cards, and its release metadata and provenance. They
share the draft as one query, read once (`getReleaseDraft`), and change
it by `DraftChange`s. Four more read it: its release check, its
listing preview, its trial, and its comparison with the release it
follows.

### How edits are saved

Every edit is made at once on the screen, then written in the pod
(`editReleaseDraft`), by the editor's hook
([draftEditor.ts](../apps/studio/src/ui/draftEditor.ts),
`useDraftEditor`):

- **Optimistic.** The draft on screen has the change made. A change
  the draft refuses (an id taken, say) isn't made, and the screen says
  why.
- **Debounced per document.** Text is written once its document
  (`changedDocuments` in
  [draftLayout.ts](../packages/domain/src/release/draftLayout.ts)) has
  been still for 0.8 seconds (`DEBOUNCE_MS`). Changes typed in that
  time are written together. A change of several documents (a move,
  say) is written at once. What waits is the draft's, not an editor's:
  the screen's editor and the outline share it. Leaving the screen, or an
  edit that isn't typing, such as a move in the outline, writes what
  waits first. No write's draft is put on the screen while typing
  waits that it doesn't hold.
- **Queued per draft.** The writes of a draft wait for one another, in
  one mutation scope, whatever their documents and screens. Each reads
  the draft after the writes before it, and only the last one's draft
  is put on the screen.
- **Said.** A status line, and the status bar on any of the draft's
  screens ([above](#layout)), says "Saving…" while a change waits or is
  written, then "All changes saved.". A write that fails, or that the
  draft as it now is refuses, says why; once the writes after it are
  done, the draft is read afresh from the pod.

A draft released is frozen, its next version started from the drafts,
its release screen or the releases ([below](#publishing-a-release)).
Nothing is changed either while the instance's data check is under
way, or blocks the instance ([below](#data-set-aside)).

### A draft's overview

The overview
([`DraftOverviewContainer`](../apps/studio/src/ui/DraftOverviewContainer.tsx))
names the draft, its kind and version, and edits its title and
description. For a course, it shows the outline, adds a chapter (its
title, and its id), and lists the chapters retired, to restore. It
counts the draft's cards, with a link to their table (a deck's cards
are added here), and the problems the release check finds (for a pod,
the shapes left out).

### The outline

The outline ([`DraftOutline`](../apps/studio/src/ui/DraftOutline.tsx),
a list named Outline) is a course's chapters in their order, each with
its steps ("Step 1.2"), each step with the questions that check it, in
the order of their ids, each linked to its editor. Chapters and steps
are arranged as the deck list's groups and decks are, with the same
code in `ui`:

- **Drag** (`deckTree/useDragReorder.ts`): a chapter among the
  chapters, a step anywhere in a chapter, or into a chapter by its
  header. The outline's rules (`OUTLINE_RULES`, `DropRules` in
  `deckTree/dropZones.ts`) keep a chapter at the top and a step in a
  chapter, and make no new group of two.
- **The row's menu** (`MoveItems`): up, down, and, for a step, to
  another chapter. It retires the chapter or step too, or deletes one
  no release published, once the user confirms.

Each move is a `moveChapter` or `moveStep` change (`outlineMove` in
[draftOutline.ts](../packages/domain/src/release/draftOutline.ts)). A
drop the draft no longer has a place for (it changed under the drag)
comes to nothing, and says so.

A chapter, step or question the release check finds problems in has a
badge beside it ("2 problems"), a link to the check.

On a course draft's other screens the outline is in the aside
([`OutlineAside`](../apps/studio/src/ui/OutlineAside.tsx),
[above](#layout)), where it navigates and arranges too. The one the
page shown edits is marked (`aria-current="page"`; `currentOutlineKey`
in
[`shell/workspaceLayout.ts`](../apps/studio/src/ui/shell/workspaceLayout.ts)),
and each badge links to where its first problem is fixed, as the
check's links do (`targetRoute`). The overview keeps the outline in its
main content, with its new chapter and its retired ones, and has no
aside.

### A chapter

A chapter's screen
([`ChapterEditorContainer`](../apps/studio/src/ui/ChapterEditorContainer.tsx))
edits its title, always plain text, and its description, with "Format
with Markdown" (`sm:textFormat` of the chapter). A preview shows it as
the course's screen does, beside the field on a screen 80rem wide or
more, else under it. The screen orders the chapter's steps, up or
down, adds one, and restores one retired. It lists the questions asked
only in the chapter's final review, and adds one.

### A step

A step's screen
([`StepEditorContainer`](../apps/studio/src/ui/StepEditorContainer.tsx))
edits its theory, in each language it has, with "Format with Markdown"
(`sm:textFormat` of the step). In Markdown, each text is hinted at
where it wouldn't show as meant, by the rules of prose (`PROSE`,
[markdown.md](markdown.md)). A preview, beside it on a screen 80rem
wide or more, else under it, shows the theory as the course player
does (`ProseField` in `ui`, with the player's `DataProse`). The screen
lists the questions that check the step, and adds one: its front and
back, its id, and the question it's asked before, if not after the
last.

### A question

A question's screen
([`QuestionEditorContainer`](../apps/studio/src/ui/QuestionEditorContainer.tsx))
says where the card is asked: a step, a chapter's final review, or
nowhere yet; choosing another moves it there (`moveQuestion`). Its
content is Solid Memo's card editor (`CardContentFields`), saved by
Save; its wrong options are the inspector's (`DistractorFields`, each
change saved as it's made: `distractorChanges`). A preview asks
the card as the course does (`CourseQuestion`, with `MultipleChoice`),
as typed, to answer and ask again: beside the form and in sight as it
scrolls on a screen 80rem wide or more, else under it.

### A draft's cards

A draft's cards
([`DraftCardsContainer`](../apps/studio/src/ui/DraftCardsContainer.tsx))
are a table, a row each, by id: its front (a link to its editor), its
back, where it's asked, its wrong options in use, and its id. The URL
holds the view ([above](#routes)).

- The filters keep the cards asked nowhere (in a course), asked from
  two places, with fewer than two wrong options in use, or retired.
- The language keeps those with text in it on their front or back.
- A column's name sorts by it, then the other way, then by id again,
  from the first page. A page holds 50.

The table is a [`DataTable`](#card-workbench). **Retire 2 cards** or
**Restore 1 card**, in the selection's bar, retires or restores those
selected the filter keeps, in one edit. Nothing is selected while the
draft may not be changed. **Enter** opens a card's editor. A new card
is added under the table, asked nowhere yet.

### Ids

The id assistant
([courseIds.ts](../packages/domain/src/release/courseIds.ts)) suggests
each new subject's id, the way [courses.md](courses.md#writing-a-course)
names them:

- `ch-<title>` for a chapter;
- `<chapter>-<n>` for a step;
- `q-<topic>-<n><letter>` for a step's question, sorting after its
  last;
- `q-<topic>-r<nn>` for a review question.

The user may write another. The field says at once when an id is none
a subject can have, or one the draft or a release before it has. A new
question's id sorts after the step's last; past `z`, it's the last's
id with a number after it.

A new question may instead be asked before one already asked ("Ask
it", `questionIdBefore`). Its id then sorts between that one and the
one before it: a free letter when there is one, else an id from
`idBetween`. Before the first, the place's own name (`q-<topic>-<n>`,
`q-<topic>-r00`) is the lower end. When no id sorts there, the form
says so, and the user writes one. An id the user writes is asked where
it sorts, and the form says when that isn't where "Ask it" says.

`idBetween` finds a free id that sorts between two others, by code
unit: a number after the first when one fits, else one made code unit
by code unit. A seeded property test checks that it keeps the order
and never gives an id taken.

Nothing an earlier release published is deleted, a wrong option among
it: its Delete is held, and the screen offers to retire it instead.

## The release check

The release check
([`ReleaseCheckContainer`](../apps/studio/src/ui/ReleaseCheckContainer.tsx))
runs every rule a release is held to on the draft, as the release it
becomes: the rules `npm run library:check` runs on `decks/`
([deck-library.md](deck-library.md)), from the domain's
([`release/`](../packages/domain/src/release/)). The use case is
`checkReleaseDraft(draft, markdownCheck, policy)`. It finds:

- **Rules** (`ruleProblems` in
  [releaseCheck.ts](../packages/domain/src/release/releaseCheck.ts)):
  - the course's (`courseProblems`);
  - what a release needs that a draft may lack (`readinessProblems`): a
    title and a description with English text, a publisher, a version,
    a series, a distribution, the theme EDUC, and each chapter's and
    step's fields the draft shapes relax;
  - the policy's curation (`curationProblems`);
  - how the release says it was made (`provenanceProblems`,
    [below](#what-the-check-asks-of-a-releases-provenance)).
- **Library** (the library policy only): the draft's name, version and
  metadata against its place in the library's live index
  (`readLibraryIndex`, `libraryProblems`).
- **Drops**: against the release it follows, when there is one
  (`continuityProblems`): nothing dropped, no id given to another kind
  of subject, and its version the next.
- **Markdown**: its text formats, its text in Markdown, and how a
  step's theory is split into chunks: none empty, and as many in each
  language (`markdownProblems`, [markdown.md](markdown.md#chunks)). The
  screen passes the markdown package's check in
  (`releaseMarkdownCheck` in `ui`, its `problems` and `chunks`). It
  keeps the problems of every text it has checked, by field rule, and
  the chunks of every theory, so a changed draft's check reads only
  the text that changed.
- **Shapes**, when asked: the release as it's assembled, moved to its
  address (`mapIris`). Each subject is checked against its library
  shape (`LibraryDeckV6` for the release), and the whole against
  DCAT-AP and SKOS with the reference data
  (`ShapeValidator.validateRelease`).
  - For the library, its index is beside it, with the release's series
    in it (described from the release when the index doesn't list it
    yet).
  - In a pod nothing else is read: a publisher or series the release
    doesn't describe fails DCAT-AP's class check
    ([validation.md](validation.md)).
  - A button runs them on the draft as it is then; once it changes, or
    they fail, they offer to check again.

The library's index, or the release the draft follows, that can't be
read is a problem of its own (`libraryUnread`, `previousUnread`), and
the rest of the check stands. Such a check isn't kept: the screen
checks again when it's opened again, when its window is focused, or by
its button, as after a check that failed.

The draft checked is the editor's, changes not yet written included,
each version once; the release a draft follows is read once.

The policy is a pod's by default, its data's rules only.
`policy=library` adds the Solid Memo library's curation (`repoPolicy`)
and its place among the library's decks. The curation asks:

- a title, description and keywords in every language the app speaks;
- each picture on a card described in English and the card's other
  languages;
- the theme EDUC;
- the library's contact in place of an email, as `npm run library:check`
  asks of a new version ([deck-library.md](deck-library.md#contact)).

Neither policy names a series, author or host: a library is its index,
and a policy is data.

Problems are codes, never text
([problems.ts](../packages/domain/src/release/problems.ts)), worded in
the reader's language (`studio.problem.<code>`,
[problemText.ts](../apps/studio/src/ui/problemText.ts)). They're listed
by severity, then by what they're in, in two lists, Errors and
Warnings. Each subject links to its editor, and each problem to its
field there (`problemTarget`), focused; a wrong option's problem opens
its question at it, and counts under it in the outline's badges.

Not every problem can be fixed in the Studio yet, so a new draft's
problem count may not reach zero:

- No screen has a field yet for the version, the series (`inSeries`,
  `isVersionOf`) or the distribution. A blank draft and a deck's have
  them all, so only a draft of a release that lacks one has this
  problem. It links to the overview. A problem about the release's
  license, contact, publisher, languages, themes, version notes or
  authors, a source, an
  agent or an activity links to the [release
  screen](#the-releases-metadata-and-provenance), at its part.
- The library policy places the draft at `decks/<draft name>/v<N>.ttl`
  and reports each link that differs from that place, so a draft that
  follows a release in a pod has a `linkMismatch` for that release, its
  series and its publisher. It reports a draft that states no license
  too (`noLicense`, a library rule:
  [deck-library.md](deck-library.md#checks)), linked to the release
  screen's license field.
- A version the library's index lists already shows up as a
  `versionGap`, with that version twice.

## The listing preview

The listing preview
([`ListingPreviewContainer`](../apps/studio/src/ui/ListingPreviewContainer.tsx))
shows the draft as learners see it in the library: its row in the
library's list (`LibraryDeckRow`) and its own page
(`LibraryDeckScreen`). They're over a library deck built from the
draft alone (`draftLibraryDeck` in
[draftListing.ts](../packages/domain/src/release/draftListing.ts)).
Both are inert: nothing in them to follow or press.

## The trial

The trial ([`TrialContainer`](../apps/studio/src/ui/TrialContainer.tsx)),
the draft's Trial tab, plays the draft as learners play the release it
becomes: a course with Solid Memo's own course screens (its page, a
chapter's steps, its final review), a deck with Solid Memo's study.

It's played in a sandbox, set up by `openTrial(draft, instanceUrl)`
with `startTrial`, both in
[trial.ts](../packages/application/src/trial.ts):

- **A pod of its own.** Each trial has a new pod, kept in memory, at
  `https://trial.solid-memo.invalid/` (`TRIAL_ORIGIN` in
  [release/trial.ts](../packages/domain/src/release/trial.ts)), which
  never resolves. `createTrialUseCases`
  ([trialUseCases.ts](../packages/composition/src/trialUseCases.ts))
  wires the page's own Solid adapters over it (`routedFetch`). Other
  requests go to the page's pods through a fence that refuses every
  method but GET and HEAD (`readOnlyFetch`).
- **Only what a trial plays.** The trial composes only the slices of
  the use cases it supports (`TrialUseCases` in `trial.ts`): its
  instance, its preferences, the course or the deck it plays, the
  library's upgrade and study.
  - It has no login, guest, drafts or statistics.
  - It keeps none of the device's language, theme, palette or text size
    (a "none" of its own, `NO_DEVICE`).
  - A mistake in the draft is reported nowhere (`reportPlace` has the
    trial's own answer).
- **The draft as a library.** The trial's library is the draft alone,
  as the editor keeps it, made afresh at each read
  (`createDraftDeckLibrary` in
  [draftDeckLibrary.ts](../packages/solid/src/draftDeckLibrary.ts)),
  its cards and a course's outline read as a release's are, its
  metadata the listing preview's (`draftLibraryDeck`).
- **The same shapes.** Its writes are checked by the page's validator,
  over the trial's pod (`over`), the shapes loaded once.
- **Set up as a guest's.** The trial's pod is started as a guest's is
  (a profile, then an instance with its meta document and its catalog),
  with new preferences but for the user's answer scale and the hour the
  day rolls over. Then the draft is started as a course
  (`startCourse`), or imported as a deck.

A draft that can't be played is refused, with what blocks it
(`trialProblems`), each a link to its field: the course's rules, and
what the player needs of a release (its title, and each chapter's and
step's fields). The release's publisher,
version, series, distribution and theme don't block it.

The course's screens link to the trial's routes, by `CourseLinks` in
`ui` ([courseLinks.ts](../packages/ui/src/ui/courseLinks.ts)), which
is Solid Memo's course routes unless a provider says otherwise. Each
trial has its own query client too.

Its controls (`TrialControls`):

- **Open a chapter**, as a learner who completed every chapter before
  it (the course restarted, then each one before it completed), the
  answers given kept.
- **Answer all right, or all wrong**: every question of the chapter in
  view, or of the one to take next (its steps', then its review's), a
  wrong answer its first wrong option. A chapter answered right is
  completed. For a deck, every card to study now.
- **Days ahead**: the trial's clock (`Clock` in `ui`) moved ahead by a
  number of days.
- **Start over**: a new pod and a new query client, for the same draft.
- **Reload the draft**: the draft read afresh from the pod, then a new
  trial of it.

After each control, what is shown is read again. Leaving the trial's
screen, or reloading the page, forgets it.

## The release diff

The release diff
([`ReleaseDiffContainer`](../apps/studio/src/ui/ReleaseDiffContainer.tsx)),
the draft's Changes tab, compares a draft with the release it follows
(its `dcat:prev`). A draft of a first version follows none, and the
screen (still at its address) says so. The use case is
`diffReleaseDraft(draft)`
([releaseDrafts.ts](../packages/application/src/releaseDrafts.ts)),
which reads the release once and fails when it can't be read. It
shows:

- **Rules of the series**: the check's drops (`continuityProblems`).
- **What it says of itself**: which of its title, description,
  keywords, themes, study direction, license, authors, languages and
  sources changed, and whether it became a course or a deck
  (`releaseDiff` in
  [releaseDiff.ts](../packages/domain/src/release/releaseDiff.ts)).
- **Its content**: each chapter, step, card and wrong option the draft
  adds, changes, retires or brings back, matched by id, a link each to
  its editor, and how many of each kind are as they were.
  - A card compares as an upgrade compares it (`sameContent` in
    [libraryUpgrade.ts](../packages/domain/src/libraryUpgrade.ts)),
    and by what it's about (its `dcterms:subject`, in any order:
    `sameSubjects`), its wrong options listed on their own.
  - A card a release states in a format before card format 7 (a
    format-4 card compiled from linked data, say) is read with what
    it's about too, kept in the card's record. It's compared, and
    written once, as card format 7 writes it (`draftFromQuads` in
    [releaseDraftMapper.ts](../packages/solid/src/mappers/releaseDraftMapper.ts)).
  - A subject retired and changed says both.
- **What learners get** (`simulateLearnerUpgrade`): Solid Memo's own
  upgrade plan (`planLibraryUpgrade`) for a learner's copy of the
  release, as an import makes it, the learner having changed nothing.
  - A course's learner has reached every question and completed every
    chapter.
  - The sentence is Solid Memo's update offer's, but a plan that
    changes only retired cards says "updates only retired cards".
  - Then comes the progress learners would lose: the history of the
    cards the draft drops, and, of a course, the completion of the
    chapters it drops, found by id, whatever the draft's version. A
    draft that retires what it no
    longer uses loses nothing.
  - A draft whose version doesn't come after the release's offers
    learners nothing.

The learner's copy is built in memory from the release and the draft
(`draftLibraryContent` in
[draftListing.ts](../packages/domain/src/release/draftListing.ts)),
reading and writing nothing. Each version of the draft is compared once,
as the editor keeps it, changes not yet written included.

## The release's metadata and provenance

The release screen
([`ReleaseMetadataContainer`](../apps/studio/src/ui/ReleaseMetadataContainer.tsx)),
the draft's Release tab, edits the release's metadata beyond its
listing, who made it and how, and what it was made from, written as
the library's releases are
([deck-library.md](deck-library.md#provenance)). Each change is a
`DraftChange`, saved as the other screens save theirs
([above](#how-edits-are-saved)). Its parts:

- **About this version**: the version notes (`adms:versionNotes`, one
  text), the languages (`dcterms:language`), the themes (`dcat:theme`),
  the license, the contact and the publisher.
  - The languages are those of the EU's table (`EU_LANGUAGES`,
    generated from [external.ttl](../ns/vocab/external.ttl):
    [vocab.md](vocab.md)), each named in the reader's language; one
    outside it is shown by its IRI, to keep or leave out.
  - The themes are in groups: the EU's data theme EDUC; Solid Memo's
    optional topics (`TOPICS`, from [topics.ttl](../ns/vocab/topics.ttl)),
    named in the reader's language, each narrower one under its broader
    one; and any other, by its IRI, to keep or leave out.
  - The license is one of `KNOWN_LICENSES`
    ([license.ts](../packages/domain/src/license.ts)), or the one it
    has. `setLicense` types it `dcterms:LicenseDocument`, as DCAT-AP
    asks; the license it replaces loses that type, unless a source
    still names it.
  - The contact is a web page where readers ask about the release or
    report a mistake in it, such as an issue tracker (`setContact`):
    the release's one `dcat:contactPoint`, `#contact`, a `vcard:Kind`
    with that `vcard:hasURL` ([deck-library.md](deck-library.md#contact)).
    It's saved once it's an http(s) address, and the contact it
    replaces goes with what it stated. **Use the library's contact**
    fills in `LIBRARY_CONTACT`
    ([curationRules.ts](../packages/domain/src/release/curationRules.ts)).
    The app reads it to say where a mistake is reported
    ([deck-library.md](deck-library.md#reporting-a-mistake)).
  - The publisher is one of the release's agents, or the one it names
    elsewhere.
- **Authors**: the release's own agents (`foaf:Agent`, `#<name>`), its
  `dcterms:creator`s, each with a name and an optional email
  ([releaseMetadata.ts](../packages/domain/src/release/releaseMetadata.ts)).
  A release in a pod may name an email; one for the library names
  none. Removing an author removes its
  agent too, unless it publishes the release or a statement names it.
  Authors another document describes are kept as they are.
- **How it was made**: the attribution, and notes.
  - The attribution is "Compiled by <the authors' names>", with or
    without "with the help of AI", in English and Swedish ("Sammanställd
    av …"): two `rdfs:comment`s of the release's own making
    (`setAttribution`). It needs an author to name, and is written
    again whenever the authors change.
  - Only a comment worded exactly so, for the authors the release
    names, is read as the attribution: a note starting "Compiled by
    hand…" stays a note.
  - Nothing here can say that anyone reviewed the release.
  - The notes are the making's other comments: each paragraph one
    comment, in its language (`setMakingNotes`).
  - A release that names no making is given one, `#compilation`, when
    it first needs it; a next version gets its own `#revision-<N>`.
- **Sources**: each by its address, shown as text and never opened,
  with its title, its creator (as text), its license, and the evidence
  for that license (a comment that quotes or describes it).
  - Each says whether the release is derived from it
    (`prov:wasDerivedFrom`) and whether this version's making used it
    (`prov:used`), at least one, else the change is refused
    (`unusedSource`). Only one an earlier version's making used may be
    neither; it says so and can't be removed.
  - A release that names no making is given `#compilation` for a
    source it used. What else the draft states of a source is kept.
  - Its license is an `http:` or `https:` address, not a name such as
    "CC BY 4.0" (`sourceLicenseValid`); one it states already is kept.
  - Removing a source takes away this version's mentions of it; what
    it states stays while an earlier version's making uses it.
  - Deleting an activity of this version takes with it what the draft
    states of a source only that activity used.
  - Only the source being edited has a form.
  - A new source is an `http:` or `https:` address the release doesn't
    name yet.
- **Checks**: each check this version had, by a machine or by AI, with
  what it looked at, its scope, its outcome, the day it ended and its
  language. It's recorded in words that say it was no human review
  (`checkActivityTriples`). An activity written otherwise can be
  deleted, not edited (`readCheckActivity` reads only what the Studio
  writes). Those carried from earlier versions are listed apart, and
  never changed.

### What the check asks of a release's provenance

The release check warns of what a reader of how the release was made
would miss (`provenanceProblems` in
[provenanceRules.ts](../packages/domain/src/release/provenanceRules.ts)),
each a warning that links to the release screen:

- **A source that doesn't describe itself** (`sourceUndescribed`): it
  states no title, no creator, or neither a license nor a comment with
  the evidence for one.
- **A source used, not derived from** (`usedNotDerived`): this
  version's own making used it, but the release doesn't say it's
  derived from it. An earlier version's making isn't held to this.
- **A count that disagrees** (`countDisagrees`): a comment of the
  release's own making states how many chapters, steps, sources (or
  documents) or cards it has, in English or Swedish, and the release
  has another number. Chapters and steps count only in a course, and
  cards only as a total ("466 cards in all"). An earlier version's
  making isn't held to this.

The library's command reads a release alone, and can't tell which of
its making is an earlier version's, so it doesn't run these rules; the
Studio does (`quadsToReleaseModel` marks no making `carried`).

## Publishing a release

Below a draft's metadata, the release screen
([`ReleasePublishContainer`](../apps/studio/src/ui/ReleasePublishContainer.tsx))
releases it, two ways.

**Publish to my Pod** (`publishRelease` in
[releasePublishing.ts](../packages/application/src/releasePublishing.ts)):

- **Where.** In the instance's `releases/`, or another folder whose
  address the user types, at `<folder><name>/v<N>.ttl` (`releaseUrlIn`
  in [releasePlace.ts](../packages/domain/src/release/releasePlace.ts)):
  the draft's name and version, as the library names its releases. The
  screen shows the address before anything is written.
- **The user's word.** The user confirms that the release becomes
  public, readable by anyone with its address and never changed or
  taken back here. Publishing waits for that, for the changes above to
  be saved, and for the catalog to be writable
  ([below](#data-set-aside)).
- **Checked.** The screen counts the errors the release check finds
  for a pod, with a link to it (`publishErrors` in
  [releaseCheck.ts](../apps/studio/src/ui/releaseCheck.ts)).
  Publishing checks the draft again, the shapes too. An error stops it
  (`releaseHasErrors`), with nothing written; a warning doesn't.
- **Written once.** The draft is made one Turtle document at the
  address (`assemble`, at library deck format 6,
  [data-model.md](data-model.md#drafts-and-releases)), written only
  where nothing is (`If-None-Match: *`). An address taken is refused
  (`releaseTaken`).
- **Public.** Then only that document is made readable by everyone, as
  its server's access control says it: its own ACL on a server with Web
  Access Control, its ACR on one with Access Control Policies
  (`ReleasePublisher`, [boundaries.md](boundaries.md#access-control)).
  - This is the only place the app changes who may read something.
  - Only the release's own access control, beside it on its server
    (`<release>.acl` or `<release>.acr`), is ever written, whatever a
    server's answers name instead.
  - Nothing of another origin is asked, nothing else is written, and a
    write follows no redirect.
- **Listed.** The catalog links it (`sm:publishedRelease`).
- **Frozen.** The draft names its release (`sm:releasedAs`), and
  changes no more.
- **One version.** What is checked, written and marked released is the
  draft at the version read (If-Match). A draft changed elsewhere
  meanwhile is `changedElsewhere`: before the release is written,
  nothing is written; after, the release stays and the draft isn't
  marked.
- **Finished again.** Publishing cut short after the release is written
  (the catalog, the draft or the network failed) is finished by
  publishing again, at the same address. A document there that states
  what this release does, its time of issue aside, is made public,
  listed and its draft frozen, as if newly written. A document that
  states something else is `releaseTaken`, as is a release another of
  the instance's drafts names as its own, even when this draft would
  state the same.

A pod that has no access control the app can write, refuses the write,
or names another access control than the release's own (the folder's,
say) keeps the release written and listed, readable by its owner
alone. The draft is released anyway. The screen says so ("Only you can
read it"), with **Make it public**, which tries the access again
(`makeReleasePublic`; `publicAccessRefused` when it still fails). It
asks first, in a ConfirmDialog that names the release and says the
Studio can't make it private again, both on the release screen and in
the releases screen's table.

**Make it public** acts only on a release that meets all of these:

- the instance's catalog lists it;
- its document is a release (its own subject an `sm:Deck`);
- it's in the instance, or in one of the user's storages that the
  instance is in too.

So a link in the catalog, which anyone may have written, opens nothing
else to everyone, nor a release of the user's own that an instance in
someone else's pod lists. The releases screen lists only links at an
http(s) address named as a release is, `…/<name>/v<N>.ttl`, as a
request sends it
([data-model.md](data-model.md#where-an-instances-documents-are)).
Whether a release is public is asked without credentials
(`isReleasePublic`).

A guest's draft offers only the download.

A released draft shows where its release is, a link to copy, whether
anyone can read it, and **Start the next version**, which makes and
opens a draft of version N + 1 ([above](#drafts)). Deleting a released
draft leaves the release.

**Download .ttl** (`downloadRelease`) saves the draft as a release
file, `<name>-v<N>.ttl`, to propose it for the library, at the address
the library would publish it at (`libraryReleaseUrl`, by the library's
index). Nothing in the pod changes, and nothing's checked: the
library's own check does that. The screen lists the steps of a
pull request, in a copy of the repository:

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
its catalog links them. Each shows:

- its address, named by it ("capitals, version 2") when it's named as
  releases are;
- a link to copy;
- who can read it (everyone, or only its owner, with **Make it
  public**);
- **Start the next version**, which makes a draft of it and opens it;
- a link to the draft it was published from, while the instance has
  it.

It changes no release. The table is a [`DataTable`](#card-workbench),
a column's name sorting it, then the other way, then as the catalog
lists them, and **Enter** opening the release at the cursor. A filter
keeps the releases whose name or address holds its text, case and
accents aside.
The sidebar and the drafts screen link to it ("Published releases"
there). A learner adds a release in Solid Memo by the link copied here
([deck-library.md](deck-library.md#from-a-link)).

## Graph

The graph
([`graph/GraphContainer.tsx`](../apps/studio/src/ui/graph/GraphContainer.tsx),
`readInstanceGraph`) draws what Solid Memo keeps in the instance: every
folder, document and resource is a node, and every link between them an
edge.

- It reads the documents the instance check reads
  ([validation.md](validation.md)): the instance's meta, preferences
  and catalog, each deck's cards and reviews in it, the digest, the
  answer log's months, its drafts' documents and the releases
  published in it.
- It reads the user's WebID profile too, to find their storages, which
  tell the leaves in their pod apart (none, when it can't).
- While it reads, it says how many documents it has read of how many.
- As anywhere in the app, it doesn't read a document the catalog names
  outside the instance, one whose address climbs out of it (`..`,
  `%2e%2e`), or a folder
  ([data-model.md](data-model.md#where-an-instances-documents-are)),
  nor a deck the instance doesn't keep where it keeps decks.
- A document that can't be read (refused, say, or not Turtle) is drawn
  as such, and the rest as read.

Its nodes, each drawn in a shape of its own, its color only helping:

| Node | What it is | Drawn as |
| --- | --- | --- |
| folder | the instance's folder, or a folder in it that holds a document read | a rounded square |
| document | a document read; one that wasn't there, or couldn't be read, too | a square, dashed when it wasn't there or couldn't be read |
| resource | a subject a document defines: the catalog, a group, a deck, its distribution and its authors, a card, a wrong option, a review state, an answer, a receipt, schedule or month summary of the digest, a draft, a chapter, a step, a release | a dot |
| vocabulary term | a class (`sm:Card`), a concept (`sm:frontToBack`), a license, a topic or theme, a media type, an EU authority table: one node for each, however many link to it | a small square |
| "in your Pod" | an address in one of the user's storages that isn't Solid Memo data: the WebID profile on many servers, a release published to another folder | a diamond |
| "outside your Pod" | any other address: a library release a copy came from, a picture, a source, a `mailto:` address | a hollow dashed ring |
| found in no document | an address in the instance a link names and no document read defines: an answer to a card since removed, say | a crossed ring |

The last four are leaves, and **a leaf is never fetched**, in the pod or
out of it ([privacy.md](privacy.md)). Which folder holds a document,
and which document defines a subject, comes from their addresses, with
no request. A link between documents is drawn as the statements say.

**Edges.** They're in three kinds, each in a color at 3:1 or more on
the background: links green, a folder's or a document's own gray, and
those to a vocabulary term amber, paler where bundled. A folder's or a
document's own edges start at its square, those to a term end at a
small square, and the table of edges names each.

- Edges are solid. The node selected's own are wider and dashed, its
  links within its column of the band (a card's wrong options, review
  state and answers) bowed aside, each a curve of its own.
- Of the edges to vocabulary terms, only the node selected's are
  drawn, and those of the node pointed at or gone to by a key, unless
  it's a term. The aside and the table of edges list them all.
- A term selected has all of its own drawn in one path, solid and a
  pixel wide, under the nodes, the paler the more it has past 300.
- An edge to a term goes up the layout's tree from its node to the
  document, or to the blocks of one as wide as half the drawing, and on
  to the term.
- The node pointed at is ringed, dashed, as the one gone to is.

**Filters.** Above the graph is a row of filters:

- **Find a node**, by its name or its address, among the nodes the
  filters show, beyond the neighbors too: ten at most, Enter selecting
  the first, the focus staying in the search.
- **Cards**, **Wrong options**, **Review states**, **Answers** and
  **Leaves** ("in your Pod", "outside your Pod", and found in no
  document), each shown or hidden, all shown at first.
- **Neighbors only**: the node selected and those an edge joins it to
  (the node selected even when its group is hidden).
- **Show as a table**.
- Last, **Vocabulary terms**, hidden at first. Until it's checked, the
  search finds no term and the tables list none; checked, the terms
  take their places round the rim (**Drawing it**, below).

Then come how many nodes and edges are shown of all, and how many
edges go to terms while they're shown. The filters are kept for the
page's life, for each instance.

**Names.** A node is named by its address, never by its text. The
instance's folder is named by the instance's name, and a folder or
document by its path in the instance. A vocabulary term is named in
short (`sm:Card`), a blank node by its label, and any other by its
fragment, else the last part of its path. Two nodes of documents named
the same are told apart by the file (`korean-verbs#card-7`), else by its
path in the instance (`decks/capitals#sweden`,
`reviews/capitals#sweden`), with no extension. Each is drawn cut at 24
characters, in the middle, for its end to show.

- The nodes in sight are named once a move or a zoom settles with the
  part in sight 800 units wide or less, holding 400 nodes at most;
  else only the folders and documents in sight.
- The node selected and its neighbors are named first, at any zoom,
  then folders and documents, then decks, then the rest. A name that
  would overlap or touch one already drawn is left out.
- A name's width is counted from its characters, never measured, and
  it's ringed in the background.

**Drawing it.** The layout is a radial tree, its links bundled along
it (hierarchical edge bundling), in
[`graph/layout.ts`](../apps/studio/src/ui/graph/layout.ts), plain
arithmetic with no library. Every node hangs in one tree: under what
holds it (a folder its documents, a document its resources), or under
what it's about when it says so, by the first of these it has:

- a document part of a deck;
- a review state, an answer, a receipt or a schedule by what it's of;
- a cards or reviews document by its deck;
- a wrong option by its card;
- a distribution or a deck by what lists it.

A leaf hangs by the first node that links to it. A choice that would
make a cycle falls back, at the first node of the cycle (by address)
that can, to what holds it, else to the first node that links to it.
If none can, that first node goes under the middle. Where the cycle is
broken doesn't depend on nodes unrelated to it.

The instance's folder is in the middle.

- The cards, each with its review states, answers and wrong options
  beside it, fill a band of rows round the outside, a column at a time,
  each deck's in a slice as wide as they need.
- The folders and documents are on rings inside it, each in the middle
  of the slice of what it holds; one holding half the drawing or more
  is near the middle.
- Those that hold next to nothing once their resources hang elsewhere
  (the meta, the preferences, the answer log's months, the digest, the
  folders whose documents went with their decks) have a ring of their
  own about the middle.
- The vocabulary terms are round a rim outside the band, each as near
  as there is room for to what links to it.

An edge of the tree is drawn along it, a curve a step.

- Those to a document's cards meet in the same few curves, through a
  routing point for each column and each block of six columns. A
  document of more than twelve blocks gathers them under rings of fewer
  further in, for a few trunks to leave it.
- Any other edge is bundled: up the tree from each end to its block or
  hub, and between those as a curve bent toward the tree, shared by all
  links between the same two. It never runs through the middle, a hub
  as wide as half the drawing, or a hub it would turn back at.
- A curve of 8 links or more is two pixels wide, of 64 or more four.
- The bundled ones are under the tree's, the paler the further in, in
  steps of 0.04, and the more of them there are past 5,000; those of
  the node selected, pointed at or gone to are over them in full.

The same graph is laid out the same way every time, every node at a
point of its own. The layout runs in steps, 4,000 edges' paths a step,
in batches of up to 12 ms, the page drawing between them, under a bar
that says how far it is (**Placing the nodes**). A layout done is kept
for the page's life, so coming back to the same graph draws it at
once. An instance of the library's ten largest decks with a hundred
answers each (about 14,500 nodes and 50,000 edges) is laid out and
routed in about a tenth of a second.

It's drawn in SVG: dragging moves it, the wheel zooms about the
pointer, as **Zoom in**, **Zoom out** and **Whole graph** do. Either
changes one transform and one CSS property for the edges' width, and
draws no node again.

- A click on a node selects it, anywhere in its shape, a hollow one's
  inside too. A click on the background (an edge, or a name, which the
  pointer goes through) lets go of the node selected. Either changes
  the address, with no Back stop.
- A press that moves 3 pixels is a drag: the click that ends it, and a
  zoom, let go of nothing. On a screen not wide, the press has already
  closed the aside's drawer.
- The nodes, their rings and their names stay the same size on the
  screen at any zoom; zooming in spreads them apart. As a move or a zoom
  settles (after 120 ms), one CSS property scales every shape about its
  own middle, and the names
  are drawn again; during a wheel zoom they lag behind it.
- The drawing resized (the window, say) is measured again once it has
  been still as long.
- Selecting a node looks its edges up, never searching all of them.
- Past 20,000 nodes or 60,000 edges shown, it isn't drawn until asked:
  the screen says how many there would be, and offers **Draw anyway**,
  the filters and the tables. No node is ever left out unsaid.

**Keys.** The drawing is one tab stop, as a chart is
([statistics.md](statistics.md)):

| Keys | What they do |
| --- | --- |
| Arrows | go to the nearest node that way (within 45 degrees of it); the first, from none |
| Home, End | go to the first node, or the last |
| Enter | select the node, and open it in the aside; on a screen not wide, its drawer opens, with the focus in it |
| Escape | let go of the node gone to |
| `+` (`=`), `-`, `0` | zoom in, out, or to the whole graph |

The line under the drawing names the node pointed at or gone to
("catalog, resource"). A node gone to by a key is read out in a status
line, and brought into sight.

**The aside** (Node) shows the node selected:

- its address, its kind, the document that defines it, and its classes;
- the values the documents state of it, each with its language tag as
  BCP 47 writes it (`@en`, `@sv` or `@en-GB`, though the data is read
  in lower case) or its datatype (`xsd:date`). The document a value is
  stated in follows when not its own;
- its links from it and to it, 50 at first and all on asking, the
  focus moving to the first new one. Each is a button that selects the
  node at its other end and moves the focus to that node's heading.

A leaf says why it wasn't read; a document that wasn't there, or
couldn't be read, says so. A node selected opens the aside's drawer on
a screen not wide. The aside shares the screen's query.

**Show as a table** shows the nodes and the edges the filters show as
two [`DataTable`](#card-workbench)s, 100 rows a page. A node row has
its name and address, its kind, the document that defines it and its
classes; an edge row, where it's from, its link and where it goes. A
name, or Enter on its row, selects its node.

## Data set aside

Every Studio screen holds to the check Solid Memo runs when an
instance is opened, and to the user's invalid data policy
([validation.md](validation.md)). `useDataCheck` in `ui` reads both
with Solid Memo's workspace's queries, once and again after a repair
([health](#health)):

- **Until the check is done**, nothing can be changed, under any policy
  but "only warn". The screens are shown, and say so.
- **A deck set aside** (under "set invalid data aside", one whose entry
  or documents have invalid data) is read-only in every screen, a line
  saying why, with a link to its health, where it's repaired. It's
  left out of every bulk action: Home and the library copies don't let
  it be selected, and moving or copying cards doesn't offer it.
- **The arrangement set aside** (the catalog or a deck group invalid):
  Groups can't be rearranged, and Home moves no deck into a group. The
  instance's name and catalog, an import, making or deleting a draft,
  publishing a release and starting a next version are held.
- **Under "block the instance"**, invalid data holds every deck and the
  instance, as a set-aside deck is held.
- **What another app wrote** only warns: it sets nothing aside.
- **A draft** is held while the check is under way, or blocks the
  instance; drafts aren't set aside one by one.

A held form is a disabled `fieldset` (`ReadOnlyScope`): links still
lead on, and what is typed in it stays.

## Groups

Groups ([`GroupsContainer`](../apps/studio/src/ui/GroupsContainer.tsx))
is Solid Memo's deck list without the study: the same screen
(`DeckListScreen`) and the same edits, kept by `useDeckTreeEditor` in
`ui`, which Solid Memo's `DeckListContainer` uses too. Decks and groups
are dragged, moved from their menus, grouped, renamed and deleted there.
What isn't arranging (a deck's page, its preferences, a course, a new
deck, the library) opens in Solid Memo. As in Solid Memo, a deck set
aside says so, and nothing is rearranged until the data check is done,
nor while the arrangement is set aside. Unlike in Solid Memo, a deck
held ([above](#data-set-aside)) can't be renamed or deleted
(`deckHeld`), a line saying why, with a link to the instance's health.

## How it is built and served

- The Studio has no page or build of its own. Solid Memo's Vite build
  ([apps/web/vite.config.ts](../apps/web/vite.config.ts)) bundles it,
  through the dynamic `import("@solid-memo/studio")` in
  `apps/web/src/main.tsx`, as a chunk of its own.
- Solid Memo's build test ([build.test.ts](../apps/web/src/build.test.ts))
  checks that nothing the page loads up front holds any of the Studio,
  its stylesheet included ([above](#layout)), and checks the whole
  bundle, the Studio's chunk included, for HTML sinks
  ([markdown.md](markdown.md#safety)).
- `npm run build` and `npm run dev` build and serve the Studio with
  the site: `npm run dev` serves it at
  `http://localhost:5173/#/studio`.
