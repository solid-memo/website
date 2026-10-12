// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CardProgressContainer } from "./CardProgressContainer";
import { FirstTryTile, onlyCourseAnswers, QuizTile, RecallTile } from "./charts/StatTiles";
import { HardestCardsContainer } from "./HardestCardsContainer";
import { useI18n } from "./i18n";
import { DEFAULT_STATISTICS_RANGE, deckStatisticsHref } from "./router";
import { statisticsQuery } from "./studyFigures";

/**
 * A deck's own statistics on its page, in short, of the range its
 * statistics page opens on (one read for both): how well its reviews
 * were remembered (each way apart, when it has reviews both ways) and
 * how many cards the first time, and how its course questions were
 * answered (only these for a deck studied only in a course's chapters).
 * Nothing of them while the range has no answers, or when they cannot
 * be read (the deck works without them). Then, always, a link to the
 * rest ("More statistics"), whose longer ranges reach older answers;
 * then where its cards stand, all new before the first answer, and its
 * hardest cards and most-confused options.
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
  const statistics = useQuery(
    statisticsQuery(useCases, instance.url, DEFAULT_STATISTICS_RANGE, deck.url),
  ).data;
  return (
    <>
      {statistics !== undefined && statistics.totals.answers > 0 && (
        <section
          class="statistics deck-statistics-section"
          aria-labelledby="deck-statistics-heading"
        >
          <h3 id="deck-statistics-heading">{t("statistics.heading")}</h3>
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
        </section>
      )}
      <p>
        <a href={deckStatisticsHref(instance.url, deck.url)}>{t("statistics.moreStatistics")}</a>
      </p>
      <CardProgressContainer useCases={useCases} instance={instance} deck={deck} />
      <HardestCardsContainer useCases={useCases} instance={instance} deck={deck} />
    </>
  );
}
