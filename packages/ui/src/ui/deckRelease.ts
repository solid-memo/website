// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { ReportPlace } from "@solid-memo/domain/mistakeReport";
import { queryKeys } from "./queryKeys";

/**
 * The library release a deck was copied from (UseCases.deckRelease): null
 * for a deck not from the library, or no deck, undefined while it is read
 * or when it cannot be. Read once per release: a release never changes.
 */
export function useDeckRelease(
  useCases: UseCases,
  deck: Deck | undefined,
): LibraryDeckContent | null | undefined {
  return useDeckReleaseQuery(useCases, deck).release;
}

/**
 * The library release a deck was copied from, as useDeckRelease reads it,
 * and why it could not be read (`error`), for a screen that waits on it.
 */
export function useDeckReleaseQuery(
  useCases: UseCases,
  deck: Deck | undefined,
): { release: LibraryDeckContent | null | undefined; error: Error | null } {
  const sourceUrl = deck?.sourceUrl;
  const query = useQuery({
    queryKey: queryKeys.deckRelease(sourceUrl),
    queryFn: () => useCases.deckRelease(deck!),
    enabled: sourceUrl !== undefined,
    staleTime: Infinity,
  });
  return sourceUrl === undefined
    ? { release: null, error: null }
    : { release: query.data, error: query.error };
}

/**
 * Where a mistake in the release a deck was copied from is reported
 * (UseCases.reportPlace), the release, and the ids of its cards, the
 * only ones a study screen reports (StudyScreen's `report`): undefined
 * for a deck from no release, or no deck, and while either is read or
 * when it cannot be. Read once, as a release never changes; a card the
 * learner added is theirs to fix.
 */
export function useReportTarget(
  useCases: UseCases,
  deck: Deck | undefined,
): { place: ReportPlace; releaseUrl: string; cardIds: ReadonlySet<string> } | undefined {
  const sourceUrl = deck?.sourceUrl;
  const reportQuery = useQuery({
    queryKey: queryKeys.reportPlace(sourceUrl),
    queryFn: () => useCases.reportPlace(sourceUrl!),
    enabled: sourceUrl !== undefined,
    staleTime: Infinity,
  });
  const release = useDeckRelease(useCases, deck);
  return reportQuery.data === undefined || release === null || release === undefined
    ? undefined
    : {
        place: reportQuery.data,
        releaseUrl: sourceUrl!,
        cardIds: new Set(release.cards.map((card) => card.id)),
      };
}

/**
 * The ids of a card's distractors the release its deck came from
 * published (domain/distractors.ts: never deleted, only retired): none for
 * a deck not from the library or a card the release lacks, and, while the
 * release is read or when it cannot be, every one the card has, so none
 * is deleted before it is known.
 */
export function publishedDistractorIds(
  release: LibraryDeckContent | null | undefined,
  card: { id: string; distractors?: readonly { id: string }[] },
): ReadonlySet<string> {
  if (release === undefined)
    return new Set((card.distractors ?? []).map((distractor) => distractor.id));
  const published = release?.cards.find((released) => released.id === card.id);
  return new Set((published?.distractors ?? []).map((distractor) => distractor.id));
}
