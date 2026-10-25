# User guide

Solid Memo is a flashcard app. You study cards, and the app brings each
card back just before you would forget it, so a little study every day
goes a long way. Your cards and your study are kept in your own Solid
Pod, not on Solid Memo's servers. You can also try it first in your
browser, without an account.

This page walks through the app as a learner uses it, screen by
screen, at <https://solid-memo.com/>. Each section links the page that
explains how that part works. The [user journeys](testing.md#user-journeys)
are the same walk-through as automated tests: they click through the
real app in a browser on every change. The report of CI's run on the
version the site runs, with a screenshot of every step, is online at
<https://journeys.solid-memo.com/> (after a deploy by hand, still the
last release's).
The table at the [end](#the-journeys) says which journey shows which
part.

## Words used here

- **Pod**: your own online storage, run by a Pod provider you choose, or
  by yourself. Apps that follow the [Solid](https://solidproject.org/)
  standards keep your data there, and you decide who may read it.
- **WebID**: the web address that identifies you, given to you by your
  Pod provider. You log in on your provider's own page: Solid Memo never
  sees your password.
- **Instance**: one collection of your decks and study, kept in a folder
  in your Pod. Most people need only one.
- **Deck**: a set of cards on one subject. **Card**: a front and a back,
  each with text, a picture, or both.
- **Course**: a deck that teaches. Short pieces of theory, each checked
  by questions; every question you answer becomes a card in your deck.
- **Library**: ready-made decks and courses, free to copy into your
  instance.

## Supported browsers

Solid Memo runs in the current version of:

- Chrome and Edge, and other browsers built on Chromium;
- Firefox;
- Safari, on a Mac and on an iPhone or iPad.

Something that does not work in one of these is a bug: please
[report it](https://github.com/solid-memo/website/issues/new?template=bug.yml),
with the browser and its version. An older version or another browser
may work too, but it is not supported.

Every change is tested in Chromium, in Firefox and in WebKit, the engine
Safari is built on, and in WebKit on an iPhone's screen. Every
[user journey](testing.md#user-journeys) runs in Chromium. Logging in,
trying the app as a guest and reloading in the middle of a study session
run in all four ([testing.md](testing.md#browsers)). These are
Playwright's builds of each engine, not the browsers you install, so no
test runs on a real iPhone.

## Getting in

The first screen offers three ways in
([onboarding.md](onboarding.md)):

- **Try it without logging in.** No account needed. You study as a
  guest, and what you learn is kept in this browser only. A line at the
  top says so, with "Keep my study: log in" and "Discard". When you log
  in later, Solid Memo offers to move your study into your Pod: added to
  an instance you have, or as a new one. You can also discard it, or
  decide later ([guest-mode.md](guest-mode.md)). For example: try it
  as a guest, add a deck from the library and study a few cards. Then
  log in, choose to move your study into a new instance, and the cards
  you studied are in your Pod, each where you left it.
- **Log in with your Pod.** Pick your provider, or type your WebID
  under "Or use your WebID" and press "Log in with Solid". You log in
  on the provider's page and come back to Solid Memo, which reads your
  profile to find your Pod and says "Your Pod is connected." Press
  Continue ([authentication.md](authentication.md)).
- **No Pod yet?** "Create a Pod" opens a provider's sign-up page in a
  new tab. Come back when you are done, and log in.

The first time you log in, Solid Memo asks for a name for your
instance and where in your Pod to keep it. If your Pod has more than
one storage, it asks which one first. After that, logging in takes you
straight to your decks. "Log out", at the top, ends the session.

## On every screen

- **At the top**: the Solid Memo logo, which takes you home; the
  language list (a globe and the language's name); the light and dark
  toggle; and who you are logged in as, with "Log out".
- **The instance bar** names the instance you are in, with "Open in
  your Pod" (or "Kept in this browser", for a guest), and links to its
  **Statistics** and **Preferences**, "Open in Studio" and "Switch
  instance".
- **The breadcrumb** under it shows where you are, such as Decks ›
  Spanish › Browser, and each part is a link back up. The browser's own
  Back and Forward buttons work too, and every screen has its own
  address, so you can bookmark it or open it in a new tab
  ([routing.md](routing.md)).
- **"Skip to content"** is the first thing the Tab key reaches, for
  keyboard users.
- **"Something went wrong"** takes a screen's place if it breaks, with
  the top and the footer still there. **Try again**, or **Go to the
  start**; **Copy details** and **Report it** help you tell the
  project, but nothing is sent unless you send the report
  ([privacy.md](privacy.md#when-something-goes-wrong)).

## Your decks

The deck list is home. From the top:

- **New in Solid Memo**: when the app has new highlights this browser
  has not shown, a card lists them, newest first, under the version's
  number. **Close** puts it away until a later version brings more, on
  this browser only. A first visit shows none, and a version that only
  fixes things brings none.
- **Today**: once you have studied today, a strip with your streak (days
  in a row), a word of praise, and the day's numbers, with a link to
  all your statistics ([statistics.md](statistics.md#the-today-strip)).
  Before you study, a word of welcome back: the streak that studying
  today keeps, a note on it that changes from day to day, and the cards
  left to study today. Once a streak has lapsed, a gentle note to start
  a new one.
- **Your courses**: each course you have added and not finished,
  started or not, how many of its chapters are done, and a button to
  start it or go on where you left off. Courses run alongside your other
  decks: you can add more from the deck library at any time. While all
  your decks are courses, the strip points to the **Deck library**
  ([courses.md](courses.md#the-learners-flow)).
- **Try FSRS-6**: while your instance schedules with SM-2, an
  invitation to switch to FSRS-6, the recommended scheduler: its
  intervals differ clearly by your answer, and it adapts to how late you
  review. **Switch to FSRS-6** switches at once, deck by deck, and says
  how it went; every card stays due on the day it was due, and you can
  switch back in the preferences at any time. **Not now** puts it away
  for good, on every device, as your preferences in the Pod keep it
  ([srs.md](srs.md#the-invitation-to-switch)). A new instance starts on
  FSRS-6, so it is not invited.
- **Decks**: each deck with a **Study** button when cards are waiting
  for you today, or "Done for today". Click a deck's name to open its
  page. A deck copied from the library says "New release" after its
  name when the library has a newer release of it; its page offers the
  update. A newly created instance with no decks offers the library's
  course for newcomers here: "Start the course".
- Each deck's **menu** (the button at the end of its row) offers its
  preferences, Rename, moves up, down and into groups, "Open in
  Studio", and "Delete deck". Drag a deck onto another to make a group,
  and drag decks in and out of groups. Deleting a group keeps the decks
  in it.
- At the bottom: **Create deck**, **Deck library** and **Add from a
  link**.

## A deck's page

Click a deck's name. The page says how many cards are due today and how
many are new, with a **Study** button. It also shows:

- who made the deck, its license and its description, when the deck
  says so, as a library deck does;
- a notice when the library has a newer release of the deck, with an
  offer to update your copy card by card, keeping your changes and your
  progress ([migrations.md](migrations.md#catching-up-with-the-library));
- "Reset today's study", once you have studied the deck today, to undo
  today's answers for this deck ([srs.md](srs.md#resetting-the-day));
- the deck's own statistics in short, with "More statistics" for all
  of them, where its cards stand, and what is hard in it: the cards you forget most, and in a course's deck the wrong
  options you choose most. When some of them are leeches (forgotten 4
  times or more), **Cram the leeches** lets you practice those now
  ([Cramming the leeches](#cramming-the-leeches)).

Its buttons lead to **Preferences** (the deck's name, its own daily
limits, the language its cards are shown in first, and the languages
of its text), the **Browser** (its cards),
and **Open in Studio**.

## Studying

Press **Study**. A session holds the cards due today, plus a few new
ones, mixed in among them ([srs.md](srs.md#study-sessions)).

1. The front of a card is shown. Try to remember the answer.
2. Press **Reveal** (or Space) to see the back.
3. Say how well you remembered it, with the buttons or the number keys.
   The buttons are either a scale from 0 (no memory at all) to 5
   (easy), or Again · Hard · Good · Easy, as you choose in the
   preferences; with FSRS-6 they are always the four. Under each button
   is how long the card would wait before it comes back if you choose
   it.

Pressed the wrong button? **Undo last answer** (or U) takes your last
answer back and shows that card again, as long as the session is open.

A card you answer with **0 — Blackout** or **1 — Wrong**, or with
**Again**, comes back later in the same session. A card you answer with
**2 — Almost** does not come back in that session, but it starts over:
it is due again the next day you study. **Hard**, on the four buttons,
counts as remembered. The better you remember a card, the longer it
waits before it comes back: a day, then a few days, then weeks. That is
spaced repetition, and Solid Memo schedules it with FSRS-6, which a new
instance starts on, or with the SM-2 method when you choose it in the
preferences ([srs.md](srs.md)). "End session", at the top, takes you
back to your decks at any time, and nothing you answered is lost. When
the session is over it says so, with "End session" under it as the next
step and Undo beside it.

A deck you study both ways asks each card front to back and back to
front, each on its own schedule.

A wrong card in a deck from the library, such as a wrong capital or a
bad translation? **Report a mistake**, under the card, opens a report
on the project's issue tracker with the deck and the card already
filled in: say what is wrong. A deck added from a link has the link
when its creator names a page for reports
([deck-library.md](deck-library.md#reporting-a-mistake)).

### Cramming the leeches

A leech is a card you keep forgetting: 4 times or more in its reviews
of the last 12 months. **Cram the leeches**, under a deck's hardest
cards, asks you that deck's leeches right now, whether they are due or
not, in a shuffled order. You answer them as in a study session, and a
card you get wrong comes back later in the cram. At the end, **Cram
again** goes through them once more, as often as you like. Under the
leeches in the statistics, on the Memory tab, **Cram the leeches** does
the same with the leeches of all your decks, the heading naming the
deck of each card.

Nothing in a cram is recorded, as the screen says the whole time: your
answers change neither when the cards are due, nor your statistics,
nor which cards are leeches, so the grades show no interval and there
is no undo. A card stops being a leech only through your normal study
([srs.md](srs.md#cramming-the-leeches)).

## Adding and editing cards

- **Create deck**, under the deck list, asks for a name and the
  language it is in.
- The **Browser**, from a deck's page, lists every card ten to a page.
  There you describe the deck, choose which way it is studied (front to
  back, back to front, or both), add cards, open a card to edit it, and
  remove one. Under the editor, a card's history shows when it comes
  back, how long until then, when you first studied it, and every
  answer you gave it.
- **Add card** opens a form for the front and the back: text, a
  picture, or both, and optional notes. It stays open after each card,
  so you can add many in a row. Check "Format with Markdown" for code,
  lists or tables ([markdown.md](markdown.md#writing-markdown-in-the-app)).

All of this is described in [browsing.md](browsing.md).

## The deck library

**Deck library**, under the deck list, lists ready-made decks
([deck-library.md](deck-library.md#in-the-app)), each with the
languages its cards are in. Search by name, description or keyword, or
narrow the list to topics, or to the decks whose cards are in the
languages you check. Many of the decks
teach a language: Arabic, English, Finnish, French, German, Italian,
Japanese, Korean, Portuguese, Spanish and Swedish. There are four
Arabic decks: Basic Arabic and the most common nouns, verbs and
adjectives.

- Click a deck to read about it: what it covers, who made it, its
  license and sources. From there, **Browse cards** lists its cards.
- **Preview** shows its cards at random, to try before you take it.
  Nothing is recorded.
- **Report a mistake**, on a deck's page and on each of its cards,
  reports a wrong card, its deck filled in.
- **Copy link**, on a deck's page, copies a link to it that anyone can
  open, without an account: someone not logged in tries it as a guest
  ([guest-mode.md](guest-mode.md#from-a-link)).
- Check several decks and press **Import**, or import one from its own
  page. The copy is yours: edit it as you like. A deck you have already
  imported is marked so.
- **Add from a link** adds a deck or a course that someone published in
  their own Pod: paste the link they shared, and Solid Memo shows what
  it is and where it is published before you add it
  ([deck-library.md](deck-library.md#from-a-link)).

## Courses

A course is started, not imported, from its library page, from a
shared link, or from the newcomer offer on an empty deck list
([courses.md](courses.md)).

- **The course's page** lists its chapters, each locked, open or done,
  and a button to go on where you left off, with **Deck library** after
  it: you need not finish a course before adding other decks.
  **Preferences**, beside its title, opens the course's preferences,
  where you can choose the language it is shown in (see
  [Languages](#languages)).
- **A chapter** goes a step at a time. First you read a short piece of
  theory, sometimes in parts ("Part 2 of 3"). Then "Check your
  understanding" asks its questions, with the theory hidden: choose an
  answer (or press its number) and press Check. The app says whether
  you were right and, when you were not, why. The first time you answer
  a question, its card is added to your deck.
- **The final review** comes after a chapter's last step: every
  question of the chapter again, shuffled. One you get wrong comes back
  until you get it right. Pass it and the chapter is done, and the next
  one opens. Finishing the last chapter is celebrated with confetti
  (none if your device asks for reduced motion).

The cards a course added stay in your deck, and you study them like any
other.

## Statistics

**Statistics**, in the instance bar, shows your study over the last
three months; pick another range above the figures: the last 30 days,
the last 12 months, or all time. Its tabs, each a link of its own:

- **Overview**: how many answers and study days, how many cards you
  know now (mature), your current and longest streak and how many of
  the last 30 days you studied, a calendar of your activity and each
  deck's figures. The streaks and the calendar look back a year
  whatever the range, as do this week and month on the Activity tab.
  Over all time, also how many cards you have started, how many have
  grown mature and about how long you have studied. "Download my
  answers (CSV)" saves the range's answers on your device, as a file a
  spreadsheet opens; nothing is sent anywhere.
- **Activity**: what each recent day held and which weekdays you
  study, this week and month beside the last, about how much time you
  spend studying (as your answers recorded it, in courses too, since
  the app began to record it; before, an estimate from when you
  answered, course time not counted) and, folded away, the hours of the
  day you study in, in your current time zone, how many cards you have
  started, how many were young and mature week by week and how long
  their intervals were, how many you knew the first time and how long
  cards took to grow mature, and the new cards you take on beside the
  reviews you do each week.
- **Memory**: how well you remembered your cards in reviews (each
  card's first review of the day, always with how many reviews that
  is), which answer buttons you pressed, your recall week by week (month
  by month over a longer stretch), by how long a card had been away and
  by how late you reviewed it, how you answered course questions,
  counted apart, and your leeches: the cards you forgot 4 times or more
  in their reviews, each a link to the card, whose page shows every
  answer you gave it, and **Cram the leeches** to practice them all now
  ([Cramming the leeches](#cramming-the-leeches)). What is worked out from your answers alone, such
  as how late a review was before the app recorded the day it was due,
  is approximate, and says so: changes made in the Studio are not in
  your answers.
- **Cards**: where your cards stand: how many are new, relearning
  (forgotten last time), young (reviewed at intervals under 21 days)
  and mature, how many reviews are overdue and when your daily review
  limit lets you catch up, how many reviews are coming in the next 30
  days beside those your limit lets through, how long until your cards
  come back and how easy they feel, and when each deck's new cards run
  out. With a course, how far along each course you are, chapter by
  chapter, and how you answered each chapter's questions.

A deck's page sums up its own figures, with "More statistics" for the
same tabs of that deck alone. Above the deck list, today's strip also
says how many cards are left to study today, and about how many
minutes they will take. Point at a bar or a day
to see what it holds, or reach a chart with Tab and step along it with
the arrow keys. Every chart can also be read as a table
([statistics.md](statistics.md)). A guest has statistics too.

Each answer you give, in study or in a course, also keeps how long you
took to recall it, and in study to grade it (not the time the app was
hidden), the day the card was due, and your device's offset from UTC. They stay in your Pod with the rest
of your answers, and nothing turns them off
([privacy.md](privacy.md)).

## Preferences

**Preferences**, in the instance bar:

| Setting | What it does |
|---|---|
| Language | The app's language. Kept on this device. |
| Appearance | Light, dark, or as your browser says. Once saved, kept in your Pod, so every device looks the same ([theme.md](theme.md)). |
| Colors | Standard, High contrast, Color-blind friendly or Parchment (low glare), each shown with a swatch in its own colors, in the light theme and the dark, and any palette you designed. When your device asks for more contrast, the preferences suggest High contrast. "Design a palette" opens the palette editor, and "Reset colors" goes back to Standard. Takes effect right away. Once saved, kept in your Pod, as the appearance is ([theme.md](theme.md#palettes)). |
| Text size | Default, Large, Larger or Largest: up to one and a half times your browser's own text size, which it multiplies. Each has a sample line at its size. Takes effect right away. Once saved, kept in your Pod, as the appearance is ([theme.md](theme.md#text-size)). |
| New cards per day | How many new cards a day brings, 5 to start with. Every new card comes back for reviews in the days after, so it is better to start small. |
| Max reviews per day | A cap on the reviews of one day, 200 to start with. |
| Day starts at | The hour a new study day begins, 4 in the morning to start with, so studying late at night still counts for that day. |
| Scheduler | FSRS-6, listed first and marked Recommended, or SM-2: how each card's next day is worked out ([srs.md](srs.md#switching-the-scheduler)). A new instance starts on FSRS-6; one made before it could choose, or with no preferences saved, is on SM-2 until you switch. Switching to FSRS-6 works out each card's memory from your answers so far, deck by deck, and says how it went; every card stays due on the day it was due. SM-2 is kept up to date on every review, so you can switch back to it at any time; switching to FSRS-6 again works each card out anew. |
| Desired retention | With FSRS-6: how likely you are to remember a card when it comes back, from 70% to 97%, 90% to start with. Higher means more reviews. |
| Answer buttons | 0 to 5, or Again · Hard · Good · Easy. FSRS-6 always uses the four; your choice is kept for SM-2. |
| When data does not conform | What to do when data in your Pod is not in the form Solid Memo expects: block the instance, set the faulty deck aside (the default), or only warn ([validation.md](validation.md)). |
| Developer mode | Shows developer tools: your WebID document, and a check of the instance against Solid Memo's data shapes. |

Press **Save**. A deck's own preferences can set different daily limits
for that deck; an empty field there follows these. They can also show
the deck's cards in another language than the app's
([Languages](#languages)).

Under the settings (not for a guest), **Findable by other apps** shows
whether other Solid apps can find your decks and study through the type
indexes in your Pod, and registers what is missing when you ask
([data-model.md](data-model.md#discovery-chain)).

## Languages

Solid Memo speaks English, Swedish, Korean, German, Spanish and French.
It starts in your browser's language when it speaks it, else English.
Choose another with the globe at the top of any screen, or under
Language in the preferences ([i18n.md](i18n.md)).

Your cards are shown as you wrote them. Each text says which language
it is in, so a screen reader reads it in that language. A deck's
name, its description and a card can have translations, and you see
the one in your language when there is one. A deck's page says when
some of its text does not say its language, with a link to settle it.

A deck whose cards are in several languages can show them in the one
you choose, whatever language the app is in: on the deck's
**Preferences**, choose it under **Card language** and press **Save
card language**. The list offers the languages the deck's cards are
in. Its cards are then shown in that language wherever they appear:
when you study or cram, in the Browser and in the Studio. A card
without text in it is shown as usual, and the deck's name and
description stay in your language. **The app's language** goes back to
the usual. The choice is kept with the deck in your Pod, so it follows
you to every device.

A course can be read in another language too: on the course's
**Preferences**, linked from its page, choose it under **Course
language** and press **Save course language**. The list offers every
language the course is in, its theory and titles as well as its
questions, even before you have answered any. The course's title and
description, its chapters' titles and descriptions, their theory and
its questions are then shown in that language, while the app's own
buttons and words stay in yours. Text the course does not have in it
is shown as usual. This choice too is kept with the deck in your Pod.

Text in a language written right to left, such as Arabic, runs right to
left: on a card, in a deck's name, and inside a sentence in English
too, where it keeps its own direction and the sentence keeps its
punctuation in place. A card's text in Arabic starts at the right. The
screens themselves stay left to right, since none of the app's own
languages is written right to left.

## Theme

The sun and moon button at the top switches between light and dark.
Under Appearance in the preferences, "As my browser" follows your
device's setting ([theme.md](theme.md)). For example: switch to dark,
then press Save in the preferences. Log in on another device, and Solid
Memo opens in dark there too, since the choice is kept in your Pod.

Colors and Text size, under Appearance, change the palette and the
size of the text, in light and in dark alike, and are kept in your Pod
as the theme is. For example: choose High contrast and Larger, then log
in on another device; Solid Memo opens in them there too.

"Design a palette", under Colors, lets you choose the colors you read
best by: a name, the palette it starts from, and a color for the page,
the text, the buttons, the links and the answer buttons, in light and
in dark ([theme.md](theme.md#palettes-of-ones-own)). As you choose, a
preview shows the colors, and a table says whether each pair of colors
that holds text has the contrast it needs. Solid Memo asks before it
saves colors with too little contrast ("Use anyway"), and does not
save text you could not read on the page at all. "Save and use" keeps
the palette in your Pod and shows Solid Memo in it on every device;
"Edit", beside it under Colors, changes it later. Whatever a palette
does, "Reset colors" is drawn in the standard colors, so you can always
find it and go back to Standard.

## More than one instance

"Switch instance", in the instance bar, lists your instances: open
one, create a new one, attach one by its address, or delete one.

For example, to keep your language decks apart from your work decks:
press "Switch instance", create a new instance in another folder of
your Pod, and add decks to it. It starts empty, with its own decks and
its own study. "Switch instance" takes you back to the first one, and
with two instances, Solid Memo asks which to open when you come back.

## Decks to confirm

A deck's cards and progress may be kept anywhere in your Pod: in
another folder, under other names, or right in your Pod's root.
Solid Memo writes to those documents, or deletes them with the deck,
only when they say they belong to the deck, which every document it
writes says. An older document outside the instance's own folder may
not say it yet, and Solid Memo never adds that by itself there, where
someone else's data could be named instead.

Such a deck is listed under **Decks to confirm**, above your decks and
on the Studio's Health screen, with the addresses of its documents.
You can still open it and study it, but no answer or edit is saved to
those documents, and removing the deck removes only it from the list.
If they are the deck's, press **These are this deck's documents**,
check the addresses once more and press **Mark them as the deck's**.
From then on the deck works as any other.

## Solid Memo Studio

"Open in Studio", in the instance bar, on a deck's page or in a deck's
menu, opens Solid Memo Studio: a second app, for managing many decks and cards at once
and for writing decks and courses to publish
([studio.md](studio.md)). Its search finds an Arabic word with or
without its vowel marks: كتاب finds كِتَاب.

Its **Import and export** saves decks as files and makes decks of
files ([studio.md](studio.md#import-and-export)). For example: check a
deck, choose Turtle, check "Include my progress" and press "Export 1
deck": your browser saves the deck as a file. Later, or in another
instance, "Choose a file…" under Import reads that file and says what
it holds. Leave "Import the progress too" checked and press "Import
into", and the file becomes a new deck, with your progress.

Its **Graph** draws what Solid Memo keeps in the instance: its folders,
documents, decks, cards, answers and drafts, each a node, and the links
between them ([studio.md](studio.md#graph)). Drag to move it, and use
the wheel or "Zoom in" and "Zoom out" to zoom; click a node, or reach
it with the arrow keys and press Enter, to see what it says and what it
links to, beside the graph; click an empty place to let go of it. A
link out of the instance, to a library release, a license or your
WebID, ends in a leaf, which is never read. Uncheck "Answers" to see
less, check "Vocabulary terms", last of the row, to see the classes and
concepts the data uses too, or check "Show as a table" to read it all
as two tables.

## The journeys

Each [user journey](testing.md#user-journeys) is a test that clicks
through the app as a learner would. Its numbered steps are the ones in
the [online report](https://journeys.solid-memo.com/), with a
screenshot of each.

| You want to see | Journey | Steps |
|---|---|---|
| Logging in with a WebID and out | [smoke.journey.ts](../e2e/journeys/journeys/smoke.journey.ts) | 01–03 |
| Preferences: new cards per day, the scheduler, answer buttons, developer mode | [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts) | 03, 12, 14 |
| The invitation to switch to FSRS-6, answered Not now, and kept so | full-learner | 03b, 14 |
| Creating decks and adding cards | full-learner | 04–05, 07–08 |
| Studying | full-learner | 06, 13 |
| Grouping decks | full-learner | 09–11 |
| Statistics, and a card's history | full-learner | 15–15b |
| Previewing and importing a library deck | full-learner | 16–17 |
| Narrowing the deck library to the language of the cards | [library-languages.journey.ts](../e2e/journeys/journeys/library-languages.journey.ts) | 02–04 |
| Describing a deck in two languages, and switching language | full-learner | 18–20b |
| Showing a deck's cards in another language than the app's, and back | full-learner | 20c–20d |
| Checking the instance (developer mode) | full-learner | 21 |
| A card in Markdown | [markdown-card.journey.ts](../e2e/journeys/journeys/markdown-card.journey.ts) | 04–07 |
| The course for newcomers, from an empty deck list, and the way to the deck library beside it | [newcomer-course.journey.ts](../e2e/journeys/journeys/newcomer-course.journey.ts) | 03–07 |
| A course's first chapter and its final review | [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts) | 03–08 |
| Showing a course's title, chapters and theory in another language than the app's, and back | course-chapter | 03b–03d |
| A course's answers and chapters in the statistics, and its most-confused options | course-chapter | 09–10 |
| Adding a course from a link and playing it | [studio-course.journey.ts](../e2e/journeys/journeys/studio-course.journey.ts), second journey | 03–05 |
| Solid Memo Studio | [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts) | 06–31 |
| Writing a course in the Studio, trying it and publishing it | studio-course.journey.ts, first journey | 05–11 |
| Trying the app as a guest, and moving the study into a pod | [guest.journey.ts](../e2e/journeys/journeys/guest.journey.ts) | 02–11 |
| Copying a library deck's link, and opening it in another browser as a guest | [try-link.journey.ts](../e2e/journeys/journeys/try-link.journey.ts) | 02–05 |
| A screen that breaks: Something went wrong, its details and its report | [render-error.journey.ts](../e2e/journeys/journeys/render-error.journey.ts) | 02–06 |
| The dark theme, High contrast and Larger text, kept in the Pod and found on a second device | [returning-learner.journey.ts](../e2e/journeys/journeys/returning-learner.journey.ts) | 03–05, 08–11 |
| A palette of one's own, with too little contrast used anyway, found on a third device, then the colors reset | [returning-learner.journey.ts](../e2e/journeys/journeys/returning-learner.journey.ts) | 12–14 |
| A second instance, and switching between the two | [second-instance.journey.ts](../e2e/journeys/journeys/second-instance.journey.ts) | 04–08 |
| Exporting a deck as a file and importing it again, with its progress | studio.journey.ts | 21–23 |
| Switching the scheduler to FSRS-6 from the deck list's invitation, then reviewing with it | [later-day.journey.ts](../e2e/journeys/journeys/later-day.journey.ts) | 03, 06–09 |
| Reviewing on a later study day, forgetting cards, and the hardest cards, with no leech to cram | later-day | 07–12 |
| Welcomed back with the streak before the day's first answer | later-day | 07 |
| Updating a library deck to its new release, its progress kept | [library-upgrade.journey.ts](../e2e/journeys/journeys/library-upgrade.journey.ts) | 04–10 |
| Undoing an answer, and resetting today's study | [reset-day.journey.ts](../e2e/journeys/journeys/reset-day.journey.ts) | 07–12 |
| Reloading in the middle of a study session | [study-reload.journey.ts](../e2e/journeys/journeys/study-reload.journey.ts) | 05–10 |
