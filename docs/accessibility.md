# Accessibility

How Solid Memo aims to work for everyone, with a keyboard, a screen
reader, zoomed in or on a phone.

## The target

The web app and Solid Memo Studio aim to meet
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) at level AA. It's a goal,
not a claim of conformance: there's been no full audit, and the
[known gaps](#known-gaps) aren't met.

What the app does today:

- **Keyboard**: the screens work with the keyboard alone. The first
  Tab reaches "Skip to content", and as a screen opens, the focus moves
  to its heading, so a screen reader says where the learner is
  ([user-guide.md](user-guide.md#on-every-screen)).
- **Languages**: each text, the app's and a deck's, is marked with its
  language for a screen reader, and right-to-left text, such as Arabic,
  reads right to left
  ([i18n.md](i18n.md)).
- **Themes and palettes**: the light and dark themes of every palette
  hold text at 4.5:1 or more, and field edges and chart steps at 3:1;
  High contrast holds text to 7:1, edges and steps to 4.5:1. The
  Color-blind friendly palette moves meaning off red and green
  ([theme.md](theme.md#palettes), [below](#checked-automatically)).
  A palette of one's own shows every text pair's contrast as the
  learner picks colors, in a table and a live region; it asks before
  saving one below the contrast needed, and refuses text below 3:1 on
  the background ([theme.md](theme.md#palettes-of-ones-own)).
  "Reset colors" is drawn in the standard colors, so it stays readable
  whatever such a palette does.
- **Text size**: four sizes, up to one and a half times the browser's
  own, which they multiply, so text grows without zooming the whole
  page ([theme.md](theme.md#text-size)).
- **Motion**: the browser's "reduce motion" turns the animations off.
- **Targets**: buttons and links are at least 24px high, or far enough
  from their neighbors, as WCAG 2.2 asks. The Studio's rows and
  controls are about 28px high, or 44px in its Comfortable layout
  ([studio.md](studio.md#layout)).
- **Shortcuts**: the Studio's single-key shortcuts can be turned off
  (`studio.md`).
- **Focus in sight**: in a Studio table, the header row, the first
  column and the bar of selected rows stick as it scrolls, and the
  Studio scrolls the focused element clear of them.
  The Studio journey checks each row stays in sight as the focus moves
  down a long table and back (`studio.md`).

## Checked automatically

CI checks all of this on every pull request, and `npm run check` all
but the journeys:

- **Every screen a journey visits**: the
  [user journeys](testing.md#user-journeys) run
  [axe](https://github.com/dequelabs/axe-core) on the screen each step
  ends on: WCAG 2.0, 2.1 and 2.2 rules at levels A and AA, in both
  themes, in Chromium and on the phone (WebKit). In Chromium alone, its
  contrast rules (`color-contrast`, `link-in-text-block`) run in both
  themes of every other palette (a palette of the user's own taken off
  the page), and at the largest text size and 320px wide the screen
  mustn't scroll sideways. No text kept on one line may be cut short
  there without a title that holds it whole (WCAG 1.4.4 and 1.4.10,
  which axe doesn't check). A violation fails the journey, its report
  naming the rule, the element and what axe found
  ([`harness/accessibility.ts`](../e2e/journeys/harness/accessibility.ts)).
  A violation let pass is listed there, in `KNOWN_EXCEPTIONS`, with its
  reason; today the list is empty.
- **The lint**: Biome's accessibility rules (missing labels, roles that
  don't exist, links without content and more) run on every component.
  A rule is off only for the files its reason holds for, and the reason
  is in [`biome.jsonc`](../biome.jsonc) ([style.md](style.md#formatting)).
- **Contrast**: unit tests
  ([`style.test.ts`](../packages/ui/src/style.test.ts),
  [theme.md](theme.md#color-roles)) check both themes of every palette,
  at High contrast's own ratios there:
  - text, muted text and field edges on every surface;
  - text on a primary fill, links, danger and warning text, the
    masthead's text, and an answer button's text on its grade's tint;
  - a chart's steps on the surfaces, at a field edge's ratio;
  - in the Color-blind friendly palette, that neighboring grades stay
    apart under each color vision deficiency.

  [`studio.test.ts`](../apps/studio/src/ui/studio.test.ts) checks, in
  both themes, every text color the Studio's stylesheet uses on every
  surface it uses (surfaces without text left out by name), and the
  sidebar's faint pin at a field edge's ratio. Every built-in palette
  passes the editor's check of a palette of one's own
  ([`customPalette.test.ts`](../packages/domain/src/customPalette.test.ts)).
  It measures every pair the tests check among the colors such a
  palette paints, and `style.test.ts` checks that it does.
- **Text size**: unit tests fail on a font size or a breakpoint in
  pixels ([theme.md](theme.md#text-size)).
- **Names and roles**: the journeys and component tests find elements
  by role and accessible name, as assistive technology does: a button
  that loses its name fails a test
  ([testing.md](testing.md#writing-a-journey)).
- **Languages**: component tests check that a card's text, in its
  fields too, a deck's or card's name, and a cell's text in the names
  of the Studio's cells are marked with their language.

## Checked by hand

A reviewer checks what a tool can't judge:

- that a screen's text, alternative texts and labels make sense, and
  the reading order follows the screen;
- that a change works with the keyboard alone, the focus seen and
  never trapped;
- that the screen works zoomed to 200% and at 320px wide;
- that a screen reader announces what changed, such as a saved edit or
  an error.

## Known gaps

A planned gap links to its issue; an issue for another is welcome
([below](#report-a-barrier)).

- **Contrast tests**: for the site's stylesheet they cover the pairs
  listed [above](#checked-automatically), not every text and surface
  pair in both themes.
- **Palettes of one's own**: once the user says "Use anyway", a palette
  they design may hold pairs below the contrast needed. One
  written into the pod by another app may hold anything the checks
  allow; the app shows one with text below 3:1 on a surface as its
  base. Only the editor's check measures such a palette, on the pairs
  it lists; no journey's axe check sees it.
- **Screen readers**: no pass through the main journeys with a screen
  reader, NVDA or VoiceOver, is written down yet. It'd find what the
  checks above can't, such as whether a reader takes up the languages
  marked inside the Studio's cell names
  ([#169](https://github.com/solid-memo/website/issues/169)).
- **Browsers**: every journey runs in Chromium, only those that differ
  between engines in Firefox, WebKit and on a phone
  ([testing.md](testing.md#browsers)), so axe sees the other screens in
  Chromium alone. Desktop Firefox and WebKit run no axe: it takes about
  40% of a journey's time, and the phone already checks WebKit's
  rendering. What only
  Firefox computes, such as a `color-mix` color's contrast, goes
  unchecked.
- **The graph**: the Studio's graph of an instance is one image; the
  arrow keys reach its nodes by where they're drawn, not along their
  links. Edges to vocabulary terms show only for the node selected,
  pointed at or reached with the keys. The links bundled along its tree
  are paler than 3:1 on the background, except that node's, so
  thousands don't cover the rest. Its tables and the aside's links from and to the selected
  node say the same in text, those edges too
  ([studio.md](studio.md#graph)); no screen reader pass has checked
  they're enough.
- **What axe sees**: axe checks the screen each journey step ends on,
  not the states in between, and only screens the journeys visit. It
  finds a part of all possible problems.

## Report a barrier

A learner who finds Solid Memo or the Studio hard or impossible to use
with their setup can
[open an issue](https://github.com/solid-memo/website/issues/new/choose)
with the bug report form. The issue should say what they tried, what
happened, and what they use: browser, screen reader or other assistive
technology, and device. It's labeled `accessibility` and handled as a bug.
Discussions are open for a question or an idea
([CONTRIBUTING.md](../CONTRIBUTING.md)).
