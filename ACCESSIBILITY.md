# Accessibility

Solid Memo is for anyone who wants to learn, so it should work for
anyone: with a keyboard alone, with a screen reader, zoomed in, with
large text, or on a phone. This page says what the project aims for,
what a change to the app needs, and what happens when you report a
barrier. The details, such as what is checked and how, are in
[docs/accessibility.md](docs/accessibility.md).

## Priorities

- **The target**: the web app and Solid Memo Studio aim to meet
  [WCAG 2.2](https://www.w3.org/TR/WCAG22/) at level AA. It's a goal,
  not a claim of conformance: no one has audited the app against it.
- **Keyboard**: every screen works with the keyboard alone, the focus
  always seen and never trapped.
- **Screen readers**: controls have names, screens have headings, and
  the app announces what changed, such as a saved edit or an error.
- **Languages**: every text, the app's and a deck's, is marked with its
  language, so a screen reader can pronounce it; right-to-left text
  reads right to left.
- **Seeing the screen**: text holds its contrast in every theme and
  palette, and a high-contrast and a color-blind friendly palette are
  built in. Text grows to one and a half times the browser's own size,
  and nothing scrolls sideways at 320px wide.
- **Motion**: the browser's "reduce motion" setting turns the
  animations off.

## What a change needs

A pull request that changes what the app shows, or how it's used:

- **passes the automated checks**: CI runs
  [axe](https://github.com/dequelabs/axe-core) on every screen the user
  journeys visit, and Biome's accessibility rules on every component.
  A violation fails the pull request
  ([docs/accessibility.md](docs/accessibility.md#checked-automatically));
- **works with the keyboard alone**: the order of the focus makes
  sense, and the focus is seen and never trapped;
- **works zoomed to 200% and at 320px wide**, with nothing cut off;
- **has text that makes sense**: labels, alternative texts and what a
  screen reader announces when something changes;
- **doesn't use color alone** to say something.

A reviewer checks the last four by hand
([docs/accessibility.md](docs/accessibility.md#checked-by-hand)).

## Report a barrier

If Solid Memo or the Studio is hard or impossible to use with your
setup, open an issue with the
[accessibility barrier form](https://github.com/solid-memo/website/issues/new?template=accessibility.yml).
It's labeled `accessibility` by itself. What helps:

- what you tried to do, and what went wrong;
- where in the app it happened;
- your browser and system, and the assistive technology you use, with
  its version.

A screenshot or a recording is welcome, but only if you're comfortable
sharing one. You're never asked about a disability or anything else
about yourself. A question or an idea, rather than a barrier, fits in
[Discussions](https://github.com/solid-memo/website/discussions).

### Severity

How much a barrier stops someone decides what is fixed first:

- **Critical**: it stops a core task, such as studying a deck or
  logging in.
- **Serious**: it's hard, but there is a way around it.
- **Moderate**: an annoyance, or the app behaves inconsistently.
- **Minor**: it has little effect on using the app.

You may pick one in the form; the maintainer sets or corrects it when
sorting the report.

### How a report is answered

Solid Memo has one maintainer, a volunteer
([GOVERNANCE.md](GOVERNANCE.md#who-maintains-it)), so the promises are
ones one person can keep:

- a first answer within a week, in the issue;
- critical barriers are fixed first, before other work;
- a way around the barrier, where there is one, while the fix is made;
- an update in the issue when its plan or its timing changes;
- once the fix is released, you're asked whether it works for you.

There are no fixed deadlines for fixes. A barrier that isn't fixed
soon is listed among the [known limitations](#known-limitations).

## Who looks after it

The maintainer, Anton Wiklund ([@ixuz](https://github.com/ixuz)), owns
accessibility: sorting reports, tracking the known barriers, and
keeping this page and [docs/accessibility.md](docs/accessibility.md)
up to date. If the maintainer changes, so does this
([GOVERNANCE.md](GOVERNANCE.md#if-the-maintainer-steps-away)).

## Supported environments

- **Browsers**: the current Chrome, Edge and other browsers built on
  Chromium, Firefox, and Safari on a Mac, an iPhone or an iPad
  ([docs/user-guide.md](docs/user-guide.md#supported-browsers)). The
  automated checks run in Chromium and in WebKit, Safari's engine, on a
  phone-sized screen, not in real browsers on real devices.
- **Assistive technology**: the app gives screen readers what they read
  (names, roles, headings, languages and announcements), but no pass
  through the app with one, such as NVDA, JAWS, VoiceOver or TalkBack,
  has been written down yet
  ([#169](https://github.com/solid-memo/website/issues/169)). A report
  of how it went with yours, good or bad, is welcome.

## Known limitations

The full list, with what each means and its issue, is in
[docs/accessibility.md](docs/accessibility.md#known-gaps). The ones a
learner is most likely to meet:

- **Screen readers**: no pass with one has been written down, so
  barriers the automated checks can't find may be there.
- **The Studio's graph** is one image. Its tables and the links beside
  it say the same in text.
- **A palette of your own** may hold colors below the contrast needed,
  once you choose "Use anyway".

## Feedback

To suggest a change to this page or to how the project works on
accessibility, open a
[discussion](https://github.com/solid-memo/website/discussions) or a
pull request. A barrier goes to the
[form](#report-a-barrier) instead.
