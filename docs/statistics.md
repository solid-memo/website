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
  then a link, "All statistics", to the statistics page. A day without
  a review (only new cards, repeats or course answers) leaves the share
  out.

Before the day's first answer there is no strip. When the answers
cannot be read there is none either: the deck list works without it.
It is read afresh each time the list opens, so it is up to date after
a session.

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

From the top:

| Part | What it shows |
|---|---|
| Tiles | Answers, Study days, Cards studied, Current streak, Longest streak. A streak is study days in a row; the current one still counts while today is not studied yet. |
| Activity | A calendar of the last 52 weeks, a column a week, each day as green as its share of the busiest day's answers. |
| Progress | "Cards introduced over time": a running total of the cards seen for the first time, over the last 12 months. |
| Remembered in reviews | Two tiles, young and mature cards: the share of reviews remembered, with how many reviews it is of. Then "Recall by month", the same split month by month, young as a dashed line and mature as a solid one. Left out when there is no review but there are course answers, as for a learner who has only taken a course. |
| In courses | Only with course answers: the share of graded course answers that were right, with how many there were. |
| By deck | A table of each deck's answers, cards introduced, young and mature recall, lapses, graded course answers and the day it was last studied. It scrolls sideways on a narrow screen, the deck's name kept in view. A deck since removed is "A removed deck". |
| Where your cards stand | How many cards are new, young and mature, as one bar; the reviews due on each of the next 30 days; then each deck's own bar. |

A card is *young* while it is reviewed at an interval under 21 days and
*mature* from 21 days on. A card studied both ways counts once each
way, and the page says so. A share is always shown with the count it is
of, however small, so that "100%" of one review reads as what it is.

Every chart can be read without seeing it. Pointing at a day or a month
(or tapping it) puts what it held in words under the chart, and "Show
as a table" lists the same figures. Only shades of one green are used;
where two lines meet, a dash or a legend tells them apart.

The page reads two things on their own, so neither waits for the
other: the answers of the last 12 study months
(`UseCases.getStatistics`), and the cards and review states of every
deck (`UseCases.getCardProgress`). When the second cannot be read, a
quiet line says so and the rest of the page works on.

## A deck's own figures

A deck's page (`#/deck`) ends with the same figures for that deck
alone, once it has answers: its answers on each of the last 30 days,
as bars, the young and mature recall tiles and, with course answers,
the graded course answers tile (alone for a deck studied only in a
course's chapters). Then where its cards stand, all new before the
first answer
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
| Introduction | A prompt's first answer: one without a prior interval. A Studio "forget" makes the next answer one again. |
| Repeat | An answer to a prompt after its first answer that study day: a card failed and put back in the session, or a course question answered again in the chapter's review. A study day is never split between months, so this never depends on how many months are read. |
| Scored review | An answer to a prompt already introduced, not a repeat, recalled and graded by the learner (not chosen among a course's options): `isScoredReview`. |
| Recall | Scored reviews remembered (graded 3 or more) of all scored reviews, young and mature apart by the interval before the answer. |
| Lapse | A scored review graded below 3: `isLapse`. A leech is a card with 4 lapses or more, in either direction (`LEECH_LAPSES`). |
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
| Domain | [answerChain.ts](../packages/domain/src/answerChain.ts): the chains, repeats, scored reviews and lapses. [statistics.ts](../packages/domain/src/statistics.ts): activity by study day, totals, streaks, recall, recall by month, graded course answers, each deck's figures, the running total of cards introduced, and `todayOf`. [cardProgress.ts](../packages/domain/src/cardProgress.ts): new, young and mature. [scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts): the forecast, shared with the Studio. |
| Application | `getStatistics` and `getCardProgress` in [useCases.ts](../packages/application/src/useCases.ts): which months and documents to read. |
| UI | [StatisticsContainer.tsx](../packages/ui/src/ui/StatisticsContainer.tsx) and [StatisticsScreen.tsx](../packages/ui/src/ui/StatisticsScreen.tsx) (the page), [CardProgressContainer.tsx](../packages/ui/src/ui/CardProgressContainer.tsx) (where the cards stand), [StatisticsCharts.tsx](../packages/ui/src/ui/StatisticsCharts.tsx) (tiles, calendar, bar and line charts, the maturity bar), [DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx) and the today strip above. |

The statistics are the same for a guest ([guest-mode.md](guest-mode.md)),
whose answers are kept in the pod in their browser and move with the
rest of their study when they log in.

## How it is tested

- **Unit tests** at 100% coverage, as everywhere
  ([testing.md](testing.md)): `answerChain.test.ts`,
  `statistics.test.ts`, `cardProgress.test.ts` and
  `scheduleInsight.test.ts` in the domain, the passes over the whole
  log (`chainIndexOf`, `statisticsOf`) held to linear growth,
  the use cases in `useCases.test.ts`, and `StatisticsScreen.test.tsx`,
  `StatisticsCharts.test.tsx`, `CardProgressContainer.test.tsx` and
  `TodaySummary.test.tsx` in the UI.
- **User journeys**: in
  [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts),
  step 15 opens the page after two decks were studied, one card
  answered Again and then once more, and checks the tiles (the repeat
  is no review), the table by deck and every maturity bar. In
  [course-chapter.journey.ts](../e2e/journeys/journeys/course-chapter.journey.ts),
  step 09 checks that a course's answers show as graded course answers
  and not as recall. In
  [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts),
  steps 30 and 32 check that trying a course in the Studio's sandbox
  leaves the statistics as they were. The page object is
  [Statistics.ts](../e2e/journeys/pages/Statistics.ts). The latest
  run's screenshots are online at https://solid-memo.com/journeys/.
