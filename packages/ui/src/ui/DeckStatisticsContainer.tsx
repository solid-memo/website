// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CardProgressContainer } from "./CardProgressContainer";
import { useI18n } from "./i18n";
import {
  DayHeldBars,
  FirstTryTile,
  GradeBars,
  onlyCourseAnswers,
  QuizTile,
  RecallTile,
} from "./StatisticsCharts";
import { STATISTICS_STALE_MS } from "./studyFigures";

/**
 * A deck's own statistics on its page: what each of its last 30 days
 * held; how well its reviews were remembered (each way apart, when it
 * has reviews both ways), how many cards the first time, and the answer
 * buttons pressed; and how its course questions were answered (only
 * these for a deck studied only in a course's chapters). Nothing of them
 * while there are no answers yet, or when they cannot be read (the deck
 * works without them); then where its cards stand, all new before the
 * first answer.
 */
export function DeckStatisticsContainer({
  useCases,
  instance,
  deck,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
}) {
  const { t, directionLabel } = useI18n();
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url, deck.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date(), { deckUrl: deck.url }),
    staleTime: STATISTICS_STALE_MS,
  });
  const statistics = statisticsQuery.data;
  return (
    <>
      {statistics !== undefined && statistics.totals.answers > 0 && (
        <section
          class="statistics deck-statistics-section"
          aria-labelledby="deck-statistics-heading"
        >
          <h3 id="deck-statistics-heading">{t("statistics.heading")}</h3>
          <DayHeldBars days={statistics.days} today={statistics.today} />
          <div class="stat-tiles">
            {!onlyCourseAnswers(statistics) && (
              <>
                <RecallTile label={t("statistics.young")} recall={statistics.retention.young} />
                <RecallTile label={t("statistics.mature")} recall={statistics.retention.mature} />
                {statistics.directions.length > 1 &&
                  statistics.directions.map(({ direction, recall }) => (
                    <RecallTile key={direction} label={directionLabel(direction)} recall={recall} />
                  ))}
                <FirstTryTile firstTry={statistics.firstTry} />
              </>
            )}
            {statistics.quiz.answers > 0 && <QuizTile quiz={statistics.quiz} />}
          </div>
          {!onlyCourseAnswers(statistics) && <GradeBars buttons={statistics.buttons} />}
        </section>
      )}
      <CardProgressContainer useCases={useCases} instance={instance} deck={deck} />
    </>
  );
}
