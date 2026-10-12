// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { todayOf } from "@solid-memo/domain/statistics";
import { studyCountsQuery } from "./DeckStudyAction";
import { statisticsHref } from "./router";
import { statisticsQuery } from "./studyFigures";
import { TodaySummary } from "./TodaySummary";

/**
 * Today's study above the deck list, from the answers of the last
 * twelve study months, whatever range the statistics page opens on, so
 * the streak record is the year's (one query with that page's "12m",
 * statisticsQuery): read again when the list opens and it is over half
 * a minute old, and at once after any change made, an answer in a
 * session or a course among them, which clears it. With it, the cards
 * left to study today in the `decks` listed, from the counts their rows
 * read (studyCountsQuery, one cache), once every deck's is known.
 * Nothing before the day's first answer, or when the answers cannot be
 * read: the deck list works without them.
 */
export function TodaySummaryContainer({
  useCases,
  instance,
  decks,
}: {
  useCases: UseCases;
  instance: Instance;
  decks: readonly Deck[];
}) {
  const statistics = useQuery(statisticsQuery(useCases, instance.url, "12m"));
  const counts = useQueries({
    queries: decks.map((deck) => studyCountsQuery(useCases, instance.url, deck)),
  });
  const known = counts.every((one) => one.data !== undefined);
  const left = known
    ? counts.reduce((sum, { data }) => sum + data!.dueCount + data!.newCount, 0)
    : undefined;
  const today = statistics.data === undefined ? null : todayOf(statistics.data);
  if (today === null) return null;
  return <TodaySummary today={today} left={left} statisticsHref={statisticsHref(instance.url)} />;
}
