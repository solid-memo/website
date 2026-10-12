// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { todayOf } from "@solid-memo/domain/statistics";
import { statisticsHref } from "./router";
import { STATISTICS_STALE_MS } from "./studyFigures";
import { TodaySummary } from "./TodaySummary";

/**
 * Today's study above the deck list, from the statistics page's own read
 * (one query, of the last twelve study months, so the streak record is
 * the year's): read again when the list opens and it is over half a
 * minute old, and at once after any change made, an answer in a
 * session or a course among them, which clears it. Nothing before the day's first answer, or when the
 * answers cannot be read: the deck list works without them.
 */
export function TodaySummaryContainer({
  useCases,
  instance,
}: {
  useCases: UseCases;
  instance: Instance;
}) {
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date()),
    staleTime: STATISTICS_STALE_MS,
  });
  const today = statisticsQuery.data === undefined ? null : todayOf(statisticsQuery.data);
  if (today === null) return null;
  return <TodaySummary today={today} statisticsHref={statisticsHref(instance.url)} />;
}
