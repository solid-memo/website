// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { todayOf, welcomeBackOf } from "@solid-memo/domain/statistics";
import { expectedTimeToday } from "@solid-memo/domain/studyTime";
import { studyCountsQuery } from "./DeckStudyAction";
import { statisticsHref } from "./router";
import { todayFiguresQuery } from "./studyFigures";
import { TodaySummary } from "./TodaySummary";
import { WelcomeBack } from "./WelcomeBack";

/**
 * Today's study above the deck list, from the answers of the last
 * twelve study months, whatever range the statistics page opens on, so
 * the streak record is the year's (getTodayFigures, which reads only
 * the months that changed since the digest summarized them): read again
 * when the list opens and it is over half a minute old, and at once
 * after any change made, an answer in a session or a course among them,
 * which clears it (todayFiguresQuery). With it, the cards
 * left to study today in the `decks` listed, from the counts their rows
 * read (studyCountsQuery, one cache), once every deck's is known, and
 * about how many minutes they will take, from how long an answer has
 * taken and how often young cards were forgotten over those months
 * (expectedTimeToday), a minute at least.
 * Before the day's first answer, a word of welcome back in its place,
 * with the streak that studying today keeps (WelcomeBack), for a learner
 * who has studied before. Nothing when the answers cannot be read: the
 * deck list works without them.
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
  const figures = useQuery(todayFiguresQuery(useCases, instance.url));
  const counts = useQueries({
    queries: decks.map((deck) => studyCountsQuery(useCases, instance.url, deck)),
  });
  const known = counts.every((one) => one.data !== undefined);
  const reviews = counts.reduce((sum, { data }) => sum + (data?.dueCount ?? 0), 0);
  const newCards = counts.reduce((sum, { data }) => sum + (data?.newCount ?? 0), 0);
  if (figures.data === undefined) return null;
  const ms = expectedTimeToday({
    reviews,
    newCards,
    young: figures.data.young,
    medianAnswerMs: figures.data.medianAnswerMs,
  });
  const left = known ? reviews + newCards : undefined;
  const minutesLeft = ms === null ? undefined : Math.max(1, Math.round(ms / 60_000));
  const today = todayOf(figures.data);
  if (today === null) {
    const welcome = welcomeBackOf(figures.data);
    return welcome === null ? null : (
      <WelcomeBack welcome={welcome} left={left} minutesLeft={minutesLeft} />
    );
  }
  return (
    <TodaySummary
      today={today}
      left={left}
      minutesLeft={minutesLeft}
      statisticsHref={statisticsHref(instance.url)}
    />
  );
}
