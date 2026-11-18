// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { isPaused } from "@solid-memo/domain/deckPause";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { queryKeys } from "./queryKeys";

/**
 * Whether a deck is paused on today's study day, by the instance's day
 * boundary (the default one until the preferences are read): a paused
 * deck stays out of today's strip and the course strip (docs/srs.md,
 * "Pausing a deck"). The use cases tell it apart on their own, so a
 * paused deck's counts are none whatever this says. Unless `enabled`,
 * it reads the preferences only as another query has them.
 */
export function usePausedToday(
  useCases: Pick<UseCases, "getPreferences">,
  instanceUrl: string | null,
  enabled = true,
): (deck: Deck) => boolean {
  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences(instanceUrl),
    queryFn: () => useCases.getPreferences(instanceUrl!),
    enabled: enabled && instanceUrl !== null,
  });
  const { dayBoundaryHour } = preferencesQuery.data ?? DEFAULT_PREFERENCES;
  const today = studyDayOf(new Date(), dayBoundaryHour);
  return (deck) => isPaused(deck, today);
}
