// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQueries } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { courseFinished, courseStripQuery } from "./CourseStrip";
import { studyCountsQuery } from "./DeckStudyAction";
import type { Completion } from "./RowFlair";

/**
 * What each deck studied today has completed, for its deck-list row: a
 * course whose every chapter is done (courseFinished), else a deck whose
 * every card is learned, none left to learn, whatever is due
 * (StudyCounts' learned); neither until it is known. Under the
 * keys the rows' counts (studyCountsQuery) and the course strip's
 * summaries (courseStripQuery) are read by, so nothing is read twice.
 */
export function useDeckCompletion(
  useCases: UseCases,
  instance: Instance,
  /** The decks studied today: neither set aside nor paused. */
  decks: readonly Deck[],
  isCourse: (deck: Deck) => boolean,
): (deck: Deck) => Completion | undefined {
  const courses = decks.filter(isCourse);
  const counts = useQueries({
    queries: decks.map((deck) => studyCountsQuery(useCases, instance.url, deck)),
  });
  const summaries = useQueries({
    queries: courses.map((deck) => courseStripQuery(useCases, deck)),
  });
  const completed = new Map<string, Completion>();
  decks.forEach((deck, at) => {
    const queue = counts[at]!.data;
    if (queue?.learned) completed.set(deck.url, "deck");
  });
  courses.forEach((deck, at) => {
    const summary = summaries[at]!.data;
    if (summary !== undefined && courseFinished(summary, deck)) completed.set(deck.url, "course");
  });
  return (deck) => completed.get(deck.url);
}
