# User guide

Solid Memo is a flashcard app. It brings each card back shortly before
you'd forget it, so a little study every day goes a long way. Your
cards and your study live in your own Solid Pod, not on Solid Memo's
servers. You can try it in your browser first, without an account.

This page walks you through the app at <https://solid-memo.com/>
screen by screen, each section linking the page on how that part works.
The [user journeys](testing.md#user-journeys) take the same walk as
tests, clicking through the real app in a browser on every change, and
[the last table](#the-journeys) says which journey shows which part.
CI's report on the site's version, with a screenshot of every step, is
at <https://journeys.solid-memo.com/> (after a deploy by hand, the last
release's).

## Words used here

- **Pod**: your own online storage, run by a Pod provider you choose, or
  by yourself. Apps that follow the [Solid](https://solidproject.org/)
  standards keep your data there, and you decide who may read it.
- **WebID**: the web address that identifies you, from your Pod
  provider. You log in on your provider's page: Solid Memo never sees
  your password.
- **Instance**: one collection of your decks and study, in a folder of
  your Pod. Most people need only one.
- **Deck**: a set of cards on one subject. **Card**: a front and a back,
  each with text, a picture, or both.
- **Course**: a deck that teaches short pieces of theory, each checked
  by questions that become cards in your deck once answered.
- **Library**: ready-made decks and courses, free to copy into your
  instance.

## Supported browsers

Solid Memo runs in the current version of:

- Chrome and Edge, and other browsers built on Chromium;
- Firefox;
- Safari, on a Mac and on an iPhone or iPad.

Something that doesn't work in these is a bug:
[open a bug report](https://github.com/solid-memo/website/issues/new?template=bug.yml)
with the browser and its version. Older versions and other browsers may
work, but aren't supported.

Every [user journey](testing.md#user-journeys) runs in Chromium.
Logging in, the guest journey and reloading during a study session run
in Firefox, WebKit (Safari's engine) and WebKit on an iPhone's screen
too ([testing.md](testing.md#browsers)). These are Playwright's builds,
not the browsers you install, so no test runs on a real iPhone.

## Getting in

The first screen offers three ways in
([onboarding.md](onboarding.md)):

- **Try it without logging in.** You study as a guest, and what you
  learn stays in this browser only, as a line at the top says, with
  "Keep my study: log in" and "Discard". When you log in later, move
  your study into an instance you have or a new one, discard it, or
  decide later ([guest-mode.md](guest-mode.md)): each card is then in
  your Pod where you left it.
- **Log in with your Pod.** Pick your provider, or type your WebID
  under "Or use your WebID" and press "Log in with Solid". You log in
  on the provider's page and come back to Solid Memo, which finds your
  Pod from your profile and says "Your Pod is connected." Press
  Continue ([authentication.md](authentication.md)). To go straight on
  next time, on every device, first check "Don't show this screen after
  logging in"
  ([onboarding.md](onboarding.md#skipping-the-connected-screen)).
- **No Pod yet?** "Create a Pod" opens a provider's sign-up page in a
  new tab. Come back when you're done, and log in.

The first time you log in, Solid Memo asks which storage to use if your
Pod has more than one, then a name for your instance and where in your
Pod to keep it. After that, logging in takes you straight to your
decks. "Log out", at the top, ends the session.

## On every screen

- **At the top**: the Solid Memo logo, which takes you home; the
  language list (a globe and the language's name); the light and dark
  toggle; and who you're logged in as, with "Log out".
- **The instance bar** names the instance you're in, with "Open in
  your Pod" (or "Kept in this browser", for a guest), and links to its
  **Statistics** and **Preferences**, "Open in Studio" and "Switch
  instance".
- **The breadcrumb** under it shows where you are, such as Decks ›
  Spanish › Browser, each part a link back up. Back and Forward work,
  and every screen has its own address to bookmark or open in a new tab
  ([routing.md](routing.md)).
- **"Skip to content"** is the first thing the Tab key reaches.
- **"Something went wrong"** takes a screen's place if it breaks, and
  the top and the footer stay. **Try again**, or **Go to the start**.
  **Copy details** and **Report it** help you tell the project, and
  nothing is sent unless you send the report
  ([privacy.md](privacy.md#when-something-goes-wrong)).

## Your decks

The deck list is home. From the top:

- **New in Solid Memo**: the app's highlights this browser hasn't
  shown, newest first, under the version's number.
  **Close** puts it away on this browser until a later version brings
  more. A first visit shows none, and a version that only fixes things
  brings none.
- **Today**: once you've studied today, your streak (days in a row), a
  word of praise and the day's numbers, with a link to all your
  statistics ([statistics.md](statistics.md#the-today-strip)). Before
  you study, a welcome back: the streak that studying today keeps, a
  note on it that changes daily, and the cards left for today. After a
  streak has lapsed, a gentle note to start a new one.
- **Your courses**: each course you've added and not finished, started
  or not, with how many of its chapters are done and a button to start
  it or go on where you left off. Courses run alongside your other
  decks.
  While all your decks are courses, the strip points to the **Deck
  library**, since you can add other decks at any time
  ([courses.md](courses.md#the-learners-flow)).
- **Try FSRS-6**: while your instance schedules with SM-2, an invitation
  to switch to FSRS-6, the recommended scheduler, whose intervals
  differ more by your answer and adapt to how late you review. **Switch
  to FSRS-6** switches at once ([Preferences](#preferences)); **Not
  now** puts it away for good on every device, since your Pod's
  preferences keep it
  ([srs.md](srs.md#the-invitation-to-switch)).
- **Decks**: each deck, with a **Study** button when cards are waiting
  today, or "Done for today". Click a deck's name to open its page. A
  library deck says "New release" after its name when the library has a
  newer release, and its page offers the update. A new instance with no
  decks offers the course for newcomers here: "Start the course".
- Each deck's **menu**, at the end of its row, offers its preferences,
  Rename, moves up, down and into groups, "Open in Studio", and "Delete
  deck". Drag a deck onto another to make a group, and in and out of
  groups. Deleting a group keeps its decks.
- At the bottom: **Create deck**, **Deck library** and **Add from a
  link**.

## A deck's page

A deck's page says how many cards are due today and how many are new,
with a **Study** button, and shows:

- who made the deck, its license and its description, when the deck
  says so, as a library deck does;
- a notice when the library has a newer release of the deck, with an
  offer to update your copy card by card, keeping your changes and your
  progress ([migrations.md](migrations.md#catching-up-with-the-library));
- "Reset today's study", once you've studied the deck today, to undo
  today's answers for this deck ([srs.md](srs.md#resetting-the-day));
- the deck's statistics in short, with "More statistics" for all of
  them: where its cards stand, the cards you forget most and, in a
  course's deck, the wrong options you choose most. When some cards are
  leeches, **Cram the leeches** lets you practice those now ([Cramming
  the leeches](#cramming-the-leeches)).

Its buttons lead to **Preferences** (the deck's name, its own daily
limits, the language its cards are shown in first, and the languages
of its text), the **Browser** (its cards) and **Open in Studio**.

## Studying

Press **Study**. A session holds the cards due today, with a few new
ones mixed in ([srs.md](srs.md#study-sessions)).

1. The front of a card is shown. Try to remember the answer.
2. Press **Reveal** (or Space) to see the back.
3. Rate how well you remembered it, with the buttons or the number keys:
   0 (no memory at all) to 5 (easy), or Again · Hard · Good · Easy, as
   you choose in the preferences. Under each button is how long the
   card would wait before coming back if you chose it.

Pressed the wrong button? **Undo last answer** (or U) takes your last
answer back and shows that card again, while the session is open.

**0 — Blackout**, **1 — Wrong** and **Again** bring a card back later
in the same session. **2 — Almost** doesn't, but the card starts over:
it's due again the next day you study. **Hard** counts as remembered.
The better you remember a card, the longer it waits: a day, then a few
days, then weeks. That's spaced repetition, scheduled with FSRS-6 or
SM-2 ([srs.md](srs.md)). "End session", at the top, takes you back to
your decks at any time, and nothing you answered is lost. When the
session is over it says so, with "End session" under it and Undo
beside it.

A deck you study both ways asks each card front to back and back to
front, each on its own schedule.

A wrong card in a library deck, such as a bad translation? **Report a
mistake**, under the card, opens a report on the project's issue
tracker with the deck and the card filled in: say what's wrong. A deck
added from a link has the link when its creator names a page for
reports ([deck-library.md](deck-library.md#reporting-a-mistake)).

### Cramming the leeches

A leech is a card you keep forgetting: 4 times or more in its reviews of
the last 12 months. **Cram the leeches**, under a deck's hardest cards,
asks that deck's leeches now, due or not, shuffled. You answer them as
in a study session, and a card you get wrong comes back later in the
cram. At the end, **Cram again** goes through them once more, as often
as you like. Under the leeches on the statistics' Memory tab, **Cram the
leeches** does the same for all your decks, each card's heading naming
its deck.

Nothing in a cram is recorded, as the screen says throughout: not when
the cards are due, nor your statistics, nor which cards are leeches, so
the grades show no interval and there's no undo. A card stops being a
leech only through your normal study
([srs.md](srs.md#cramming-the-leeches)).

## Adding and editing cards

- **Create deck**, under the deck list, asks for a name and the
  language it's in.
- The **Browser**, from a deck's page, lists every card, ten to a page
  ([browsing.md](browsing.md)). There you describe the deck, choose
  which way it's studied (front to back, back to front, or both), add
  cards, and open a card to edit or remove it. Under the editor, a
  card's history shows when it comes back, how long until then, when
  you first studied it, and every answer you gave it.
- **Add card** opens a form for the front and the back: text, a
  picture, or both, and optional notes. It stays open, so you can add
  many in a row. Check "Format with Markdown" for code, lists or tables
  ([markdown.md](markdown.md#writing-markdown-in-the-app)).

## The deck library

**Deck library**, under the deck list, lists ready-made decks
([deck-library.md](deck-library.md#in-the-app)), each with the
languages its cards are in. Search by name, description or keyword, or
narrow the list to topics, or to decks with cards in the languages you
check. Many decks teach a language: Arabic, English, Finnish, French,
German, Italian, Japanese, Korean, Portuguese, Spanish and Swedish.
Arabic has four: Basic Arabic and the most common nouns, verbs and
adjectives.

- Click a deck to read what it covers, who made it, its license and
  sources, and **Browse cards** to list its cards.
- **Preview** shows its cards at random, recording nothing. A course's
  preview lists its chapters: open one to read each step's theory and
  answer its questions, as the course asks them.
- **Report a mistake**, on a deck's page and on each of its cards,
  reports a wrong card with its deck filled in.
- **Copy link**, on a deck's page, copies a link anyone can open: someone
  not logged in tries the deck as a guest
  ([guest-mode.md](guest-mode.md#from-a-link)).
- Check several decks and press **Import**, or import one from its own
  page. The copy is yours to edit. A deck you've imported is marked so.
- **Add from a link** adds a deck or a course someone published in
  their own Pod. Paste the link, and Solid Memo shows what it is and
  where it's published before you add it
  ([deck-library.md](deck-library.md#from-a-link)).

## Courses

You start a course, rather than import it, from its library page, a
shared link, or the newcomer offer on an empty deck list
([courses.md](courses.md)).

- **The course's page** lists its chapters, each locked, open or done,
  and a button to go on where you left off, with **Deck library** after
  it. **Preferences**, beside its title, sets the language it's shown
  in ([Languages](#languages)).
- **A chapter** goes a step at a time. First read a short piece of
  theory, sometimes in parts ("Part 2 of 3"). Then "Check your
  understanding" asks its questions with the theory hidden: choose an
  answer (or press its number) and press Check. The app says whether
  you were right and, if not, why. The first time you answer a
  question, its card joins your deck, to study like any other.
- **The final review** comes after a chapter's last step: every question
  of the chapter again, shuffled, and one you get wrong comes back until
  you get it right. Pass it, and the chapter is done and the next one
  opens. Finishing the last chapter brings confetti (none if your device
  asks for reduced motion).

## Statistics

**Statistics**, in the instance bar, shows your study over the last
three months by default, or the last 30 days, the last 12 months or all
time, as you pick above the figures. A guest has statistics too. Its
tabs, each a link of its own, hold
([statistics.md](statistics.md#the-statistics-page)):

- **Overview**: your answers, study days, the cards you know now
  (mature), your streaks, a calendar of your activity and each deck's
  figures; over all time, the cards you've started and grown mature and
  about how long you've studied. "Download my answers (CSV)" saves the
  range's answers on your device as a spreadsheet file, sending nothing
  anywhere. Your streaks, the calendar, and this week and month on
  Activity look back a year, whatever the range.
- **Activity**: what each recent day held, the weekdays you study, this
  week and month beside the last, and about how long you study; folded
  away, the hours you study in and how your cards grew week by week.
- **Memory**: how well you remembered your cards in reviews, the answer
  buttons you pressed, your recall over time, by interval and by
  lateness, your course answers, and your leeches, each a link to the
  card's page, with **Cram the leeches**. Figures worked out from your
  answers alone say they're approximate, and changes made in the Studio
  aren't in your answers.
- **Cards**: how many are new, relearning (forgotten last time), young
  (reviewed at intervals under 21 days) and mature. The overdue
  reviews and when your daily limit lets you catch up, the next 30
  days' reviews, and how far along each course you are, chapter by
  chapter.

A deck's "More statistics" shows these tabs for that deck alone.
Today's strip says how many cards are left for today and about how many
minutes they take. Point at a bar or a day to see what it holds, or
reach a chart with Tab and step along it with the arrow keys. Every
chart can be read as a table.

Each answer, in study or in a course, keeps how long you took to recall
it and, in study, to grade it (not counting time the app was hidden).
It keeps the day the card was due and your device's offset from UTC.
These stay in your Pod with your answers, and nothing turns them off
([privacy.md](privacy.md)).

## Preferences

**Preferences**, in the instance bar:

| Setting | What it does |
|---|---|
| Language | The app's language. Kept on this device. |
| Appearance | Light, dark, or as your browser says. Once saved, kept in your Pod, so every device looks the same ([theme.md](theme.md)). |
| Colors | Standard, High contrast, Color-blind friendly or Parchment (low glare), each with a swatch in its own colors, light and dark, and any palette you designed. When your device asks for more contrast, High contrast is suggested. "Design a palette" opens the palette editor, and "Reset colors" goes back to Standard. Takes effect at once, and is kept like the appearance ([theme.md](theme.md#palettes)). |
| Text size | Default, Large, Larger or Largest: up to one and a half times your browser's text size, each with a sample line. Takes effect at once, and is kept like the appearance ([theme.md](theme.md#text-size)). |
| New cards per day | 5 to start with. Every new card comes back for reviews in the days after, so start small. |
| Max reviews per day | A cap on one day's reviews, 200 to start with. |
| Day starts at | The hour a new study day begins, 4 in the morning to start with, so late-night study counts for that day. |
| Scheduler | FSRS-6, listed first and marked Recommended, or SM-2: how each card's next day is worked out ([srs.md](srs.md#switching-the-scheduler)). A new instance starts on FSRS-6; an older one, or one with no preferences saved, is on SM-2 until you switch. Each switch to FSRS-6 works out each card's memory anew from your answers, deck by deck, says how it went, and keeps every card due on its day. SM-2 stays up to date on every review, so you can switch back at any time. |
| Desired retention | With FSRS-6: how likely you are to remember a card when it comes back, from 70% to 97%, 90% to start with. Higher means more reviews. |
| Answer buttons | 0 to 5, or Again · Hard · Good · Easy. FSRS-6 always uses the four; your choice is kept for SM-2. |
| "When data does not conform" | What to do when data in your Pod isn't in the form Solid Memo expects: block the instance, set the faulty deck aside (the default), or only warn ([validation.md](validation.md)). |
| After logging in | Whether logging in shows the screen that says your Pod is connected. Each instance keeps the choice; logging in skips the screen only when it's off in every one, and shows it when one's preferences can't be read or saved ([onboarding.md](onboarding.md#skipping-the-connected-screen)). Not offered to a guest. |
| Developer mode | Shows developer tools: your WebID document, and a check of the instance against Solid Memo's data shapes. |

Press **Save**. A deck's own preferences can set daily limits for that
deck, where an empty field follows these, and show its cards in another
language ([Languages](#languages)).

Under the settings (not for a guest), **Findable by other apps** shows
whether other Solid apps can find your decks and study through your
Pod's type indexes, and registers what's missing when you ask
([data-model.md](data-model.md#discovery-chain)).

## Languages

Solid Memo speaks English, Swedish, Korean, German, Spanish and French.
It starts in your browser's language when it speaks it, else English.
Choose another with the globe at the top of any screen, or under
Language in the preferences ([i18n.md](i18n.md)).

Your cards show as you wrote them. Each text names its language, so a
screen reader reads it in that language. A deck's name, its description
and a card can have translations, and you see the one in your language
when there is one. A deck's page says when some of its text doesn't
name its language, with a link to settle it.

To show a deck's cards in another of their languages, whatever the
app's, choose it under **Card language** on the deck's
**Preferences** and press **Save card language**. The cards then show
in it wherever they appear: when you study or cram, in the Browser and
in the Studio. A card without text in it shows as usual, and the
deck's name and description stay in your language. **The app's
language** goes back to the usual. The deck keeps the choice in your
Pod, on every device.

To read a course in another language, choose it under **Course
language** on the course's **Preferences** and press **Save course
language**. The list offers every language the course has theory and
titles in, even before you've answered any question. The course's and
its chapters' titles and descriptions, the theory and the questions
then show in it, and the app's own words stay in yours. Text the course
doesn't have in it shows as usual. The deck keeps this choice in your
Pod too.

Right-to-left text, such as Arabic, runs right to left:
on a card, where Arabic starts at the right, in a deck's name, and
inside an English sentence, which keeps its punctuation in place. The
screens stay left to right, since none of the app's languages is
written right to left.

## Theme

The sun and moon button at the top switches between light and dark.
Under Appearance in the preferences, "As my browser" follows your
device's setting ([theme.md](theme.md)). For example, switch to dark,
choose High contrast and Larger under Colors and Text size, and press
Save in the preferences. Log in on another device, and Solid Memo opens
in them there too, since your Pod keeps them. Colors and Text size,
under Appearance, change the palette and the text size in light and
dark alike.

"Design a palette", under Colors, lets you choose the colors you read
best ([theme.md](theme.md#palettes-of-ones-own)). Give it a name, the
palette it starts from, and a color for the page, the text, the
buttons, the links and the answer buttons, in light and dark. A preview
shows the colors, and a table says whether each pair of colors that
holds text has the contrast it needs. Solid Memo asks before it saves
colors with too little contrast ("Use anyway"), and doesn't save text
you couldn't read at all. "Save and use" keeps the palette in your Pod
and shows Solid Memo in it on every device. "Edit", beside it under
Colors, changes it later. "Reset colors" is always drawn in the
standard colors, so you can find it and go back to Standard.

## More than one instance

"Switch instance", in the instance bar, lists your instances: open
one, create a new one, attach one by its address, or delete one.

For example, to keep your language decks apart from your work decks,
press "Switch instance" and create a new instance in another folder
of your Pod. Add decks to it: it starts empty, with its own decks and
study. "Switch instance" takes you back to the first. With two
instances, Solid Memo asks which to open when you come back.

## Decks to confirm

A deck's cards and progress may live anywhere in your Pod: in another
folder, under other names, or in your Pod's root. Solid Memo writes to
those documents, or deletes them with the deck, only when they say they
belong to the deck, as every document it writes does. An older document
outside the instance's folder may not say so yet, and Solid Memo never
adds that there by itself, where someone else's data could be named.

Such a deck is listed under **Decks to confirm**, above your decks and
on the Studio's Health screen, with the addresses of its documents.
You can study it, but no answer or edit is saved to those documents,
and removing the deck only takes it off the list. If they're
the deck's, press **These are this deck's documents**, check the
addresses once more and press **Mark them as the deck's**. The deck
then works like any other.

## Solid Memo Studio

"Open in Studio", in the instance bar, on a deck's page or in a deck's
menu, opens Solid Memo Studio, a second app for managing many decks
and cards at once and for writing decks and courses to publish
([studio.md](studio.md)). Its search finds an Arabic word with or
without its vowel marks: كتاب finds كِتَاب.

Its **Import and export** saves decks as files and makes decks of
files ([studio.md](studio.md#import-and-export)). For example, check a
deck, choose Turtle, check "Include my progress" and press "Export 1
deck": your browser saves the deck as a file. Later, or in another
instance, "Choose a file…" under Import says what that file holds.
Leave "Import the progress too" checked and press "Import into": the
file becomes a new deck, with your progress.

Its **Graph** draws the instance's folders, documents, decks, cards,
answers and drafts as nodes, and the links between them
([studio.md](studio.md#graph)). Drag to move it, and zoom with the
wheel or "Zoom in" and "Zoom out". Click a node, or reach it with the
arrow keys and press Enter, to see beside the graph what it says and
links to; click an empty place to let go. A link out of the instance,
to a library release, a license or your WebID, ends in a leaf that's
never read. Uncheck "Answers" to see less, or check "Vocabulary
terms", last in the row, to see the classes and concepts the data uses
too. "Show as a table" shows it all as two tables.

## The journeys

A [user journey](testing.md#user-journeys)'s numbered steps are the
ones in the [online report](https://journeys.solid-memo.com/).

| You want to see | Journey | Steps |
|---|---|---|
| Logging in with a WebID and out | [smoke.journey.ts](../e2e/journeys/journeys/smoke.journey.ts) | 01–03 |
| Preferences: new cards per day, the scheduler, answer buttons, developer mode | [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts) | 03, 12, 14 |
| The FSRS-6 invitation, answered Not now, and kept so | full-learner | 03b, 14 |
| Creating decks and adding cards | full-learner | 04–05, 07–08 |
| Studying | full-learner | 06, 13 |
| Grouping decks | full-learner | 09–11 |
| Statistics, and a card's history | full-learner | 15–15b |
| Previewing and importing a library deck | full-learner | 16–17 |
| Narrowing the deck library to the cards' language | [library-languages.journey.ts](../e2e/journeys/journeys/library-languages.journey.ts) | 02–04 |
| Describing a deck in two languages, and switching language | full-learner | 18–20b |
| A deck's cards in another language, and back | full-learner | 20c–20d |
| Checking the instance (developer mode) | full-learner | 21 |
| A card in Markdown | [markdown-card.journey.ts](../e2e/journeys/journeys/markdown-card.journey.ts) | 04–07 |
| The newcomer course from an empty deck list, and the library beside it | [newcomer-course.journey.ts](../e2e/journeys/journeys/newcomer-course.journey.ts) | 03–07 |
| Previewing a course from the library: a chapter's theory, then a question | course-chapter | 02b |
| A course's first chapter and its final review | [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts) | 03–08 |
| A course's title, chapters and theory in another language, and back | course-chapter | 03b–03d |
| A course's answers and chapters in the statistics, and its most-confused options | course-chapter | 09–10 |
| Adding a course from a link and playing it | [studio-course.journey.ts](../e2e/journeys/journeys/studio-course.journey.ts), second journey | 03–05 |
| Solid Memo Studio | [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts) | 06–31 |
| Writing a course in the Studio, trying it and publishing it | studio-course.journey.ts, first journey | 05–11 |
| Trying the app as a guest, and moving the study into a pod | [guest.journey.ts](../e2e/journeys/journeys/guest.journey.ts) | 02–11 |
| A library deck's link, opened in another browser as a guest | [try-link.journey.ts](../e2e/journeys/journeys/try-link.journey.ts) | 02–05 |
| A screen that breaks: "Something went wrong", its details and its report | [render-error.journey.ts](../e2e/journeys/journeys/render-error.journey.ts) | 02–06 |
| Dark, High contrast and Larger, kept in the Pod and found on a second device | [returning-learner.journey.ts](../e2e/journeys/journeys/returning-learner.journey.ts) | 03–05, 08–11 |
| A palette of one's own with too little contrast, used anyway and found on a third device, then reset | returning-learner.journey.ts | 12–14 |
| Skipping the Connected screen, kept in the Pod and found on another device, then showing it again | returning-learner.journey.ts | 08, 11, 13, 15 |
| A second instance, and switching between the two | [second-instance.journey.ts](../e2e/journeys/journeys/second-instance.journey.ts) | 04–08 |
| Exporting a deck as a file and importing it again, with its progress | studio.journey.ts | 21–23 |
| Switching to FSRS-6 from the invitation, then reviewing with it | [later-day.journey.ts](../e2e/journeys/journeys/later-day.journey.ts) | 03, 06–09 |
| A later study day, forgotten cards and the hardest cards, with no leech | later-day | 07–12 |
| Welcomed back with the streak before the day's first answer | later-day | 07 |
| Updating a library deck to its new release, keeping progress | [library-upgrade.journey.ts](../e2e/journeys/journeys/library-upgrade.journey.ts) | 04–10 |
| Undoing an answer, and resetting today's study | [reset-day.journey.ts](../e2e/journeys/journeys/reset-day.journey.ts) | 07–12 |
| Reloading in the middle of a study session | [study-reload.journey.ts](../e2e/journeys/journeys/study-reload.journey.ts) | 05–10 |
