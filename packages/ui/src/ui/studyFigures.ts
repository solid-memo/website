// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { QueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { StatisticsRange as RangeRead } from "@solid-memo/application/statistics";
import type { StatisticsRange } from "./router";

/**
 * How long the statistics and card progress read are shown again without
 * reading them anew: any change made clears them at once
 * (keepStudyFiguresFresh), so this only spares the reads when a page
 * opens again soon.
 */
export const STATISTICS_STALE_MS = 30_000;

/**
 * Marks the statistics (the today strip's among them), the cards'
 * progress and the cards' answers (their history) stale, of every
 * instance, whenever a change made in the app ends, whether it was
 * written or not: an answer, a card or deck added, edited or removed, a
 * deck's pace, the preferences, a guest's study brought over, a Studio
 * edit. Any of them can change what they show, and every one is a
 * mutation, so none is left out. Those shown are read again at once, the
 * others when next shown. Returns the unsubscribe.
 */
export function keepStudyFiguresFresh(queryClient: QueryClient): () => void {
  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type !== "success" && event.action.type !== "error") return;
    void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    void queryClient.invalidateQueries({ queryKey: ["cardProgress"] });
    void queryClient.invalidateQueries({ queryKey: ["cardAnswers"] });
  });
}

/** What getStatistics reads for a range of the statistics' routes: "12m" is its default, the today strip's. */
export function rangeRead(range: StatisticsRange): RangeRead {
  switch (range) {
    case "30d":
      return { range: 30 };
    case "90d":
      return { range: 90 };
    case "12m":
      return {};
    case "all":
      return { range: "all" };
  }
}

/**
 * The statistics of a range, of every deck of the instance or of one
 * (by its URL), as one query: of every deck over the last 12 months it
 * is the today strip's (TodaySummaryContainer), so neither reads them
 * for the other.
 */
export function statisticsQuery(
  useCases: UseCases,
  instanceUrl: string,
  range: StatisticsRange,
  deckUrl?: string,
) {
  const read = rangeRead(range);
  return {
    queryKey:
      deckUrl !== undefined
        ? ["statistics", instanceUrl, deckUrl, range]
        : range === "12m"
          ? ["statistics", instanceUrl]
          : ["statistics", instanceUrl, "range", range],
    queryFn: () =>
      useCases.getStatistics(
        instanceUrl,
        new Date(),
        deckUrl === undefined ? read : { ...read, deckUrl },
      ),
    staleTime: STATISTICS_STALE_MS,
  };
}
