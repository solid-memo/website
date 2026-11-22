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
 * deck whose every card is learned, none left to learn, whatever is due
 * (StudyCounts' learned); a course only once every chapter is done
 * (courseFinished) and every card of it learned too, never for its cards
 * alone; neither until it is known. Under the
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
  const learned = new Set(
    decks.filter((_, at) => counts[at]!.data?.learned).map((deck) => deck.url),
  );
  const finished = new Set(
    courses
      .filter((deck, at) => {
        const summary = summaries[at]!.data;
        return summary !== undefined && courseFinished(summary, deck);
      })
      .map((deck) => deck.url),
  );
  return (deck) => {
    if (!learned.has(deck.url)) return undefined;
    if (!isCourse(deck)) return "deck";
    return finished.has(deck.url) ? "course" : undefined;
  };
}
