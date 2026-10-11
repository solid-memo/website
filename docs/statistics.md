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
  the share remembered (answers graded 3 or more), then a link, "All
  statistics", to the statistics page.

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
| Remembered in reviews | Two tiles, young and mature cards: the share of reviews remembered. Then "Recall by month", the same split month by month, young as a dashed line and mature as a solid one. |
| By deck | A table of each deck's answers and the day it was last studied. A deck since removed is "A removed deck". |
| Where your cards stand | How many cards are new, young and mature, as one bar; the reviews due on each of the next 30 days; then each deck's own bar. |

A card is *young* while it is reviewed at an interval under 21 days and
*mature* from 21 days on. A card studied both ways counts once each
way, and the page says so.

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
as bars, and the young and mature recall tiles. Then where its cards
stand, all new before the first answer
([DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx)).

## Where the code is

| Layer | Files |
|---|---|
| Domain | [statistics.ts](../packages/domain/src/statistics.ts): activity by study day, totals, streaks, recall, recall by month, the running total of cards introduced, and `todayOf`. [cardProgress.ts](../packages/domain/src/cardProgress.ts): new, young and mature. [scheduleInsight.ts](../packages/domain/src/scheduleInsight.ts): the forecast, shared with the Studio. |
| Application | `getStatistics` and `getCardProgress` in [useCases.ts](../packages/application/src/useCases.ts): which months and documents to read. |
| UI | [StatisticsContainer.tsx](../packages/ui/src/ui/StatisticsContainer.tsx) and [StatisticsScreen.tsx](../packages/ui/src/ui/StatisticsScreen.tsx) (the page), [CardProgressContainer.tsx](../packages/ui/src/ui/CardProgressContainer.tsx) (where the cards stand), [StatisticsCharts.tsx](../packages/ui/src/ui/StatisticsCharts.tsx) (tiles, calendar, bar and line charts, the maturity bar), [DeckStatisticsContainer.tsx](../packages/ui/src/ui/DeckStatisticsContainer.tsx) and the today strip above. |

The statistics are the same for a guest ([guest-mode.md](guest-mode.md)),
whose answers are kept in the pod in their browser and move with the
rest of their study when they log in.

## How it is tested

- **Unit tests** at 100% coverage, as everywhere
  ([testing.md](testing.md)): `statistics.test.ts`,
  `cardProgress.test.ts` and `scheduleInsight.test.ts` in the domain,
  the use cases in `useCases.test.ts`, and `StatisticsScreen.test.tsx`,
  `StatisticsCharts.test.tsx`, `CardProgressContainer.test.tsx` and
  `TodaySummary.test.tsx` in the UI.
- **User journeys**: in
  [full-learner.journey.ts](../e2e/journeys/journeys/full-learner.journey.ts),
  step 15 opens the page after two decks were studied and checks the
  tiles, the table by deck and every maturity bar. In
  [studio.journey.ts](../e2e/journeys/journeys/studio.journey.ts),
  steps 30 and 32 check that trying a course in the Studio's sandbox
  leaves the statistics as they were. The page object is
  [Statistics.ts](../e2e/journeys/pages/Statistics.ts). The latest
  run's screenshots are online at https://solid-memo.com/journeys/.
