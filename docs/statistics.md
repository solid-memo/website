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
  deck's is known.

Before the day's first answer there is no strip. When the answers
cannot be read there is none either: the deck list works without it.
It shares the statistics page's read of the last 12 study months, so
the record is the year's. Every change made clears that read, an
answer in a session or a course among them, so the strip is up to date
after a session; otherwise it is
read again when the list opens and what was read is over half a minute
old ([below](#loading)).

Code: [TodaySummaryContainer.tsx](../packages/ui/src/ui/TodaySummaryContainer.tsx)
reads the statistics and [TodaySummary.tsx](../packages/ui/src/ui/TodaySummary.tsx)
shows them; `todayOf` in [statistics.ts](../packages/domain/src/statistics.ts)
picks the day out.

## The statistics page

`#/statistics?instance=…` ([routing.md](routing.md)), linked as
"Statistics" from the instance bar on every screen of an instance, and
from the today strip. Before any answer it says that the statistics
begin with the next study session; where the cards stand is shown
anyway.

From the top (a note first, "Since March 2026, your first month of
study.", when the answer log begins after the 12 months read):

| Part | What it shows |
|---|---|
| Tiles | Answers, Study days, Cards studied, Current streak, Longest streak, and how many of the last 30 days were studied ("12 of 30 days", with its share). A streak is study days in a row; the current one still counts while today is not studied yet. |
| Activity | A calendar of the last 52 weeks, a column a week, each day as green as its share of the busiest day's answers. |
| What each day held | The last 30 days as stacked bars: reviews remembered, cards new that day, lapses and repeats, a step of the green each, named in a legend. A course answer to a card seen before is none of these, so it counts only among the day's answers, in the table. |
| Answers by weekday | A bar a weekday, Monday first: its answers divided by how many of that weekday there have been since the first study day read, and in the table how many of them were studied ("3 of 4"). |
| This week so far, This month so far | Answers, study days, cards introduced and recall from Monday (as the calendar's weeks) or the month's first up to today, each with the same days of the week or month before under it: last week's Monday up to today's weekday, last month's first up to today's date (or its last day, when it was shorter). |
| Progress | "Cards introduced over time": a running total of the cards seen for the first time, over the last 12 months. "First try": the share of cards remembered the first time they were seen. "New cards and reviews, by week": the cards introduced beside the scored reviews done, a pair of bars a week for the last 12 weeks: when the new cards keep outpacing the reviews, the reviews due further down show what they bring. |
| Remembered in reviews | Two tiles, young and mature cards: the share of reviews remembered, with how many reviews it is of. Then "Answer buttons": for first answers and for young and mature reviews, a bar of the buttons pressed, Again, Hard, Good and Easy, with every count in the table. Then "Recall by month", the same split month by month, young as a dashed line and mature as a solid one; its table adds each month's first tries. Left out (first try and the answer buttons too) when there is no review but there are course answers, as for a learner who has only taken a course. |
| In courses | Only with course answers: the share of graded course answers that were right, with how many there were. |
| By deck | A table of each deck's answers, cards introduced, young and mature recall, recall each way (for a deck with reviews both ways), first try, lapses, graded course answers and the day it was last studied. It scrolls sideways on a narrow screen, the deck's name kept in view. A deck since removed is "A removed deck". |
| Where your cards stand | How many cards are new, relearning, young and mature, as one bar. Two tiles: how many reviews are overdue (due before today), and the day the daily review limits let through every review they hold back, studying each day ("Today" when they hold none back; past the 30 days, "Not within 30 days" with how many still wait then). Each deck's limit is its own, so the day is worked out deck by deck and the latest taken. Then, for each of the next 30 days, the reviews falling due (today's with every overdue one) beside those the limits let through; how the studied cards' intervals are spread (days until they come back), and, folded away, how easy they feel (their ease). Then each deck's own bar, with the day its new cards run out at its own new-card limit, studying each day, today with only what is left of the limit after the new cards already met today, as the study queue has it ("never" at a limit of 0); a course's deck is left out of that, as its cards join it when their questions are answered. |

A card is *young* while it is reviewed at an interval under 21 days and
*mature* from 21 days on. A card forgotten last time and not remembered
since is *relearning*, whatever its interval: SM-2 leaves it no
repetition in a row ([srs.md](srs.md)), as the Studio's "learning"
state does; it is no beginner's stage, as a card passed once is not
back in it until it is forgotten. SM-2 spaces a card's reviews 1 day,
6 days, then about 15 and about 38, growing from there, so some bins
of the interval chart stay nearly empty; its caption says so. A card studied both ways counts once each
way, and the page says so. A share is always shown with the count it is
of, however small, so that "100%" of one review reads as what it is.

Every chart can be read without seeing it. Pointing at a day, a
weekday, a week, a month or a part of a bar (or tapping it) puts what
it held in words under the chart, and "Show as a table" lists the same
figures. Only shades of one green are used; where two lines meet, a
dash or a legend tells them apart, and where bars hold several series,
a legend names each step of the green. In forced-colors mode the steps
keep apart as empty, hatched and filled. The histograms are the
Studio's own, shared from the UI package.

The page reads two things on their own, so neither waits for the
other: the answers of the last 12 study months
(`UseCases.getStatistics`), and the cards and review states of every
deck (`UseCases.getCardProgress`). When the second cannot be read, a
quiet line says so and the rest of the page works on.

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
  between them reads nothing. Every change made clears the statistics
  and where the cards stand at once, as it ends (whether it was written
  or not): an answer, a card or deck added, edited or removed, a deck's
  pace, the preferences, a guest's study brought over, a Studio edit.
  Each is a mutation, and the app clears them after every mutation
  (`keepStudyFiguresFresh` in
  [studyFigures.ts](../packages/ui/src/ui/studyFigures.ts)), so a new
  kind of change cannot be left out. A change made on another device
  shows once what was read is half a minute old.
- **The range read.** `getStatistics` reads the last 12 study months
  by default, or `range`: the last so many study days, or the whole
  log (`"all"`). Its result's `coverage` is the log's first month when
  the log begins inside the range.

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

A deck's page (`#/deck`) ends with the same figures for that deck
alone, once it has answers: what each of its last 30 days held, as
stacked bars, the young and mature recall tiles, recall each way when
it has reviews both ways, first try and the answer buttons and, with
course answers, the graded course answers tile (alone for a deck
studied only in a course's chapters). Then where its cards stand, all new before the
first answer, with a tile for the day its new cards run out (none for a
course's deck, or once none is new)
([DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx)).

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
| Lapse | A scored review graded below 3: `isLapse`. A leech is a card with 4 lapses or more, in either direction (`LEECH_LAPSES`). |
| First try | Prompts remembered (graded 3 or more) at their first introduction, of the prompts introduced, each counted once, recalled and graded only: only a prompt's first answer read counts, so a prompt introduced again after a Studio "forget", or after reviews of a card seen before the months read, is no first try, and a course's first answers are its graded course answers. Per deck and per month too. |
| Answer buttons | The grade of each introduction and scored review, recalled and graded only, as the button that gives it: 0 to 2 Again, 3 Hard, 4 Good, 5 Easy. The four buttons give 1, 3, 4 and 5, so both scales read the same. |
| Graded course answers | Right multiple-choice answers of the multiple-choice answers that are not repeats. They are never called recall: practice answers, and right answers to a card already graded that day, are not logged ([srs.md](srs.md#multiple-choice-answers-in-a-course)), so this is not every answer given in a course. |

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
| Domain | [answerChain.ts](../packages/domain/src/answerChain.ts): the chains, repeats, scored reviews and lapses. [statistics.ts](../packages/domain/src/statistics.ts): activity by study day, totals, streaks, recall, recall by month, graded course answers, each deck's figures, the running total of cards introduced, and `todayOf`. [studyPatterns.ts](../packages/domain/src/studyPatterns.ts): the answer buttons, first try, this week and month beside the last, the days studied of the last 30, the weekdays, recall each way, and the new cards beside the reviews by week. [cardProgress.ts](../packages/domain/src/cardProgress.ts): new, relearning, young and mature, and when new cards run out. [scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts): the forecast, the interval and ease histograms, shared with the Studio, what is overdue and the days the daily limit takes to catch up. |
| Application | `getStatistics` and `getCardProgress` in [useCases.ts](../packages/application/src/useCases.ts): which months and documents to read; `readLogMonths` keeps the months read, for `loadAnswerLog` too. |
| UI | [StatisticsContainer.tsx](../packages/ui/src/ui/StatisticsContainer.tsx) and [StatisticsScreen.tsx](../packages/ui/src/ui/StatisticsScreen.tsx) (the page), [CardProgressContainer.tsx](../packages/ui/src/ui/CardProgressContainer.tsx) (where the cards stand), [StatisticsCharts.tsx](../packages/ui/src/ui/StatisticsCharts.tsx) (tiles, calendar, bar charts stacked or side by side, histograms, line charts, the answer buttons and maturity bars), [DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx) and the today strip above. |

The statistics are the same for a guest ([guest-mode.md](guest-mode.md)),
whose answers are kept in the pod in their browser and move with the
rest of their study when they log in.

## How it is tested

- **Unit tests** at 100% coverage, as everywhere
  ([testing.md](testing.md)): `answerChain.test.ts`,
  `statistics.test.ts`, `studyPatterns.test.ts`, `cardProgress.test.ts`
  and `scheduleInsight.test.ts` in the domain, the passes over the
  whole log (`chainIndexOf`, `statisticsOf` and the answer buttons,
  first try and recall each way) held to linear growth,
  the use cases in `useCases.test.ts`, and `StatisticsScreen.test.tsx`,
  `StatisticsCharts.test.tsx`, `CardProgressContainer.test.tsx` and
  `TodaySummary.test.tsx` in the UI; `StudyContainer.test.tsx` and
  `ChapterPlayerContainer.test.tsx` check that an answer clears the
  statistics.
- **Against real servers**: `history.integration.test.ts` checks that
  the statistics and the whole log share the months read, a month read
  again only once it changed, and measures a large log when asked
  ([above](#loading)).
- **User journeys**: in
  [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts),
  step 13 checks that the today strip counts each session's answers as
  soon as it ends, and step 15 opens the page after two decks were
  studied, one card answered Again and then once more, and checks the
  tiles (the repeat is no review), the note on where the log begins,
  the answer buttons (the Again among the first answers, the repeat
  left out), what the day held (one repeat), the weekdays, the table by
  deck, every maturity bar (relearning among them), the overdue tile
  and the interval chart. In
  [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts),
  step 09 checks that a course's answers show as graded course answers
  and not as recall. In
  [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts),
  steps 30 and 32 check that trying a course in the Studio's sandbox
  leaves the statistics as they were. The page object is
  [Statistics.ts](../e2e/journeys/pages/Statistics.ts). The latest
  run's screenshots are online at https://solid-memo.com/journeys/.
