# User guide

Solid Memo is a flashcard app. You study cards, and the app brings each
card back just before you would forget it, so a little study every day
goes a long way. Your cards and your study are kept in your own Solid
Pod, not on Solid Memo's servers. You can also try it first in your
browser, without an account.

This page walks through the app as a learner uses it, screen by
screen, at https://solid-memo.com/. Each section links the page that
explains how that part works. The [user journeys](testing.md#user-journeys)
are the same walk-through as automated tests: they click through the
real app in a browser on every change. Their latest run, with a
screenshot of every step, is online at https://solid-memo.com/journeys/.
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

## Getting in

The first screen offers three ways in
([onboarding.md](onboarding.md)):

- **Try it without logging in.** No account needed. You study as a
  guest, and what you learn is kept in this browser only. A line at the
  top says so, with "Keep my study: log in" and "Discard". When you log
  in later, Solid Memo offers to move your study into your Pod: added to
  an instance you have, or as a new one. You can also discard it, or
  decide later ([guest-mode.md](guest-mode.md)).
- **Connect your Pod.** Type your WebID and press "Log in with Solid",
  or pick your provider from the list under it. You log in on the
  provider's page and come back to Solid Memo, which reads your profile
  to find your Pod and says "Your Pod is connected." Press Continue
  ([authentication.md](authentication.md)).
- **Set up your Solid Pod.** No Pod yet? "Create a Pod" opens a
  provider's sign-up page in a new tab. Come back when you are done,
  and choose "I already have a Pod".

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

## Your decks

The deck list is home. From the top:

- **Today**: once you have studied today, a strip with your streak (days
  in a row), a word of praise, and the day's numbers, with a link to
  all your statistics ([statistics.md](statistics.md#the-today-strip)).
- **Your courses**: each course you have started and not finished, how
  many of its chapters are done, and a button to go on where you left
  off ([courses.md](courses.md#the-learners-flow)).
- **Decks**: each deck with a **Study** button when cards are waiting
  for you today, or "Done for today". Click a deck's name to open its
  page. A newly created instance with no decks offers the library's
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
  options you choose most.

Its buttons lead to **Preferences** (the deck's name, its own daily
limits, and the languages of its text), the **Browser** (its cards),
and **Open in Studio**.

## Studying

Press **Study**. A session holds the cards due today, plus a few new
ones, mixed in among them ([srs.md](srs.md#study-sessions)).

1. The front of a card is shown. Try to remember the answer.
2. Press **Reveal** (or Space) to see the back.
3. Say how well you remembered it, with the buttons or the number keys.
   The buttons are either a scale from 0 (no memory at all) to 5
   (easy), or Again · Hard · Good · Easy, as you choose in the
   preferences.

A card you answer with **0 — Blackout** or **1 — Wrong**, or with
**Again**, comes back later in the same session. A card you answer with
**2 — Almost** does not come back in that session, but it starts over:
it is due again the next day you study. **Hard**, on the four buttons,
counts as remembered. The better you remember a card, the longer it
waits before it comes back: a day, then a few days, then weeks. That is
spaced repetition, and Solid Memo schedules it with the SM-2 method
([srs.md](srs.md)). When the session is over it says so; "End session"
takes you back to your decks at any time, and nothing you answered is
lost.

A deck you study both ways asks each card front to back and back to
front, each on its own schedule.

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
([deck-library.md](deck-library.md#in-the-app)). Search by name,
description or keyword, or narrow the list to topics.

- Click a deck to read about it: what it covers, who made it, its
  license and sources. From there, **Browse cards** lists its cards.
- **Preview** shows its cards at random, to try before you take it.
  Nothing is recorded.
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
  and a button to go on where you left off.
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
  answer you gave it. What is worked out from your answers alone, such
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
| New cards per day | How many new cards a day brings, 5 to start with. Every new card comes back for reviews in the days after, so it is better to start small. |
| Max reviews per day | A cap on the reviews of one day, 200 to start with. |
| Day starts at | The hour a new study day begins, 4 in the morning to start with, so studying late at night still counts for that day. |
| Answer buttons | 0 to 5, or Again · Hard · Good · Easy. |
| When data does not conform | What to do when data in your Pod is not in the form Solid Memo expects: block the instance, set the faulty deck aside (the default), or only warn ([validation.md](validation.md)). |
| Developer mode | Shows developer tools: your WebID document, and a check of the instance against Solid Memo's data shapes. |

Press **Save**. A deck's own preferences can set different daily limits
for that deck; an empty field there follows these.

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

## Theme

The sun and moon button at the top switches between light and dark.
Under Appearance in the preferences, "As my browser" follows your
device's setting ([theme.md](theme.md)).

## More than one instance

"Switch instance", in the instance bar, lists your instances: open
one, create a new one, attach one by its address, or delete one.

## Solid Memo Studio

"Open in Studio", in the instance bar, on a deck's page or in a deck's
menu, opens Solid Memo Studio: a second app, for managing many decks and cards at once
and for writing decks and courses to publish
([studio.md](studio.md)).

## The journeys

Each [user journey](testing.md#user-journeys) is a test that clicks
through the app as a learner would. Its numbered steps are the ones in
the [online report](https://solid-memo.com/journeys/), with a
screenshot of each.

| You want to see | Journey | Steps |
|---|---|---|
| Logging in with a WebID and out | [smoke.journey.ts](../e2e/journeys/journeys/smoke.journey.ts) | 01–03 |
| Preferences: new cards per day, answer buttons, developer mode | [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts) | 03, 12, 14 |
| Creating decks and adding cards | full-learner | 04–05, 07–08 |
| Studying | full-learner | 06, 13 |
| Grouping decks | full-learner | 09–11 |
| Statistics, and a card's history | full-learner | 15–15b |
| Previewing and importing a library deck | full-learner | 16–17 |
| Describing a deck in two languages, and switching language | full-learner | 18–20b |
| Checking the instance (developer mode) | full-learner | 21 |
| A card in Markdown | [markdown-card.journey.ts](../e2e/journeys/journeys/markdown-card.journey.ts) | 04–07 |
| The course for newcomers, from an empty deck list | [newcomer-course.journey.ts](../e2e/journeys/journeys/newcomer-course.journey.ts) | 03–05 |
| A course's first chapter and its final review | [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts) | 03–08 |
| A course's answers and chapters in the statistics, and its most-confused options | course-chapter | 09–10 |
| Adding a course from a link and playing it | [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts), second journey | 03–05 |
| Solid Memo Studio | studio.journey.ts, first journey | 06–36 |

Trying the app as a guest has no journey yet. It is tested in the
unit tests and against real Solid servers in `e2e/pod`
([guest-mode.md](guest-mode.md), [testing.md](testing.md)).
