# Statistics

What a learner sees of their own study: a strip above the deck list
that sums up the day, a statistics page for the whole instance, and a
deck's own figures on its page. Everything is worked out in the
browser from what the instance already holds in the pod; nothing is
sent anywhere else.

The figures come from two places. The [answer log](data-model.md#the-answer-log)
is the history: every grade given, kept month by month. The review
states say where each card stands now
([srs.md](srs.md#where-cards-stand)). This page says what each screen
shows and where its code is; how the figures are computed is on those
two pages.

## The today strip

Once the day has answers, a slim strip above the deck list (where a
study session usually ends) says what the day came to:

- **The streak** leads, as what keeps a learner coming back: "3-day
  streak", then a note. On the first day it is "Day one! Come back
  tomorrow for two."; when the streak is the longest yet, "Your longest
  yet!"; else the record to beat, "Record: 12 days".
- **A word of praise** that grows with the day's answers: "Nice work!"
  under 10, "Great session!" from 10, "Impressive effort!" from 50.
- **The day's numbers**: how many answers, how many cards were new, and
  the share of today's reviews remembered with how many reviews it is
  of ("80% remembered of 5 reviews", [below](#what-the-figures-count)),
  then the week's answers so far ("12 this week"), with how they
  compare with the same days of last week when it had any ("+20% on
  last week"), then a link, "All statistics", to the statistics page.
  A day without a review (only new cards, repeats or course answers)
  leaves the share out. While cards are left to study today, due and
  new, the numbers say how many in every deck ("7 left to study
  today"), from the counts the deck list's rows read, once every
  deck's is known, and about how long they will take ("about 6
  minutes to go", [below](#time-spent-and-the-hours-of-the-day)), once
  how long an answer takes is known.

Before the day's first answer, a learner who has studied before is
welcomed back in the strip's place, with the streak that studying today
keeps. Through yesterday's study the streak is still alive, so it
leads, "5-day streak", with a note on it; then the cards left to study
today and about how long they will take, as in the strip, so the note
ends in something to do. The note changes each study day, so a learner
who opens the app and leaves again does not read one line on every
visit:

- **When one more day ties or beats the record**, the note says so:
  "One more day ties your record of 9." or "Study today for a new
  record!".
- **Else** it takes, one a day in turn, "Welcome back! Study today to
  make it 6.", "Keep it going: 5 days and counting.", "Your 5-day
  streak is waiting for today's cards." and "One session keeps your
  streak alive.".
- **Once the streak has lapsed**, there is no streak to show, and a
  gentle note takes its place, one a day in turn: "Start a new streak
  today.", "Welcome back! A few cards today begin a new streak.",
  "Every streak begins with day one. Today can be it.", "Your record
  is 9 days. Start a new streak today." and "Good to see you again.
  Your cards are ready when you are.".

The study day picks the note, not chance: it stays put while the list
reads again within a day, and the next day takes the next one. With no
study day in the last 12 months there is nothing to come back to, and
no note. After the day's first answer the strip takes its place. When
the answers cannot be read there is neither: the deck list works
without them.
It reads the last 12 study months, whatever range the statistics page
opens on, so the record is the year's; that is the page's own read when
its range is the last 12 months, so the two never read them twice.
Every change made clears that read, an answer in a session or a course
among them, so the strip is up to date after a session; otherwise it is
read again when the list opens and what was read is over half a minute
old ([below](#loading)).

Code: [TodaySummaryContainer.tsx](../packages/ui/src/ui/TodaySummaryContainer.tsx)
reads the statistics and [TodaySummary.tsx](../packages/ui/src/ui/TodaySummary.tsx)
shows them; `todayOf` in [statistics.ts](../packages/domain/src/statistics.ts)
picks the day out.

## The statistics page

`#/statistics?instance=…&range=…&view=…` ([routing.md](routing.md)),
linked as "Statistics" from the instance bar on every screen of an
instance, and from the today strip.

Above the figures, the **range** they are of: the last 30 days, the
last 3 months (the default), the last 12 months or all time. Under it,
four **tabs**: Overview, Activity, Memory and Cards. Both are in the
URL (`range`, `view`), so a tab can be bookmarked or opened in a new
browser tab, and a change of either replaces the history entry: Back
leaves the page rather than walking its tabs. The tabs are links, and
a `tablist`: the arrow keys, Home and End move along them; on a phone
their strip scrolls sideways in its own box. Before any answer the
first three tabs say that the statistics begin with the next study
session; the Cards tab shows where the cards stand anyway. A range
with no answers, in a log that has some, says so instead, and that a
longer range may show earlier ones.

The figures that run up to today look back as far as the activity
calendar, its 52 weeks (or the whole log, for all time), whatever the
range, so a short range does not cut them short: the streaks, the days
studied of the last 30, the calendar, what each day held, this week and
month beside the last, and the new cards beside the reviews by week.
The rest are the range's.

A note comes first on the overview, activity and memory tabs, "Since
March 2026, your first month of study.", when the answer log begins
inside the range read (always so for all time): the figures that need
the answers before them, such as how long cards took to grow mature,
cannot reach further back. Each tab, from the top:

| Tab | Part | What it shows |
|---|---|---|
| Overview | Tiles | Answers, Study days, Cards studied, Cards you know (the cards mature now, from where the cards stand), Current streak, Longest streak, and how many of the last 30 days were studied ("12 of 30 days", with its share). A streak is study days in a row; the current one still counts while today is not studied yet. |
| Overview | All time | Only for all time: how many cards were introduced, and how many have grown mature (reached an interval of 21 days), over the whole log, each card once, whatever came after; and about how long was studied over the whole log, recorded since the first answer with a time ("Recorded since …, estimated before") and estimated before it ([below](#time-spent-and-the-hours-of-the-day)), a dash while no time is known. With the tiles above and the cards introduced over time, all of them the whole log's then, the longest streak among them, that is how far the learner has come. |
| Overview | Activity calendar | A calendar of the last 52 weeks, whatever the range, a column a week, each day as green as its share of the busiest day's answers. |
| Overview | By deck | A block a deck, as many to a row as fit (one on a phone, two on a larger screen), so nothing scrolls sideways: under the deck's name, its answers and the day it was last studied ("12 answers · last studied September 21, 2026"), then its figures, each under its label: cards introduced, young and mature recall, first try, lapses, graded course answers and recall each way (for a deck with reviews both ways, a direction a line). A share shows its count under its percent, as a tile does, and a share of nothing (no reviews, no course answers) is left out. Ten figures a deck are too many for a table's row in the page's column ([ByDeckStatistics.tsx](../packages/ui/src/ui/ByDeckStatistics.tsx)). A deck since removed is "A removed deck". |
| Overview | Download my answers (CSV) | Saves the range's answers, of every deck or of the deck, as a CSV file on the learner's device (`UseCases.saveAnswers`, `answersCsv` in [answerCsv.ts](../packages/domain/src/answerCsv.ts)): a row an answer, oldest first, with every column the log has (`answered_at`, `study_day`, `deck`, `card`, `direction`, `grade`, `mode`, `prior_interval_days`, `next_interval_days`, `chosen_distractor`, `recall_millis`, `grade_millis`, `prior_due`, `utc_offset_minutes`), named in English whatever the page's language. It is handed to the browser to save as any download; nothing is sent anywhere. |
| Activity | What each day held | The last 30 days as stacked bars: reviews remembered, cards new that day, lapses and repeats, a step of the green each, named in a legend. A course answer to a card seen before is none of these, so it counts only among the day's answers, in the table. |
| Activity | Answers by weekday | A bar a weekday, Monday first: its answers divided by how many of that weekday there have been since the first study day read, and in the table how many of them were studied ("3 of 4"). |
| Activity | Time spent studying | About how long the range's answers took, and on a study day on average; how many sessions, and a study day's on average; the median time an answer took. Then the last 30 days as bars of minutes, each day's sessions in its words and the table. Its note says since when the answers' own times are counted, in courses too, and that the time before is estimated, course answers left out; and how many of the range's answers since have no time and are not counted. Before any time is recorded, the note says how it is estimated. Always "about": recorded times are rounded, and the rest estimated ([below](#time-spent-and-the-hours-of-the-day)). Dashes while no time is known; the median a dash while no recalled answer has a time and no session before had two answers. |
| Activity | Answers by hour of the day | Folded away until opened: a bar an hour, from the hour the study day begins (the preferences' day boundary) round to the one before, so one study day reads as one run, with every sixth hour named under the bars and a table with the total. In the viewer's current time zone, which the note says. |
| Activity | This week so far, This month so far | Answers, study days, cards introduced and recall from Monday (as the calendar's weeks) or the month's first up to today, each with the same days of the week or month before under it: last week's Monday up to today's weekday, last month's first up to today's date (or its last day, when it was shorter). |
| Activity | Progress | "Cards introduced over time": a running total of the cards seen for the first time, over the range. "Young and mature cards over time": at the end of each week of the range, how many cards were young (dashed) and how many mature (solid), as their last answers by then left them; relearning ones are in the table. "Memory span": at the end of each week, the median of the intervals those answers gave, in days. Both are approximate ([below](#growth-and-depth-of-memory)). "First try": the share of cards remembered the first time they were seen. "Time to mature (median)": the median study days, and the median reviews, from a card's introduction to the answer that first gave it an interval of 21 days or more, of the cards that grew mature in the range, with how many they are. "New cards and reviews, by week": the cards introduced beside the scored reviews done, a pair of bars a week for the last 12 weeks: when the new cards keep outpacing the reviews, the reviews due further down show what they bring. |
| Memory | Remembered in reviews | Two tiles, young and mature cards: the share of reviews remembered, with how many reviews it is of. Then "Answer buttons": for first answers and for young and mature reviews, a bar of the buttons pressed, Again, Hard, Good and Easy, with every count in the table. Then "Recall by week", the same split week by week, young as a dashed line and mature as a solid one, while the reviews fall in the last 14 weeks (so a range of 90 days always does); over a longer stretch "Recall by month" instead, whose table adds each month's first tries. Then "Recall by interval": for each span of intervals the histogram of intervals uses (1 day, 2–3, 4–7 and so on), the share of the reviews after it remembered, as a bar on a scale of 0 to 100%, with how many reviews it is of; its note names the SM-2 steps, so a span with few reviews reads as such. Then "What a late review costs": the share remembered of the reviews done on time, 1–2, 3–6, 7–29 and 30 days or more late, early (or moved to an earlier day in the Studio) and of unknown lateness, approximate, as its note says; under it, once there are reviews both on time and late, "Reviews done on time: 90% of 10 reviews remembered. Done late: 25% of 4 reviews." Both charts show before any review too, every span "no reviews". Left out (first try and the answer buttons too) when there is no review but there are course answers, as for a learner who has only taken a course. |
| Memory | In courses | Only with course answers: the share of graded course answers that were right, with how many there were. |
| Memory | What is hard | Once there are reviews: "Leeches across your decks", every card in use forgotten 4 times or more (lapses) in its reviews of the last 12 study months, the most forgotten first, then the largest share of its reviews forgotten. Each is a link to the card's page, with how often of how many reviews and its deck. A deck since removed has no cards left to name or open, so its leeches are not listed. Under them, when there is one, **Cram the leeches**, a link to cram every deck's leeches together, which records nothing ([srs.md](srs.md#cramming-the-leeches)). |
| Cards | Where your cards stand | How many cards are new, relearning, young and mature, as one bar. Two tiles: how many reviews are overdue (due before today), and the day the daily review limits let through every review they hold back, studying each day ("Today" when they hold none back; past the 30 days, "Not within 30 days" with how many still wait then). Each deck's limit is its own, so the day is worked out deck by deck and the latest taken. Then, for each of the next 30 days, the reviews falling due (today's with every overdue one) beside those the limits let through; how the studied cards' intervals are spread (days until they come back), and, folded away, how easy they feel (their ease). Then each deck's own bar, with the day its new cards run out at its own new-card limit, studying each day, today with only what is left of the limit after the new cards already met today, as the study queue has it ("never" at a limit of 0); a course's deck is left out of that, as its cards join it when their questions are answered. |
| Cards | Your courses | Only with a course among the decks: each course, a link to its page, with its chapters completed out of all ("1 of 3 chapters done", and as a bar), then a table of its chapters: where each stands (done, open or locked, as the course's page says) and its graded course answers of the last 12 study months, the share right with how many there were. A question counts toward the chapter whose step or final review asks it; nothing in it is particular to one course: the chapters are the course's release's, the chapters completed its deck's, the answers the log's. |

A card is *young* while it is reviewed at an interval under 21 days and
*mature* from 21 days on. A card forgotten last time and not remembered
since is *relearning*, whatever its interval: SM-2 leaves it no
repetition in a row ([srs.md](srs.md)), as the Studio's "learning"
state does; it is no beginner's stage, as a card passed once is not
back in it until it is forgotten. SM-2 spaces a card's reviews 1 day,
6 days, then about 15 and about 38, growing from there, so some bins
of the interval chart stay nearly empty; its caption says so, and
that FSRS-6 spaces them by each card's memory instead. A card studied both ways counts once each
way, and the page says so.

Under FSRS-6 ([srs.md](srs.md#fsrs-6)) the intervals are FSRS-6's:
those in the answer log, which it records from the scheduler that set
each due day ([data-model.md](data-model.md#the-answer-log)), and
where the cards stand now, the interval of each prompt's fresh FSRS-6
state (the study days from its last review to its due day), else its
SM-2 state's. Relearning stays SM-2's to say, by its repetitions, which
SM-2 keeps up to date on every review; so does the ease chart, folded
away, which is SM-2's ease. A share is always shown with the count it is
of, however small, so that "100%" of one review reads as what it is.

Every chart can be read without seeing it. Pointing at a day, a weekday,
a week, a month or a part of a bar (or tapping it) puts what it held in
words under the chart, and "Show as a table" lists the same figures. The
keyboard reaches the same words: each chart is one tab stop (each bar of
the answer buttons with answers is one), Left and Right step along its
points, Home and End go to the first and the last, and Escape lets go;
in the calendar, Left and Right step a week and Up and Down a day
(`usePoint`). The line under the chart is the chart's description, so a
screen reader that reaches the chart says how to step through it; keys
pressed with Alt, Control or Meta are left to the browser. A point
reached by the keyboard is said once more in a status line, so a screen
reader reads each step out, while sweeping the pointer stays quiet. A
screen reader that reads the page in browse mode keeps the arrow keys
for itself: its focus mode passes them on, and the tables say the same.
Only shades of one green are used, each at 3:1 or more on the
surfaces (4.5:1 in High contrast), as WCAG 1.4.11 asks of a chart's
marks, with a surface gap between steps that touch; where two lines
meet, a dash or a legend tells them apart, and where bars hold several
series, a legend names each step of the green. In forced-colors mode
the steps keep apart as empty, hatched and filled. The histograms are the Studio's own,
shared from the UI package.

The page reads three things on their own, so none waits for another:
the answers of the range (`UseCases.getStatistics`);
the cards and review states of every deck with, for what is hard, the
last 12 study months of answers, whatever the range
(`UseCases.getCardProgress`); and, with a course among the decks, how
the courses have gone (`UseCases.getCourseStatistics`), from the same
12 months and each
course's outline, which the library reads once a page load. A course
whose outline cannot be read is left out. All three ask for the months
at once, and a month already being read is read once for all (unless
an answer was written meanwhile, which that read may miss); after that,
what is kept serves each. The months are read beside the decks' cards,
and only what is hard needs them: when they cannot be read, what is
hard is left out and where the cards stand still shows. When the cards
cannot be read, a quiet line says so and the rest of the page works on;
when the courses cannot be, they are left out.

## Loading

The answer log is the large part: one to three megabytes of Turtle a
month, by server, for a learner who answers a hundred cards a day. So:

- **Each month is read once a page load, then only when it changed.**
  `getStatistics` and the Studio's `loadAnswerLog` share one cache of
  the months read, by their ETag: a month already read costs a `304`.
  A read of some months adds to it, never replaces it, so the 12 months
  read for the statistics and the whole log read by the Studio do not
  undo each other; a month the log no longer lists is dropped. The
  month being studied changes with every answer, so it is read again
  after studying. A server that sends no ETag (Node Solid Server) is
  read whole every time.
- **What was read is shown again for half a minute** (`staleTime`) on
  the statistics page, a deck's page and the today strip, so moving
  between them reads nothing. Every change made clears the statistics,
  the courses' figures among them, and where the cards stand at once,
  as it ends (whether it was written or not): an answer, a card or deck
  added, edited or removed, a deck's pace, the preferences, a guest's
  study brought over, a Studio edit.
  Each is a mutation, and the app clears them after every mutation
  (`keepStudyFiguresFresh` in
  [studyFigures.ts](../packages/ui/src/ui/studyFigures.ts)), so a new
  kind of change cannot be left out. A change made on another device
  shows once what was read is half a minute old. The courses' figures
  are also read again when a chapter is completed, as the chapters
  completed are part of what they are kept by.
- **The range read.** `getStatistics` reads the last 12 study months
  by default, or `range`: the last so many study days, or the whole
  log (`"all"`). It also reads the activity calendar's 52 weeks
  (`calendarStartOf`) when the range begins after them, for the figures
  up to today: `statisticsOf` counts the range's answers from its first
  day (`since`), and those figures, with `recentDays`, from every answer
  read. The months read are the same the today strip's read takes in,
  so they come from the shared cache. Its result's `coverage` is the
  log's first month when the log begins inside the range, and
  `logBegins` the log's first month, for the empty range's message.
  The page's ranges are 30 days, 90
  days (its default), getStatistics' own 12 months and `"all"` (`rangeRead` and
  `statisticsQuery` in
  [studyFigures.ts](../packages/ui/src/ui/studyFigures.ts)), each
  read once and kept apart; the last 12 months are kept under the
  today strip's key, so the strip and the page share that read. All
  time downloads the whole log once a page load, as the Studio's
  `loadAnswerLog` does, and on a server without ETags at every visit.

Measured against a real server (`history.integration.test.ts`, run
with `MEASURE_ANSWER_LOG=1`; [testing.md](testing.md)), for 100
answers a day, on a development machine with the server on it:

| Server | Read | Answers | Downloaded | First read | Turtle parsed | Figures | Read again |
|---|---|---|---|---|---|---|---|
| Community Solid Server 7 | 12 months | 36,500 | 36.8 MB | 2.4 s | 1.0 s | 0.07 s | 0.2 s (12 × 304) |
| Community Solid Server 7 | All, 24 months | 73,000 | 73.6 MB | 4.5 s | 2.0 s | 0.14 s | 0.4 s (24 × 304) |
| Node Solid Server 6 | 12 months | 36,500 | 13.4 MB | 1.1 s | 1.0 s | 0.07 s | 1.1 s (no ETag) |
| Node Solid Server 6 | All, 24 months | 73,000 | 26.7 MB | 2.2 s | 2.0 s | 0.14 s | 2.1 s (no ETag) |

Parsing costs about 27 µs an answer whatever the server writes;
Community Solid Server writes every IRI in full, so it sends almost
three times the bytes. Read again, the log costs a request a month and
no parsing.

## A deck's own figures

A deck's page (`#/deck`) sums up its figures of the last 3 months,
once it has answers in them: the young and mature recall tiles, recall
each way when it has reviews both ways, first try and, with course
answers, the graded course answers tile (alone for a deck studied only
in a course's chapters). Under them, always, "More statistics", a link
to the rest, whose longer ranges reach a deck's older answers
([DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx)).
That read is the deck's statistics page's at its default range, so
following the link reads nothing again. Then where its cards stand,
all new before the first answer, with a tile for the day its new cards
run out (none for a course's deck, or once none is new). Then what is
hard in it, from its answers of the last 12 study months
([HardestCardsContainer.tsx](../packages/ui/src/ui/HardestCardsContainer.tsx)):
"Hardest cards", the ten cards in use forgotten most often in their
reviews, ranked as the leeches are, a leech marked as one, each a link
to its page (none for a deck without reviews), and under them, when one
is a leech, **Cram the leeches**, a link to cram the deck's leeches, which
records nothing ([srs.md](srs.md#cramming-the-leeches)); and, for a deck with
course answers, "Most-confused options": the wrong options chosen most
often, each with its card and how often (`confusionsOf`).

The deck's statistics page, `#/deck-statistics?instance=…&deck=…`
(under the deck in the breadcrumbs: Decks › *deck* › Statistics), has
the range and the tabs of the statistics page, of the deck's answers
alone: its own activity calendar on the overview, without the figures
by deck; recall each way on the memory tab when it has reviews both
ways, with its hardest cards and most-confused options in place of the
leeches across decks; its own cards and, for a course's deck, its
course on the cards' tab. Its download holds the deck's answers only.

## A card's history

A card's own page (`#/card`) ends with its history
([CardHistory.tsx](../packages/ui/src/ui/CardHistory.tsx)): for each
direction it has a review state, its interval and its next review, as
the scheduler that sets the due days has them (FSRS-6's while it does,
`effectiveStates`), and the
study day it was first studied on (by the day's boundary hour, as the
answers' days are); then every answer to it in its deck, from
the whole answer log (`UseCases.cardAnswers`, as the Studio's card
inspector reads it), newest first, as a table: the study day, which way
(when the card is asked both ways), what kind of answer it was (a first
answer, a review, again the same day, or a course question), the
button pressed (Again, Hard, Good or Easy, as the answer buttons count
them) or, for a course question, right or wrong and the wrong option
chosen, and the interval it gave. A card not studied yet says so.

## What the figures count

Recall, lapses and course answers need more than one answer to tell:
whether an answer repeats another to the same prompt that day depends
on the prompt's earlier answers. [answerChain.ts](../packages/domain/src/answerChain.ts)
groups the answers by prompt (deck, card and direction) in the order
they were given, once for each set of figures, and the definitions
below read those chains.

| Term | Definition |
|---|---|
| Introduction | A prompt's first answer: one without a prior interval that is not a repeat (`isIntroduction`). A Studio "forget" makes the next answer one again, unless it comes the same study day, when it is a repeat. |
| Repeat | An answer to a prompt after its first answer that study day: a card failed and put back in the session, or a course question answered again in the chapter's review. A study day is never split between months, so this never depends on how many months are read. |
| Scored review | An answer to a prompt already introduced, not a repeat, recalled and graded by the learner (not chosen among a course's options): `isScoredReview`. |
| Recall | Scored reviews remembered (graded 3 or more) of all scored reviews, young and mature apart by the interval before the answer. |
| Lapse | A scored review graded below 3: `isLapse`. A leech is a card with 4 lapses or more, in either direction (`LEECH_LAPSES`). The hardest cards are those with lapses, the most first, then the largest share of their scored reviews (`hardestCardsOf`). |
| First try | Prompts remembered (graded 3 or more) at their first introduction, of the prompts introduced, each counted once, recalled and graded only: only a prompt's first answer read counts, so a prompt introduced again after a Studio "forget", or after reviews of a card seen before the months read, is no first try, and a course's first answers are its graded course answers. Per deck and per month too. |
| Answer buttons | The grade of each introduction and scored review, recalled and graded only, as the button that gives it: 0 to 2 Again, 3 Hard, 4 Good, 5 Easy. The four buttons give 1, 3, 4 and 5, so both scales read the same. |
| Graded course answers | Right multiple-choice answers of the multiple-choice answers that are not repeats. They are never called recall: practice answers, and right answers to a card already graded that day, are not logged ([srs.md](srs.md#multiple-choice-answers-in-a-course)), so this is not every answer given in a course. |

### Growth and depth of memory

[memoryCurve.ts](../packages/domain/src/memoryCurve.ts) reads the same
chains for how memory grows. The log holds the answers only, not the
Studio's edits, so what it replays is approximate, and the page says
so.

| Term | Definition |
|---|---|
| Recall by interval | Scored reviews remembered of all scored reviews, binned by the interval before them (`INTERVAL_BOUNDS`, shared with the interval histogram): `recallByInterval`. |
| Lateness | For a scored review, its study day less the day it was due: the day it recorded (`priorDue`, since vocabulary 1.19), which needs no earlier answer read and follows a Studio reschedule; else the day the answer before it to the same prompt fell due (that answer's study day and the interval it gave): `latenessOf`. Without `priorDue` it is unknown when that answer is not among those read, when the review starts its chain (a card moved with its progress), or when the review's prior interval is not the interval that answer gave (an edit in the Studio). Negative is early, as is a review the Studio moved to an earlier day. Without `priorDue`, a review the Studio moved to a later day keeps its interval, so it shows as late; either way, one the daily review limit held back shows as late. Grouped on time (0), 1–2, 3–6, 7–29 and 30 days or more late, early and unknown: `recallByLateness`. |
| Where the cards stood | Each prompt as its last answer by the end of a week left it: relearning when that answer was below grade 3, else mature at an interval of 21 days or more and young under it. Replayed over every answer read, so the range's first week starts with the prompts studied before it: `memoryOverTime`. A Studio "forget" starts the prompt over at its next answer; a card moved with its progress (a chain in another deck, of the same card id and direction, starting from the interval the old one ended on, no sooner than that interval ran out, and the old one never answered again) leaves its old deck then; library decks share card ids, and those checks keep a namesake whose chain began before the answers read from being taken for a moved card. An interval in the pod below 0 or beyond a century counts in the median as 0 or a century. Removed decks and retired cards stay counted as they were last answered. |
| Memory span | The median of those prompts' last intervals at the end of each week (kept in a binary indexed tree, so a week costs the logarithm of the longest interval, not the prompts). |
| Time to mature | Of each segment that starts with an introduction among the answers read, the study days and the answers (repeats left out) from the introduction to the first answer that gives an interval of 21 days or more, when that answer falls in the range; the medians are shown: `timeToMatureOf`. A card introduced before the answers read is left out, as its start is unknown. |

The range's figures are of its answers, but lateness, where the cards
stood and the time to mature also read the answers before the range
that the page reads anyway (the activity calendar's 52 weeks, or the
whole log), so a review early in the range still has the answer before
it. Course answers change a card's schedule, so they count in where
the cards stood, but never in recall.

### Time spent and the hours of the day

An answer before vocabulary 1.19 records when it was given, not how
long it took. Since then an answer records its own response times and
the device's offset from UTC
([data-model.md](data-model.md#the-answer-log), [below](#response-times)).
[studyTime.ts](../packages/domain/src/studyTime.ts) counts the times
recorded from the first answer read that has one, and estimates the
time before it from the pauses between answers. Every figure of it says
"about", as recorded times are rounded and the rest estimated.

| Term | Definition |
|---|---|
| Times recorded since | The first answer read, by when it was given, with a recorded time (`firstTimedOf`), of every answer `statisticsOf` is given, so a range that begins later still counts its answers as recorded. One deck's statistics take it from every deck's answers read (`getStatistics`), so they agree with the whole log's on which answers are recorded, unknown or estimated. |
| Recorded time | From then on, an answer took its `recallMillis` and `gradeMillis` together; a course answer, its `recallMillis` (`recordedTimeOf`). Course answers count from then on, as their questions are timed. An answer without them (given in a tab from before 1.19, or graded after ten minutes away) is unknown: not counted, and the note says how many. |
| Session | The answers counted (recalled ones before times were recorded, every answer with a time after) in the order they were given; a pause of 5 minutes or more (`SESSION_GAP_MS`) begins a new one. A session counts on the study day of its first answer; a day that only carries one on from the day before says so, rather than "0 sessions". |
| Time an answer took | Its recorded time; before times were recorded, the pause before it within its session, up to a minute (`ANSWER_CAP_MS`): a longer one was mostly spent elsewhere. A session's first answer has no pause before it, so it takes the median of its session's others, or, alone in its session, the median of every session's. While no session has had two answers there is no median, and no time is counted: `estimateStudyTime`. |
| Median time an answer took | Of the recalled answers with a recorded time, once there is one; else of the pauses estimated. It is what the time left today goes by. |
| Course answers before times were recorded | Left out: what a chapter shows before its questions takes time no answer tells, so time in courses then is not counted, as the page says. They do count by the hour. |
| Time left today | (Reviews left + new cards left + the reviews expected back) × the median time an answer took, where the reviews expected back are the reviews left times the share of young reviews forgotten over the strip's 12 months (none before any): `expectedTimeToday`. Shown in whole minutes, one at least. |
| Hour of the day | Each answer by the hour it was in the viewer's current time zone when the page is read (`answersByHour`), not where it was given, so a learner who traveled sees those answers shifted. |

### Response times

Since vocabulary 1.19 each answer says how long it took and where it
was given, measured by the screen that asked it and kept in the answer
log ([data-model.md](data-model.md#the-answer-log)). Nothing is asked
of the learner and nothing turns it off; [privacy.md](privacy.md) says
so.

| Field | How it is measured |
|---|---|
| `recallMillis` | In study, from the card shown to Reveal; in a course, from the question shown to the option checked (`useStopwatch` in [stopwatch.ts](../packages/ui/src/ui/stopwatch.ts), on `performance.now()`). The time the page is hidden is left out. |
| `gradeMillis` | In study, from Reveal to the grade, measured the same way; when saving failed and the learner grades again, to the last grade pressed. A course answer has none. |
| Either | In whole milliseconds, and left out above ten minutes (`MAX_RESPONSE_MILLIS`, `recordedResponseTimes` in [answer.ts](../packages/domain/src/answer.ts)): by then the learner was away, not thinking. An answer given without a screen timing it, as the Studio's trial plays the days to come, has neither. |
| `priorDue` | The prompt's due day before the answer, from its review state (`applyGrade`); none on a first answer. |
| `utcOffsetMinutes` | The device's offset from UTC as the answer is given (`utcOffsetMinutesAt`). |

### Why the figures changed

Before this, recall and "remembered" counted every answer with a prior
interval, and a lapse was any answer below grade 3. That made them
read better and worse than the learner's memory was:

- A card failed and put back in the session is answered again minutes
  later, with a prior interval of a day, and usually right. Each such
  repeat counted as a young review remembered, so young recall, and
  today's "remembered" most of all, came out too high. The strip's
  share was of every answer of the day, first answers and course
  answers included.
- Course answers are chosen among options, graded 3 or 1, and only
  partly logged; they counted as recall.
- A card failed when it was introduced, and every repeat failed the
  same day, counted as a lapse, so leeches came early, in the Studio
  too.

The figures a learner sees therefore changed with this definition:
recall and the strip's share are of scored reviews only and usually
lower for young cards, course answers have their own figure, and
lapses and leeches count review lapses only, so the Studio shows fewer.
Nothing in the pod changed: the same answer log is read differently.

## Where the code is

| Layer | Files |
|---|---|
| Domain | [answerChain.ts](../packages/domain/src/answerChain.ts): the chains, repeats, scored reviews and lapses. [memoryCurve.ts](../packages/domain/src/memoryCurve.ts): recall by interval, by lateness and by week, where the cards stood and their median interval week by week, and the time to mature. [studyTime.ts](../packages/domain/src/studyTime.ts): the time studied, recorded or estimated, sessions and time left today, and the answers by hour. [statistics.ts](../packages/domain/src/statistics.ts): activity by study day, totals, streaks, recall, recall by month, graded course answers, each deck's figures, the running total of cards introduced, the prompts introduced and grown mature (`promptGrowthOf`), and `todayOf`. [answerCsv.ts](../packages/domain/src/answerCsv.ts): the answers as CSV. [studyPatterns.ts](../packages/domain/src/studyPatterns.ts): the answer buttons, first try, this week and month beside the last, the days studied of the last 30, the weekdays, recall each way, and the new cards beside the reviews by week. [cardProgress.ts](../packages/domain/src/cardProgress.ts): new, relearning, young and mature, and when new cards run out. [cardHistory.ts](../packages/domain/src/cardHistory.ts): a deck's answers as its cards are named now, a card's answers, lapses, the hardest cards and the wrong options chosen most. [course.ts](../packages/domain/src/course.ts): `courseProgressOf`, a course's chapters done and its graded answers chapter by chapter. [scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts): the forecast, the interval and ease histograms, shared with the Studio, what is overdue and the days the daily limit takes to catch up. |
| Application | `getStatistics`, `saveAnswers`, `getCardProgress` and `getCourseStatistics` in [useCases.ts](../packages/application/src/useCases.ts): which months and documents to read; `readLogMonths` keeps the months read, for `loadAnswerLog` too, and reads a month asked for twice at once only once. `cardAnswers` for a card's history. |
| UI | [StatisticsContainer.tsx](../packages/ui/src/ui/StatisticsContainer.tsx) (the page, of the instance or of a deck), [StatisticsScreen.tsx](../packages/ui/src/ui/StatisticsScreen.tsx) (its range and tabs) and [StatisticsSections.tsx](../packages/ui/src/ui/StatisticsSections.tsx) (the overview, activity and memory tabs), the `statistics` and `deckStatistics` routes in [router.ts](../packages/ui/src/ui/router.ts), [CardProgressContainer.tsx](../packages/ui/src/ui/CardProgressContainer.tsx) (where the cards stand), [HardestCardsContainer.tsx](../packages/ui/src/ui/HardestCardsContainer.tsx) and [HardestCards.tsx](../packages/ui/src/ui/HardestCards.tsx) (what is hard, from the same read, and the leeches a cram crams, `leechesOf`), [CramContainer.tsx](../packages/ui/src/ui/CramContainer.tsx) (a cram of the leeches, from that read too), [CourseStatistics.tsx](../packages/ui/src/ui/CourseStatistics.tsx) (your courses), [CardHistoryContainer.tsx](../packages/ui/src/ui/CardHistoryContainer.tsx) and [CardHistory.tsx](../packages/ui/src/ui/CardHistory.tsx) (a card's history), [charts/](../packages/ui/src/ui/charts/) (tiles, calendar, bar charts stacked or side by side, histograms, line charts, the answer buttons and maturity bars, a module each, gathered for the Studio in [StatisticsCharts.tsx](../packages/ui/src/ui/StatisticsCharts.tsx)), [DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx) and the today strip above. |

The statistics are the same for a guest ([guest-mode.md](guest-mode.md)),
whose answers are kept in the pod in their browser and move with the
rest of their study when they log in.

## How it is tested

- **Unit tests** at 100% coverage, as everywhere
  ([testing.md](testing.md)): `answerChain.test.ts`,
  `statistics.test.ts`, `memoryCurve.test.ts` (a forget, a move with
  its progress, a reschedule, introductions before the answers read), `studyTime.test.ts`, `answerCsv.test.ts`, `studyPatterns.test.ts`, `cardProgress.test.ts`,
  `cardHistory.test.ts`, `scheduleInsight.test.ts` and
  `course.test.ts` in the domain,
  the passes over the whole log (`chainIndexOf`, `statisticsOf` and the
  answer buttons, first try, recall each way, where the cards stood,
  the estimated time and the hardest cards) held to linear growth,
  the use cases in `useCases.test.ts`, and `StatisticsScreen.test.tsx`,
  `StatisticsSections.test.tsx`, `router.test.ts`, `Workspace.test.tsx`
  (the range and tab in the URL, the deck's statistics route),
  the chart tests in `charts/`, `CardProgressContainer.test.tsx`,
  `HardestCardsContainer.test.tsx` (the links to cram, only with a leech),
  `CramContainer.test.tsx` (a cram calls no use case but its reads and
  leaves the cached reviews, queue and progress as they were),
  `CourseStatistics.test.tsx`,
  `CardHistoryContainer.test.tsx` and
  `TodaySummary.test.tsx` in the UI; `StudyContainer.test.tsx` and
  `ChapterPlayerContainer.test.tsx` check that an answer clears the
  statistics.
- **Against real servers**: `history.integration.test.ts` checks that
  the statistics and the whole log share the months read, a month read
  again only once it changed, that lateness, where the cards stood and
  the time to mature follow a card across months (journeys cannot
  span days), and measures a large log when asked
  ([above](#loading)).
- **User journeys**: in
  [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts),
  step 13 checks that the today strip counts each session's answers as
  soon as it ends, and step 15 opens the page after two decks were
  studied, one card answered Again and then once more, and checks the
  tiles (the repeat is no review), the note on where the log begins,
  the answer buttons (the Again among the first answers, the repeat
  left out), recall by interval (every span with no review yet), this
  week's young and mature cards, what the day held (one repeat), the
  weekdays, the time spent (its sessions a count, never its minutes,
  which hang on how fast the journey runs) and the answers by hour of
  the day (their total), the figures by deck, every maturity bar
  (relearning among them), the overdue tile, the interval chart and
  that no leech is listed before any review, then reads today in the
  calendar from the keyboard, and over all time that the time studied
  is given, recorded since today; step 15b reads the history of that
  deck's two cards, the repeat told apart. In
  [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts),
  step 09 checks that a course's answers show as graded course answers
  and not as recall, and the chapter just completed under "Your
  courses", done, with its graded answers; and step 10 that the
  course's deck names the wrong options chosen in its final review. In
  [studio-course.journey.ts](../e2e/journeys/journeys/studio-course.journey.ts),
  steps 07 and 09 check that trying a course in the Studio's sandbox
  leaves the statistics as they were. The page object is
  [Statistics.ts](../e2e/journeys/pages/Statistics.ts). The latest
  run's screenshots are online at <https://journeys.solid-memo.com/>.
