# Accessibility

What Solid Memo aims for so that everyone can use it, with a keyboard,
a screen reader, zoomed in or on a phone: the target, what is checked
automatically and what by hand, the gaps we know of, and how to report
a barrier.

## The target

The web app and Solid Memo Studio aim to meet
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) at level AA. This is a goal,
not a claim of conformance: no full audit has been made, and the
[known gaps](#known-gaps) below are not met yet.

What the app does for it today:

- **Keyboard**: the screens are made to be used with the keyboard
  alone. The first Tab reaches "Skip to content", and as a screen opens
  the focus moves to its heading, so a screen reader says where you are
  ([user-guide.md](user-guide.md#on-every-screen)).
- **Languages**: each text says which language it is in, the app's own
  and a deck's alike, so a screen reader reads it in that language and
  right-to-left text, such as Arabic, reads right to left
  ([i18n.md](i18n.md)).
- **Themes**: a light and a dark theme, each with text at a contrast of
  4.5:1 or more and the edges of fields at 3:1
  ([theme.md](theme.md), [below](#checked-automatically)).
- **Motion**: the browser's "reduce motion" turns the animations off.
- **Targets**: buttons and links are 24px high at least, or far enough
  from their neighbors, as WCAG 2.2 asks; the Studio's rows and
  controls are about 28px high, or 44px with its Comfortable layout
  ([studio.md](studio.md#layout)).
- **Shortcuts**: the Studio's single-key shortcuts can be turned off
  ([studio.md](studio.md#layout)).
- **Focus in sight**: in the Studio, what has the focus in a table is
  scrolled clear of the header row, the first column and the bar of the
  rows selected, which stick over the table as it scrolls; the Studio
  journey moves the focus down a long table and back and checks each
  row is in sight ([studio.md](studio.md#layout)).

## Checked automatically

CI checks all of this on every pull request, and `npm run check` all
but the journeys:

- **Every screen a journey visits**: the
  [user journeys](testing.md#user-journeys) run
  [axe](https://github.com/dequelabs/axe-core) on the screen each step
  ends on, in the light and the dark theme, in Chromium and on the
  phone (WebKit), with its rules for WCAG 2.0,
  2.1 and 2.2 at levels A and AA. A violation fails the journey, and the
  report says which rule, on which element, with what axe found
  ([`harness/accessibility.ts`](../e2e/journeys/harness/accessibility.ts)).
  A violation that is let pass is listed there, in `KNOWN_EXCEPTIONS`,
  with its reason; today the list is empty.
- **The lint**: Biome's accessibility rules (missing labels, roles that
  don't exist, links without content and more) run on every component.
  A rule is turned off only for the files its reason holds for, with
  the reason in [`biome.jsonc`](../biome.jsonc)
  ([style.md](style.md#formatting)).
- **Contrast**: unit tests check, in both themes, the contrast of text
  and muted text and of fields' edges on every surface, of the text on
  a primary fill, of links, danger and warning text, of the masthead's
  text, and of an answer button's text on its grade's tint
  ([`style.test.ts`](../packages/ui/src/style.test.ts),
  [theme.md](theme.md#color-roles)), and of every
  text color the Studio's stylesheet uses on every surface it uses, in
  both themes, the surfaces that hold no text left out by name
  ([`studio.test.ts`](../apps/studio/src/ui/studio.test.ts)).
- **Text size**: unit tests fail on a font size or a breakpoint in
  pixels, which larger text would leave as they are
  ([theme.md](theme.md#text-size)).
- **Names and roles**: the journeys and the component tests find
  elements by their role and accessible name, as assistive technology
  does, so a button that loses its name fails a test
  ([testing.md](testing.md#writing-a-journey)).
- **Languages**: component tests check that a card's text, in its
  fields too, is marked with its language, as are a deck's or card's
  name and a cell's text in the names of the Studio's cells.

## Checked by hand

What a tool can't judge is checked by hand as a change is reviewed:

- that what a screen says, its alternative texts and its labels make
  sense, and that the order things are read in follows the screen;
- that a change can be made with the keyboard alone, the focus seen
  where it is and never trapped;
- that the screen still works zoomed to 200%, and at 320px wide;
- that a screen reader announces what changed, such as a saved edit or
  an error.

## Known gaps

A gap that is planned links to its issue; the others have none yet,
and an issue for one is welcome ([below](#report-a-barrier)).

- **Contrast tests**: for the site's stylesheet they cover the pairs
  listed [above](#checked-automatically), not every text and surface
  pair in both themes. axe checks the contrast of the screens the
  journeys visit. Two pairs the tests leave out are below 4.5:1 in the
  dark theme: the label on the line where a dragged deck would land
  (`--on-primary` on `--primary`), and the interval under an answer
  button's name while the pointer is over the button (muted text on
  the hovered tint of the middle grades).
- **Screen readers**: no pass with a screen reader, NVDA or VoiceOver,
  through the main journeys is written down yet. It would find what
  the checks above can't, such as whether a reader takes up the
  languages marked inside the names of the Studio's cells
  ([#169](https://github.com/solid-memo/website/issues/169)).
- **Browsers**: every journey runs in Chromium, but only those that
  differ between engines run in Firefox, WebKit and on a phone
  ([testing.md](testing.md#browsers)), so axe sees the other screens
  in Chromium alone. Desktop Firefox and WebKit run no axe at all: the
  check takes about 40% of a journey's time, and the phone already
  checks WebKit's rendering. What only Firefox computes, such as the
  contrast of a color it mixes (`color-mix`), goes unchecked.
- **The graph**: the Studio's graph of an instance is drawn as one
  image, its nodes reached one by one with the arrow keys, by where
  they are drawn, not along their links; the edges to vocabulary
  terms are drawn only for the node selected, pointed at or gone to
  with the keys, and the links bundled along its tree paler than 3:1
  on the background but for that node's, for thousands of them not to
  cover the rest. Its
  tables, and the aside's links from and to the node selected, say
  the same in text, those edges too
  ([studio.md](studio.md#graph)); no pass with a screen reader has
  checked that they are enough.
- **What axe sees**: it checks the screen each journey step ends on,
  not every state in between, and only what the journeys visit. It
  finds a part of all possible problems.

## Report a barrier

If something in Solid Memo or the Studio is hard or impossible to use
with your setup, [open an issue](https://github.com/solid-memo/website/issues/new/choose)
with the bug report form. Say what you tried to do, what happened, and
what you use: browser, screen reader or other assistive technology,
and the device. It is labeled `accessibility` and handled as a bug. Discussions are open too, for a question or an idea
([CONTRIBUTING.md](../CONTRIBUTING.md)).
