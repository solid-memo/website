// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StatisticsReport } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Quiz, Recall } from "@solid-memo/domain/statistics";
import { RECENT_DAYS, type DirectionRecall, type FirstTry } from "@solid-memo/domain/studyPatterns";
import { ActivityCalendar } from "./charts/ActivityCalendar";
import { DayHeldBars } from "./charts/DayHeldBars";
import { GradeBars } from "./charts/GradeBars";
import { IntakeChart } from "./charts/IntakeChart";
import { IntroducedChart } from "./charts/IntroducedChart";
import { RecallChart } from "./charts/RecallChart";
import {
  CoverageNote,
  FirstTryTile,
  onlyCourseAnswers,
  PeriodTiles,
  QuizTile,
  RecallTile,
  StatTile,
} from "./charts/StatTiles";
import { WeekdayChart } from "./charts/WeekdayChart";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/**
 * The instance's study statistics: totals, streaks and the days studied
 * of late, the activity of the last year, what each recent day held and
 * how the weekdays are studied, this week and month beside the last; the
 * cards introduced, how many were remembered the first time and the new
 * cards beside the reviews by week; how well reviews were remembered, in
 * all and month by month, with the answer buttons pressed; how course
 * questions were answered, and each deck's figures. A deck that has
 * since been removed is named as such; where the log begins inside the
 * range read, a note says since when.
 */
export function StatisticsScreen({
  statistics,
  decks,
}: {
  statistics: StatisticsReport;
  decks: readonly Deck[];
}) {
  const { t, formatDate, formatPercent, directionLabel } = useI18n();
  const { totals, streaks, retention, quiz } = statistics;
  const nameOf = (deckUrl: string) => {
    const deck = decks.find((d) => d.url === deckUrl);
    return deck === undefined ? t("statistics.removedDeck") : <ReaderText text={deck.title} />;
  };
  // A share with the count it is of, however few; a dash when there are none.
  const recallCell = ({ reviews, recalled }: Recall) =>
    reviews === 0
      ? "–"
      : t("statistics.recallShare", { percent: formatPercent(recalled / reviews), count: reviews });
  const quizCell = ({ answers, right }: Quiz) =>
    answers === 0
      ? "–"
      : t("statistics.quizShare", { percent: formatPercent(right / answers), count: answers });
  const firstTryCell = ({ introduced, recalled }: FirstTry) =>
    introduced === 0
      ? "–"
      : t("statistics.firstTryShare", {
          percent: formatPercent(recalled / introduced),
          count: introduced,
        });
  // Recall each way, only where a deck has reviews both ways.
  const directionsCell = (directions: readonly DirectionRecall[]) =>
    directions.length < 2
      ? "–"
      : directions
          .map(({ direction, recall }) =>
            t("statistics.directionShare", {
              direction: directionLabel(direction),
              share: recallCell(recall),
            }),
          )
          .join(" · ");
  return (
    <section class="statistics" aria-labelledby="statistics-heading">
      <h2 id="statistics-heading">{t("statistics.heading")}</h2>
      {totals.answers === 0 ? (
        <p class="hint">{t("statistics.empty")}</p>
      ) : (
        <>
          <CoverageNote coverage={statistics.coverage} />
          <div class="stat-tiles">
            <StatTile label={t("statistics.answers")} value={String(totals.answers)} />
            <StatTile label={t("statistics.studyDays")} value={String(totals.studyDays)} />
            <StatTile label={t("statistics.cards")} value={String(totals.cards)} />
            <StatTile
              label={t("statistics.currentStreak")}
              value={t("statistics.dayCount", { count: streaks.current })}
            />
            <StatTile
              label={t("statistics.longestStreak")}
              value={t("statistics.dayCount", { count: streaks.longest })}
            />
            <StatTile
              label={t("statistics.recentDays", { count: RECENT_DAYS })}
              value={t("statistics.recentDaysValue", {
                studied: statistics.recentStudyDays,
                count: RECENT_DAYS,
              })}
              detail={formatPercent(statistics.recentStudyDays / RECENT_DAYS)}
            />
          </div>
          <ActivityCalendar days={statistics.days} today={statistics.today} />
          <DayHeldBars days={statistics.days} today={statistics.today} />
          <WeekdayChart weekdays={statistics.weekdays} />
          <h3>{t("statistics.thisWeek")}</h3>
          <PeriodTiles period="week" figures={statistics.week} />
          <h3>{t("statistics.thisMonth")}</h3>
          <PeriodTiles period="month" figures={statistics.month} />
          <h3>{t("statistics.progress")}</h3>
          <IntroducedChart days={statistics.days} today={statistics.today} />
          {!onlyCourseAnswers(statistics) && (
            <div class="stat-tiles">
              <FirstTryTile firstTry={statistics.firstTry} />
            </div>
          )}
          <IntakeChart weeks={statistics.intake} />
          {!onlyCourseAnswers(statistics) && (
            <>
              <h3>{t("statistics.remembered")}</h3>
              <p class="hint">{t("statistics.rememberedHint")}</p>
              <div class="stat-tiles">
                <RecallTile label={t("statistics.young")} recall={retention.young} />
                <RecallTile label={t("statistics.mature")} recall={retention.mature} />
              </div>
              <GradeBars buttons={statistics.buttons} />
              {retention.young.reviews + retention.mature.reviews > 0 && (
                <RecallChart months={statistics.months} />
              )}
            </>
          )}
          {quiz.answers > 0 && (
            <>
              <h3>{t("statistics.inCourses")}</h3>
              <p class="hint">{t("statistics.quizHint")}</p>
              <div class="stat-tiles">
                <QuizTile quiz={quiz} />
              </div>
            </>
          )}
          <h3 id="by-deck-heading">{t("statistics.byDeck")}</h3>
          {/* Ten columns are wider than a phone: the table scrolls, its deck column stays. */}
          <div class="table-scroll" role="region" aria-labelledby="by-deck-heading" tabIndex={0}>
            <table class="deck-statistics">
              <thead>
                <tr>
                  <th scope="col">{t("statistics.deck")}</th>
                  <th scope="col">{t("statistics.answers")}</th>
                  <th scope="col">{t("statistics.introducedColumn")}</th>
                  <th scope="col">{t("statistics.youngRecall")}</th>
                  <th scope="col">{t("statistics.matureRecall")}</th>
                  <th scope="col">{t("statistics.directionsColumn")}</th>
                  <th scope="col">{t("statistics.firstTry")}</th>
                  <th scope="col">{t("statistics.lapses")}</th>
                  <th scope="col">{t("statistics.quizAccuracy")}</th>
                  <th scope="col">{t("statistics.lastStudied")}</th>
                </tr>
              </thead>
              <tbody>
                {statistics.decks.map((deck) => (
                  <tr key={deck.deckUrl}>
                    <th scope="row">{nameOf(deck.deckUrl)}</th>
                    <td>{deck.answers}</td>
                    <td>{deck.introduced}</td>
                    <td>{recallCell(deck.retention.young)}</td>
                    <td>{recallCell(deck.retention.mature)}</td>
                    <td>{directionsCell(deck.directions)}</td>
                    <td>{firstTryCell(deck.firstTry)}</td>
                    <td>{deck.lapses}</td>
                    <td>{quizCell(deck.quiz)}</td>
                    <td>{formatDate(deck.lastStudyDay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
