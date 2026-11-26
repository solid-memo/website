// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { isPaused } from "@solid-memo/domain/deckPause";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { queries } from "./queries";

/**
 * Today's study day ("YYYY-MM-DD"), by the instance's day boundary (the
 * default one until the preferences are read). Unless `enabled`, it reads
 * the preferences only as another query has them.
 */
export function useStudyToday(
  useCases: Pick<UseCases, "getPreferences">,
  instanceUrl: string | null,
  enabled = true,
): string {
  const preferencesQuery = useQuery({ ...queries.preferences(useCases, instanceUrl), enabled });
  const { dayBoundaryHour } = preferencesQuery.data ?? DEFAULT_PREFERENCES;
  return studyDayOf(new Date(), dayBoundaryHour);
}

/**
 * Whether a deck is paused on today's study day (useStudyToday): a
 * paused deck stays out of today's strip and the course strip
 * (docs/srs.md, "Pausing a deck"). The use cases tell it apart on their
 * own, so a paused deck's counts are none whatever this says.
 */
export function usePausedToday(
  useCases: Pick<UseCases, "getPreferences">,
  instanceUrl: string | null,
  enabled = true,
): (deck: Deck) => boolean {
  const today = useStudyToday(useCases, instanceUrl, enabled);
  return (deck) => isPaused(deck, today);
}
