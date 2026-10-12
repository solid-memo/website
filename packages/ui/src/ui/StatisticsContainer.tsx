// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CardProgressContainer } from "./CardProgressContainer";
import { CourseStatisticsContainer } from "./CourseStatistics";
import { HardestCardsContainer } from "./HardestCardsContainer";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { StatisticsScreen } from "./StatisticsScreen";
import { STATISTICS_STALE_MS } from "./studyFigures";

/**
 * Reads the instance's statistics, of the last twelve study months, when
 * the page opens and what was read is over half a minute old (any change
 * made clears it at once); where its cards stand comes after them, read on
 * its own, so neither waits for the other and it shows before any answer,
 * then the leeches of every deck, from the same read, and how the courses
 * among the decks have gone, read on their own too.
 */
export function StatisticsContainer({
  useCases,
  instance,
  decks,
}: {
  useCases: UseCases;
  instance: Instance;
  decks: readonly Deck[];
}) {
  const { t, errorText } = useI18n();
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date()),
    staleTime: STATISTICS_STALE_MS,
  });
  return (
    <>
      {statisticsQuery.error ? (
        <ErrorMessage error={errorText(statisticsQuery.error)} />
      ) : statisticsQuery.data === undefined ? (
        <Loading label={t("statistics.loading")} />
      ) : (
        <StatisticsScreen statistics={statisticsQuery.data} decks={decks} />
      )}
      <CardProgressContainer useCases={useCases} instance={instance} />
      <HardestCardsContainer useCases={useCases} instance={instance} />
      <CourseStatisticsContainer useCases={useCases} instance={instance} decks={decks} />
    </>
  );
}
