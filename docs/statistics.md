# Statistics

What a learner sees of their own study: a strip above the deck list
that sums up the day, a statistics page for the whole instance, and a
deck's own figures on its page. The browser works everything out from
what the instance holds in the pod, and sends nothing anywhere else.

The figures come from the [answer log](data-model.md#the-answer-log),
every grade given, kept month by month, and the review states, where
each card stands now ([srs.md](srs.md#where-cards-stand)). Those two
pages say how the figures are computed.

## The today strip

Once the day has answers, a slim strip above the deck list, where a
study session usually ends, sums up the day:

- **The streak** leads: "3-day streak", then a note. On the first day
  it's "Day one! Come back tomorrow for two."; on the longest streak
  yet, "Your longest yet!"; else the record to beat, "Record: 12 days".
- **Praise** grows with the day's answers: "Nice work!" under 10,
  "Great session!" from 10, "Impressive effort!" from 50. Once every
  deck has nothing left today, it's "All done for today!". When a study
  session with an answer brings the learner back to that, the flame
  pops, a shimmer sweeps across the strip from left to right, and small
  stars rise and fade where it passes. That's lighter than a finished
  course's confetti ([courses.md](courses.md)), since it can come every
  day. Coming back to the list later shows none of it, and neither does
  reduced motion.
- **The day's numbers**: answers, new cards, and the share of today's
  reviews remembered, with their count ("80% remembered of 5 reviews",
  [below](#what-the-figures-count)); a day without a review (only new
  cards, repeats or course answers) has no share. Then the week's
  answers so far ("12 this week"), against the same days of last week when it had any ("+20% on last week"), and a
  link, "All statistics". While due and new cards are left today, the
  strip says how many in every deck ("7 left to study today"), once the
  deck list's rows know every deck's count. It adds about how long they
  take ("about 6 minutes to go",
  [below](#time-spent-and-the-hours-of-the-day)), once the time an
  answer takes is known.

Before the day's first answer, a learner who has studied before is
welcomed back in the strip's place. A streak alive through yesterday
leads, "5-day streak", with a note, then the cards left today and their
time, as in the strip. The note changes each study day:

- **When one more day ties or beats the record**, the note says so:
  "One more day ties your record of 9." or "Study today for a new
  record!".
- **Else** it takes, one a day in turn, "Welcome back! Study today to
  make it 6.", "Keep it going: 5 days and counting.", "Your 5-day
  streak is waiting for today's cards." and "One session keeps your
  streak alive.".
- **Once the streak has lapsed**, a gentle note takes the streak's
  place, one a day in turn: "Start a new streak today.", "Welcome back!
  A few cards today begin a new streak.", "Every streak begins with day
  one. Today can be it.", "Your record is 9 days. Start a new streak
  today." and "Good to see you again. Your cards are ready when you
  are.".

The study day picks the note, so it stays put within a day.
With no study day in the last 12 months there's no note. When the
answers can't be read there's neither note nor strip, and the deck list
works without them.

The strip counts the last 12 study months, whatever the statistics
page's range: the record is the year's, and the streaks use the
activity calendar's 52 weeks, matching that page's last 12 months.

Each past month is summarized once, in the instance's
[digest](data-model.md#the-digest), with the version (ETag) of the
month's document. A summary holds each study day's answers, new cards,
reviews and lapses, the month's young-card recall, and how many
recalled answers took each whole second up to a minute. A visit checks
each past month's version, and a `304` means its summary holds, if
each of its days is a real date of that month or a day either side;
one that isn't is made again. Only this month and a changed month are
read in full; new summaries are written back in the background.

Each answer keeps its study day, so a change of the day boundary leaves
the summaries as they are. The counts are exact unless the day boundary
or the time zone changes in the night of a month's end, and a card is
answered on both sides of it.

The median answer time, for the time left today, counts each time as
the middle of its second, so it's off by half a second at most (a
median of a minute or more counts as a minute). While those months
recorded no time, the median is estimated from the pauses between
answers, so the months are read in full. Without ETags (Node Solid
Server), every month is read in full on every visit.

Code: [TodaySummaryContainer.tsx](../packages/ui/src/ui/TodaySummaryContainer.tsx)
reads the figures (`getTodayFigures`) and [TodaySummary.tsx](../packages/ui/src/ui/TodaySummary.tsx)
shows them. `monthSummaryOf` and `todayFiguresOf` in
[studyDigest.ts](../packages/domain/src/studyDigest.ts) summarize the
months and put the summaries together, and `todayOf` in
[statistics.ts](../packages/domain/src/statistics.ts) picks the day out.

## The statistics page

The page is `#/statistics?instance=…&range=…&view=…`
([routing.md](routing.md)), linked as "Statistics" from the instance
bar on every screen of an instance, and from the today strip.

Above the figures is their **range**: the last 30 days, the last 3
months (the default), the last 12 months or all time. Under it are four
**tabs**: Overview, Activity, Memory and Cards.

- Both are in the URL (`range`, `view`), and a change of either
  replaces the history entry, so Back leaves the page.
- The tabs are links in a `tablist`: the arrow keys, Home and End move
  along them, and on a phone their strip scrolls sideways in its own
  box.
- Before any answer the first three tabs say the statistics begin with
  the next study session; the Cards tab shows where the cards stand
  anyway. A range with no answers, in a log that has some, says so, and
  that a longer range may show earlier ones.

The figures that run up to today look back as far as the activity
calendar, whatever the range: its 52 weeks, or the whole log for all
time. They're the streaks, the days studied of the last 30, the
calendar, what each day held, this week and month beside the last, and
the new cards beside the reviews by week. The rest are the range's.

When the answer log begins inside the range read (always so for all
time), the overview, activity and memory tabs open with a note, "Since
March 2026, your first month of study.". Figures that need earlier
answers, such as time to mature, can't reach further back. Each tab,
from the top:

| Tab | Part | What it shows |
|---|---|---|
| Overview | Tiles | Answers, Study days, Cards studied, "Cards you know" (the cards mature now, from where the cards stand), Current streak, Longest streak, and how many of the last 30 days were studied ("12 of 30 days", with its share). A streak is study days in a row; the current one still counts while today isn't studied yet. |
| Overview | All time | Only for all time: the cards introduced, and those grown mature, over the whole log, each card once, whatever came after. About how long was studied: recorded since the first answer with a time ("Recorded since …, estimated before"), estimated before it ([below](#time-spent-and-the-hours-of-the-day)), a dash while no time is known. The tiles above and the cards introduced over time then cover the whole log too. |
| Overview | Activity calendar | The last 52 weeks, whatever the range, a column a week. Each day is as green as its share of the busiest day's answers. |
| Overview | By deck | A block a deck ([ByDeckStatistics.tsx](../packages/ui/src/ui/ByDeckStatistics.tsx)), as many to a row as fit (one on a phone, two on a larger screen). Under the deck's name: its answers and last study day ("12 answers · last studied September 21, 2026"). Then its figures, each under its label: cards introduced, young and mature recall, first try, lapses, graded course answers and recall each way (with reviews both ways, a direction a line). A share shows its count under its percent; a share of nothing is left out. A deck since removed is "A removed deck". |
| Overview | Download my answers (CSV) | Saves the range's answers, of every deck or of the deck, as a CSV file on the learner's device (`UseCases.saveAnswers`, `answersCsv` in [answerCsv.ts](../packages/domain/src/answerCsv.ts)). A row an answer, oldest first, with every column the log has: `answered_at`, `study_day`, `deck`, `card`, `direction`, `grade`, `mode`, `prior_interval_days`, `next_interval_days`, `chosen_distractor`, `recall_millis`, `grade_millis`, `prior_due`, `utc_offset_minutes`. Column names are in English whatever the page's language. A text value that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front, so a spreadsheet shows it as text rather than as a formula; a number, such as a negative `utc_offset_minutes`, is written as it is. |
| Activity | What each day held | The last 30 days as stacked bars: reviews remembered, cards new that day, lapses and repeats, a step of the green each, named in a legend. A course answer to a card seen before counts only among the day's answers, in the table. |
| Activity | Answers by weekday | A bar a weekday, Monday first: its answers divided by how many of that weekday there have been since the first study day read. The table adds how many were studied ("3 of 4"). |
| Activity | Time spent studying | About how long the range's answers took, and how many sessions, each in all and a study day's on average; the median time an answer took. Then the last 30 days as bars of minutes, each day's sessions in its words and the table. The note says since when answers' own times count, in courses too, that the time before is estimated (course answers left out), and how many of the range's answers since have no time and aren't counted; before any time is recorded, how the time is estimated. Dashes while no time is known; the median is a dash while no recalled answer has a time and no session before had two answers. |
| Activity | Answers by hour of the day | Folded away until opened. A bar an hour, from the hour the study day begins (the preferences' day boundary) round to the one before. Every sixth hour is named, and the table has the total. In the viewer's current time zone, named in the note. |
| Activity | This week so far, This month so far | Answers, study days, cards introduced and recall from Monday or the month's first up to today. Under each, the same days of the week or month before: last week's Monday up to today's weekday, last month's first up to today's date (or its last day, when shorter). |
| Activity | Progress | "Cards introduced over time": a running total over the range. "Young and mature cards over time": at the end of each week, how many cards were young (dashed) and mature (solid), as their last answers by then left them; relearning ones are in the table. "Memory span": at the end of each week, the median of those intervals, in days. Both are approximate ([below](#growth-and-depth-of-memory)). "First try": the share of cards remembered the first time seen. "Time to mature (median)": study days and reviews to grow mature, of the cards that grew mature in the range, with their count. "New cards and reviews, by week": the cards introduced beside the scored reviews, a pair of bars a week for the last 12 weeks. |
| Memory | Remembered in reviews | Two tiles, young and mature: the share of reviews remembered, with its count. "Answer buttons": for first answers and young and mature reviews, a bar of Again, Hard, Good and Easy pressed, every count in the table. "Recall by week", young dashed and mature solid, while the reviews fall in the last 14 weeks (always so for 90 days); over longer, "Recall by month", whose table adds each month's first tries. "Recall by interval": the share remembered of the reviews after each span of the interval histogram (1 day, 2–3, 4–7 and so on), a bar from 0 to 100% with its count; the note names the SM-2 steps. "What a late review costs": the share remembered by lateness, approximate, as its note says. Under it, once there are reviews on time and late: "Reviews done on time: 90% of 10 reviews remembered. Done late: 25% of 4 reviews." Both charts show before any review, every span "no reviews". This part, first try and the answer buttons with it, is left out when there are course answers but no review. |
| Memory | In courses | Only with course answers: the share of graded course answers that were right, with how many there were. |
| Memory | What is hard | Once there are reviews: "Leeches across your decks", every card in use forgotten 4 times or more (lapses) in its reviews of the last 12 study months, the most forgotten first, then the largest share forgotten. Each links to the card's page, with how often of how many reviews and its deck. A removed deck's leeches are left out. Under them, when there's one, **Cram the leeches** links to a cram of every deck's leeches together, which records nothing ([srs.md](srs.md#cramming-the-leeches)). |
| Cards | "Where your cards stand" | New, relearning, young and mature cards, as one bar. Two tiles: the reviews overdue (due before today), and the day the daily review limits let through every review they hold back, studying each day: "Today" when they hold none back, past 30 days "Not within 30 days" with how many still wait. That day is worked out deck by deck at each deck's limit, the latest taken. Then, for each of the next 30 days, the reviews falling due (today's with every overdue one) beside those the limits let through. Then how the studied cards' intervals are spread, and, folded away, their ease. Then each deck's own bar, with the day its new cards run out at its new-card limit, studying each day. Today has only what's left of the limit after today's new cards, as the study queue has it ("never" at a limit of 0). A course's deck has no such day: its cards join as their questions are answered. |
| Cards | "Your courses" | Only with a course among the decks: each course, a link to its page, with its chapters completed out of all ("1 of 3 chapters done", and as a bar). Then a table of its chapters: done, open or locked, as the course's page says, and its graded course answers of the last 12 study months, the share right with its count. A question counts toward the chapter whose step or final review asks it. Nothing in it is particular to one course: the chapters are the course's release's, the chapters completed its deck's, the answers the log's. |

A card is *young* at an interval under 21 days and *mature* from 21
days on. A card forgotten last time and not remembered since is
*relearning*, whatever its interval: SM-2 leaves it no repetition in a
row ([srs.md](srs.md)), as the Studio's "learning" state does. A card
passed once isn't back in it until forgotten. SM-2 spaces reviews 1
day, 6 days, then about 15 and about 38, so some bins of the interval
chart stay nearly empty; its caption says so, and that FSRS-6 spaces
them by each card's memory. A card studied both ways counts once each
way, and the page says so.

Under FSRS-6 ([srs.md](srs.md#fsrs-6)) the intervals are FSRS-6's. In
the answer log, they're those recorded from the scheduler that set each
due day ([data-model.md](data-model.md#the-answer-log)). Where the
cards stand now, each prompt's is its fresh FSRS-6 state's (study days
from its last review to its due day), else its SM-2 state's. Relearning and the
folded-away ease chart stay SM-2's, kept up to date on every
review. A share always shows its count, so "100%" of one review
reads as what it is.

Every chart can be read without seeing it: pointing at or tapping a
point or a part of a bar puts what it held in words under the chart,
and "Show as a table" lists the same figures. The keyboard reaches the
same words:

- Each chart is one tab stop (each bar of the answer buttons with
  answers is one). Left and Right step along its points, Home and End
  go to the first and the last, and Escape lets go; in the calendar,
  Left and Right step a week and Up and Down a day (`usePoint`). Keys
  pressed with Alt, Control or Meta are left to the browser.
- The line under the chart, its description, says how to step through
  it. A status line repeats each point the keyboard reaches; sweeping
  the pointer stays quiet.
- A screen reader in browse mode keeps the arrow keys: its focus mode
  passes them on, and the tables say the same.

Only shades of one green are used, each at 3:1 or more on the surfaces
(4.5:1 in High contrast, WCAG 1.4.11). Steps that touch have a surface
gap between them. A dash or a legend tells meeting lines apart, and a
legend names each step of the green in bars of several series. In
forced-colors mode the steps are empty, hatched and filled. The
histograms are the Studio's, shared from the UI package.

The page reads three things on their own:

- The answers of the range (`UseCases.getStatistics`).
- The cards and review states of every deck, with the last 12 study
  months of answers for what is hard, whatever the range
  (`UseCases.getCardProgress`).
- With a course among the decks, how the courses have gone
  (`UseCases.getCourseStatistics`), from the same 12 months and each
  course's outline, which the library reads once a page load. A course
  whose outline can't be read is left out.

All three ask for the months at once, and a month already being read
is read once for all, unless an answer was written meanwhile, which
that read may miss; then what's kept serves each. When the months can't
be read, what is hard is left out and where the cards stand still
shows. When the cards can't be read, a quiet line says so and the rest
of the page works on. When the courses can't be, they're left out.

## Loading

The answer log is the large part: one to three megabytes of Turtle a
month, by server, for a learner who answers a hundred cards a day.

- **Each month is read once a page load, then only when it changed.**
  `getStatistics` and the Studio's `loadAnswerLog` share one cache of
  the months read, by their ETag: a month already read costs a `304`.
  A read adds to the cache, never replaces it, and a month the log no
  longer lists is dropped. The month being studied is read again after
  studying. A server without ETags is read whole every time.
- **The today strip keeps a summary of each past month** in the digest
  ([above](#the-today-strip)).
- **What was read is shown again for half a minute** (`staleTime`) on
  the statistics page, a deck's page and the today strip, so moving
  between them reads nothing. Every mutation clears the statistics, the
  today strip and the courses' figures among them, and where the cards
  stand as it ends, written or not (`keepStudyFiguresFresh` in
  [studyFigures.ts](../packages/ui/src/ui/studyFigures.ts)). Mutations
  are an answer, a card or deck added, edited or removed, a deck's
  pace, the preferences, a guest's study brought over, or a Studio
  edit. A change
  made on another device shows once what was read is half a minute old.
  Completing a chapter rereads the courses' figures, as the chapters
  completed are part of their key.
- **The range read.** `getStatistics` reads the last 12 study months
  by default, or `range`: the last so many study days, or the whole
  log (`"all"`). When the range begins after the activity calendar's 52
  weeks (`calendarStartOf`), it reads those weeks too. `statisticsOf`
  counts the range's answers from its first day (`since`), and the
  figures up to today, with `recentDays`, from every answer read. The
  statistics read leaves out an answer after tomorrow: a later day
  boundary or another time zone can put one on tomorrow, but none
  later. The charts over time span at most ten years (`CHART_YEARS`),
  the last, and walk a count of days, weeks or months known beforehand.
  Its result's `coverage` is the log's first month when the log begins
  inside the range, and `logBegins` the log's first month, for the
  empty range's message. The page's ranges are 30 days, 90 days (its
  default), 12 months and `"all"` (`rangeRead` and `statisticsQuery` in
  `studyFigures.ts`), each read once and kept apart. The today strip
  has a key of its own (`todayFiguresQuery`). All time downloads the
  whole log once a page load, as `loadAnswerLog` does.

Measured against a real server (`history.integration.test.ts`, run
with `MEASURE_ANSWER_LOG=1`; [testing.md](testing.md)), for 100
answers a day, on a development machine with the server on it:

| Server | Read | Answers | Downloaded | First read | Turtle parsed | Figures | Read again |
|---|---|---|---|---|---|---|---|
| Community Solid Server 7 | 12 months | 36,500 | 36.8 MB | 2.4 s | 1.0 s | 0.07 s | 0.2 s (12 × 304) |
| Community Solid Server 7 | All, 24 months | 73,000 | 73.6 MB | 4.5 s | 2.0 s | 0.14 s | 0.4 s (24 × 304) |
| Node Solid Server 6 | 12 months | 36,500 | 13.4 MB | 1.1 s | 1.0 s | 0.07 s | 1.1 s (no ETag) |
| Node Solid Server 6 | All, 24 months | 73,000 | 26.7 MB | 2.2 s | 2.0 s | 0.14 s | 2.1 s (no ETag) |

Parsing costs about 27 µs an answer whatever the server writes.
Community Solid Server writes every IRI in full, so it sends almost
three times the bytes.

## A deck's own figures

A deck's page (`#/deck`) sums up its last 3 months, once it has answers
in them. It shows the young and mature recall tiles, recall each way when it has
reviews both ways, first try and, with course answers, the graded
course answers tile (alone for a deck studied only in a course's
chapters). Under them is always "More statistics", a link to the rest
([DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx));
its default range is the same read.

Then comes where its cards stand, all new before the first answer, with
a tile for the day its new cards run out (none for a course's deck, or
once none is new). Then what is hard in it, from its last 12 study
months ([HardestCardsContainer.tsx](../packages/ui/src/ui/HardestCardsContainer.tsx)):

- "Hardest cards" lists the ten cards in use forgotten most often in
  their reviews, ranked as the leeches are, a leech marked as one, each
  a link to its page (none for a deck without reviews).
- Under them, when one is a leech, **Cram the leeches** links to a cram
  of the deck's leeches, which records nothing
  ([srs.md](srs.md#cramming-the-leeches)).
- For a deck with course answers, "Most-confused options" lists the
  wrong options chosen most often, each with its card and how often
  (`confusionsOf`).

The deck's statistics page, `#/deck-statistics?instance=…&deck=…`
(under the deck in the breadcrumbs: Decks › *deck* › Statistics), has
the statistics page's range and tabs, of the deck's answers alone. Its
overview has its own activity calendar, without the figures by deck.
Its memory tab has recall each way when the deck has reviews both ways,
and the deck's hardest cards and most-confused options in place of the
leeches across decks. Its cards' tab has the deck's own cards and, for
a course's deck, its course.

## A card's history

A card's own page (`#/card`) ends with its history
([CardHistory.tsx](../packages/ui/src/ui/CardHistory.tsx)). For each
direction with a review state: the interval and the next review, from
the scheduler that sets the due days (FSRS-6's while it does,
`effectiveStates`), and the study day it was first studied, by the
day's boundary hour. Then a table of every answer to the card in its
deck, newest first, from the whole answer log (`UseCases.cardAnswers`,
as the Studio's card inspector reads it). A row has:

- the study day, and which way when the card is asked both ways;
- the kind of answer: a first answer, a review, again the same day, or
  a course question;
- the button pressed (Again, Hard, Good or Easy, as the answer buttons
  count them) or, for a course question, right or wrong and the wrong
  option chosen;
- last, the interval the answer gave.

A card not studied yet says so.

## What the figures count

Whether an answer repeats another to the same prompt that day depends
on the prompt's earlier answers, so recall, lapses and course answers
read chains. [answerChain.ts](../packages/domain/src/answerChain.ts)
groups the answers by prompt (deck, card and direction) in the order
they were given, once for each set of figures.

| Term | Definition |
|---|---|
| Introduction | A prompt's first answer: one without a prior interval that isn't a repeat (`isIntroduction`). A Studio "forget" makes the next answer one again, unless it comes the same study day, when it's a repeat. |
| Repeat | An answer to a prompt after its first answer that study day: a card failed and put back in the session, or a course question answered again in the chapter's review. A study day is never split between months, so this never depends on how many months are read. |
| Scored review | An answer to a prompt already introduced, not a repeat, recalled and graded by the learner (not chosen among a course's options): `isScoredReview`. |
| Recall | Scored reviews remembered (graded 3 or more) of all scored reviews, young and mature apart by the interval before the answer. |
| Lapse | A scored review graded below 3: `isLapse`. A leech is a card with 4 lapses or more, in either direction (`LEECH_LAPSES`). The hardest cards are those with lapses, the most first, then the largest share of their scored reviews (`hardestCardsOf`). |
| First try | Prompts remembered (graded 3 or more) at their first introduction, of the prompts introduced, each once, recalled and graded only. Only a prompt's first answer read counts: one introduced again after a Studio "forget", or after reviews of a card seen before the months read, is no first try. A course's first answers are its graded course answers. Per deck and per month too. |
| Answer buttons | The grade of each introduction and scored review, recalled and graded only, as its button: 0 to 2 Again, 3 Hard, 4 Good, 5 Easy. The four buttons give 1, 3, 4 and 5, so both scales read the same. |
| Graded course answers | Right multiple-choice answers of the multiple-choice answers that aren't repeats, never called recall. Practice answers, and right answers to a card already graded that day, aren't logged ([srs.md](srs.md#multiple-choice-answers-in-a-course)), so this isn't every answer given in a course. |

### Growth and depth of memory

[memoryCurve.ts](../packages/domain/src/memoryCurve.ts) reads the same
chains for how memory grows. The log holds the answers only, not the
Studio's edits, so what it replays is approximate, and the page says
so.

| Term | Definition |
|---|---|
| Recall by interval | Scored reviews remembered of all scored reviews, binned by the interval before them (`INTERVAL_BOUNDS`, shared with the interval histogram): `recallByInterval`. |
| Lateness | A scored review's study day less the day it was due (`latenessOf`). The due day is the one the review recorded (`priorDue`, since vocabulary 1.19), which needs no earlier answer read and follows a Studio reschedule; else the day the previous answer to the prompt fell due (its study day plus the interval it gave). Without `priorDue` it's unknown when that answer isn't among those read, when the review starts its chain (a card moved with its progress), or when the review's prior interval isn't the interval that answer gave (a Studio edit). Negative is early, as is a review the Studio moved earlier. Without `priorDue`, a review the Studio moved later shows as late. Either way, one the daily review limit held back shows as late. Grouped on time (0), 1–2, 3–6, 7–29 and 30 days or more late, early and unknown: `recallByLateness`. |
| Where the cards stood | Each prompt as its last answer by the end of a week left it: relearning when that answer was below grade 3, else mature at an interval of 21 days or more and young under it. Replayed over every answer read, so the range's first week starts with the prompts studied before it: `memoryOverTime`. A Studio "forget" starts the prompt over at its next answer. A card moved with its progress leaves its old deck then: a move is a chain in another deck, of the same card id and direction, starting from the old chain's last interval, no sooner than that interval ran out, and the old chain is never answered again. Those checks tell a moved card from a library deck's namesake (library decks share card ids) whose chain began before the answers read. An interval in the pod below 0 or beyond a century counts in the median as 0 or a century. Removed decks and retired cards stay counted as last answered. |
| Memory span | The median of those prompts' last intervals at the end of each week (kept in a binary indexed tree, so a week costs the logarithm of the longest interval, not the prompts). |
| Time to mature | Of each segment that starts with an introduction among the answers read: the study days and the answers (repeats left out) from the introduction to the first answer that gives an interval of 21 days or more, when that answer falls in the range. The medians are shown: `timeToMatureOf`. A card introduced before the answers read is left out. |

The range's figures are of its answers. Lateness, where the cards stood
and the time to mature read the answers before the range too, those the
page reads anyway (the activity calendar's 52 weeks, or the whole log).
Course answers count in where the cards stood, never in recall.

### Time spent and the hours of the day

An answer before vocabulary 1.19 records when it was given, not how
long it took. Since then it records its response times and the
device's UTC offset ([data-model.md](data-model.md#the-answer-log),
[below](#response-times)).
[studyTime.ts](../packages/domain/src/studyTime.ts) counts the times
recorded from the first answer read that has one, and estimates the
time before it from the pauses between answers. Every
figure of it says "about", as recorded times are rounded and the rest
estimated.

| Term | Definition |
|---|---|
| Times recorded since | The first answer read with a recorded time, by when it was given (`firstTimedOf`), from every answer `statisticsOf` is given, so a range that begins later still counts its answers as recorded. One deck's statistics take it from every deck's answers read (`getStatistics`), agreeing with the whole log's on which answers are recorded, unknown or estimated. |
| Recorded time | From then on, an answer's `recallMillis` and `gradeMillis` together; a course answer's `recallMillis` (`recordedTimeOf`), as its questions are timed. An answer without them (given in a tab from before 1.19, or graded after ten minutes away) is unknown: it isn't counted, and the note says how many. |
| Session | The answers counted (recalled ones before times were recorded, every answer with a time after) in the order given; a pause of 5 minutes or more (`SESSION_GAP_MS`) begins a new one. A session counts on the study day of its first answer. A day that only carries one on from the day before says so, rather than "0 sessions". |
| Time an answer took | Its recorded time. Before times were recorded, the pause before it within its session, up to a minute (`ANSWER_CAP_MS`). A session's first answer takes the median of its session's others; alone in its session, the median of every session's. While no session has had two answers there's no median, and no time is counted: `estimateStudyTime`. |
| Median time an answer took | Of the recalled answers with a recorded time, once there is one; else of the pauses estimated. The time left today is reckoned from it. |
| Course answers before times were recorded | Left out of the time, as the page says: no answer tells how long a chapter's theory took. They do count by the hour. |
| Time left today | (Reviews left + new cards left + the reviews expected back) × the median time an answer took: `expectedTimeToday`. The reviews expected back are the reviews left times the share of young reviews forgotten over the strip's 12 months (none before any). Shown in whole minutes, one at least. |
| Hour of the day | Each answer by its hour in the viewer's current time zone when the page is read (`answersByHour`), not where it was given, so a learner who traveled sees those answers shifted. |

### Response times

Since vocabulary 1.19 each answer says how long it took and where it
was given, measured by the screen that asked it and kept in the answer
log ([data-model.md](data-model.md#the-answer-log)). Nothing is asked
of the learner and nothing turns it off, as [privacy.md](privacy.md)
says.

| Field | How it is measured |
|---|---|
| `recallMillis` | In study, from the card shown to Reveal; in a course, from the question shown to the option checked (`useStopwatch` in [stopwatch.ts](../packages/ui/src/ui/stopwatch.ts), on `performance.now()`). The time the page is hidden is left out. |
| `gradeMillis` | In study, from Reveal to the grade, measured the same way; when saving failed and the learner grades again, to the last grade pressed. A course answer has none. |
| Either | In whole milliseconds, and left out above ten minutes (`MAX_RESPONSE_MILLIS`, `recordedResponseTimes` in [answer.ts](../packages/domain/src/answer.ts)). An answer given without a screen timing it, as when the Studio's trial plays the days to come, has neither. |
| `priorDue` | The prompt's due day before the answer, from its review state (`applyGrade`); none on a first answer. |
| `utcOffsetMinutes` | The device's offset from UTC as the answer is given (`utcOffsetMinutesAt`). |

### Why the figures changed

Recall and "remembered" once counted every answer with a prior
interval, and a lapse was any answer below grade 3:

- A repeat, a failed card answered again minutes later and usually
  right, counted as a young review remembered, so young recall, and
  today's "remembered" most of all, came out too high. The strip's
  share counted every answer of the day.
- Course answers, graded 3 or 1, counted as recall.
- A card failed at its introduction, and each failed repeat, counted as
  a lapse, so leeches came early, in the Studio too.

Now recall and the strip's share are of scored reviews only, usually
lower for young cards. Course answers have their own figure. Lapses
and leeches count review lapses only, so the Studio shows fewer.
Nothing in the pod changed.

## Where the code is

| Layer | Files |
|---|---|
| Domain | [answerChain.ts](../packages/domain/src/answerChain.ts): the chains, repeats, scored reviews and lapses. [memoryCurve.ts](../packages/domain/src/memoryCurve.ts): recall by interval, lateness and week, where the cards stood, memory span and time to mature. [studyTime.ts](../packages/domain/src/studyTime.ts): time studied, sessions, time left today, answers by hour. [statistics.ts](../packages/domain/src/statistics.ts): activity by study day, totals, streaks, recall, recall by month, graded course answers, each deck's figures, the running total of cards introduced, the prompts introduced and grown mature (`promptGrowthOf`), and `todayOf`. [answerCsv.ts](../packages/domain/src/answerCsv.ts): the answers as CSV. [studyPatterns.ts](../packages/domain/src/studyPatterns.ts): the answer buttons, first try, this week and month beside the last, the days studied of the last 30, the weekdays, recall each way, and the new cards beside the reviews by week. [cardProgress.ts](../packages/domain/src/cardProgress.ts): new, relearning, young and mature, and when new cards run out. [cardHistory.ts](../packages/domain/src/cardHistory.ts): a deck's answers as its cards are named now, a card's answers, lapses, the hardest cards and the wrong options chosen most. [course.ts](../packages/domain/src/course.ts): `courseProgressOf`, a course's chapters done and its graded answers chapter by chapter. [scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts): the forecast, the interval and ease histograms, shared with the Studio, what is overdue and the days the daily limit takes to catch up. |
| Application | `getStatistics`, `saveAnswers`, `getCardProgress` and `getCourseStatistics` in [statistics.ts](../packages/application/src/statistics.ts): which months and documents to read. The answer store's `readMonths` ([answerStore.ts](../packages/application/src/answerStore.ts)) keeps the months read, for `loadAnswerLog` too, and reads a month asked for twice at once only once. `cardAnswers` for a card's history. `getTodayFigures` for the today strip, from the digest's month summaries. |
| UI | [StatisticsContainer.tsx](../packages/ui/src/ui/StatisticsContainer.tsx) (the page, of the instance or of a deck), [StatisticsScreen.tsx](../packages/ui/src/ui/StatisticsScreen.tsx) (its range and tabs) and [StatisticsSections.tsx](../packages/ui/src/ui/StatisticsSections.tsx) (the overview, activity and memory tabs). The `statistics` and `deckStatistics` routes in [router.ts](../packages/ui/src/ui/router.ts). [CardProgressContainer.tsx](../packages/ui/src/ui/CardProgressContainer.tsx): where the cards stand. [HardestCardsContainer.tsx](../packages/ui/src/ui/HardestCardsContainer.tsx) and [HardestCards.tsx](../packages/ui/src/ui/HardestCards.tsx): what is hard, and the leeches a cram crams (`leechesOf`), from the same read as [CramContainer.tsx](../packages/ui/src/ui/CramContainer.tsx), the leeches' cram. [CourseStatistics.tsx](../packages/ui/src/ui/CourseStatistics.tsx): "Your courses". [CardHistoryContainer.tsx](../packages/ui/src/ui/CardHistoryContainer.tsx) and [CardHistory.tsx](../packages/ui/src/ui/CardHistory.tsx): a card's history. [charts/](../packages/ui/src/ui/charts/): tiles, calendar, bar charts stacked or side by side, histograms, line charts, the answer buttons and maturity bars, a module each, gathered for the Studio in [StatisticsCharts.tsx](../packages/ui/src/ui/StatisticsCharts.tsx). [DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx), and the today strip above. |

The statistics are the same for a guest ([guest-mode.md](guest-mode.md)).

## How it is tested

- **Unit tests** at 100% coverage ([testing.md](testing.md)):
  - The domain: `answerChain.test.ts`, `statistics.test.ts`,
    `memoryCurve.test.ts` (a forget, a move with its progress, a
    reschedule, introductions before the answers read),
    `studyTime.test.ts`, `answerCsv.test.ts`, `studyPatterns.test.ts`,
    `cardProgress.test.ts`, `cardHistory.test.ts`,
    `scheduleInsight.test.ts`, `course.test.ts` and
    `studyDigest.test.ts`. The last checks the today strip's figures
    from month summaries against `statisticsOf` of a year of answers,
    and how much the median moves.
  - Held to linear growth: `chainIndexOf`,
    `statisticsOf`, the answer buttons, first try, recall each way,
    where the cards stood, the estimated time and the hardest cards.
  - The use cases: `useCases.test.ts`.
  - The UI: `StatisticsScreen.test.tsx`, `StatisticsSections.test.tsx`,
    `router.test.ts`, `Workspace.test.tsx` (the range and tab in the
    URL, the deck's statistics route), the chart tests in `charts/`,
    `CardProgressContainer.test.tsx`, `HardestCardsContainer.test.tsx`
    (the links to cram, only with a leech), `CramContainer.test.tsx`,
    `CourseStatistics.test.tsx`, `CardHistoryContainer.test.tsx` and
    `TodaySummary.test.tsx`. The cram test checks that a cram calls no
    use case but its reads, and leaves the cached reviews, queue and
    progress as they were. `StudyContainer.test.tsx` and
    `ChapterPlayerContainer.test.tsx` check that an answer clears the
    statistics.
- **Against real servers**, `history.integration.test.ts` checks:
  - that the statistics and the whole log share the months read, a
    month read again only once it changed;
  - that lateness, where the cards stood and the time to mature follow
    a card across months (journeys can't span days);
  - that the today strip's figures are the statistics', and on a server
    with ETags it reads a past month again only once it changed;
  - and it measures a large log when asked ([above](#loading)).
- **User journeys**:
  - [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts):
    step 13, the today strip counting each session's answers as it
    ends. Step 15, after two decks studied and one card answered Again
    and then once more, it checks the tiles (the repeat is no review).
    It checks the note on where the log begins, the answer buttons (the
    Again among the first answers, the repeat left out) and recall by
    interval (every span with no review yet). Then this week's young and mature cards, what
    the day held (one repeat), the weekdays, the time spent (its
    sessions a count, never its minutes) and the answers by hour (their
    total). Then the figures by deck, every maturity bar (relearning
    among them), the overdue tile, the interval chart, no leech before
    any review, today in the calendar from the keyboard, and over all
    time the time studied, recorded since today. Step 15b, the history
    of that deck's two cards, the repeat told apart.
  - [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts):
    step 09, a course's answers as graded course answers, not recall,
    and the chapter completed under "Your courses", done, with its
    graded answers. Step 10, the course's deck naming the wrong options
    chosen in its final review.
  - [studio-course.journey.ts](../e2e/journeys/journeys/studio-course.journey.ts):
    steps 07 and 09, a course tried in the Studio's sandbox leaving the
    statistics as they were.

  The page object is [Statistics.ts](../e2e/journeys/pages/Statistics.ts).
  The latest run's screenshots are online at
  <https://journeys.solid-memo.com/>.
