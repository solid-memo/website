// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StatisticsReport } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Quiz, Recall } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import {
  ActivityCalendar,
  CoverageNote,
  IntroducedChart,
  onlyCourseAnswers,
  QuizTile,
  RecallChart,
  RecallTile,
  StatTile,
} from "./StatisticsCharts";
import { ReaderText } from "./ReaderText";

/**
 * The instance's study statistics: totals and streaks, the activity of
 * the last year, the cards introduced over it, how well reviews were
 * remembered, in all and month by month, how course questions were
 * answered, and each deck's figures. A deck that has since been removed
 * is named as such; where the log begins inside the range read, a note
 * says since when.
 */
export function StatisticsScreen({
  statistics,
  decks,
}: {
  statistics: StatisticsReport;
  decks: readonly Deck[];
}) {
  const { t, formatDate, formatPercent } = useI18n();
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
          </div>
          <ActivityCalendar days={statistics.days} today={statistics.today} />
          <h3>{t("statistics.progress")}</h3>
          <IntroducedChart days={statistics.days} today={statistics.today} />
          {!onlyCourseAnswers(statistics) && (
            <>
              <h3>{t("statistics.remembered")}</h3>
              <p class="hint">{t("statistics.rememberedHint")}</p>
              <div class="stat-tiles">
                <RecallTile label={t("statistics.young")} recall={retention.young} />
                <RecallTile label={t("statistics.mature")} recall={retention.mature} />
              </div>
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
          {/* Eight columns are wider than a phone: the table scrolls, its deck column stays. */}
          <div class="table-scroll" role="region" aria-labelledby="by-deck-heading" tabIndex={0}>
            <table class="deck-statistics">
              <thead>
                <tr>
                  <th scope="col">{t("statistics.deck")}</th>
                  <th scope="col">{t("statistics.answers")}</th>
                  <th scope="col">{t("statistics.introducedColumn")}</th>
                  <th scope="col">{t("statistics.youngRecall")}</th>
                  <th scope="col">{t("statistics.matureRecall")}</th>
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
