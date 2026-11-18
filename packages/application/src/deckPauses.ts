// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "@solid-memo/domain/deck";
import { withPause, withResume } from "@solid-memo/domain/deckPause";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import type { DeckRepository } from "./ports";
import type { PreferenceStore } from "./preferenceStore";

export interface DeckPauseUseCases {
  /**
   * Pause the deck from `now`: until the learner resumes it (null), or
   * until the study day `resumesOn`, which must come after today
   * (resumeDayInvalid, before any write). Kept on the deck's entry as it
   * is now; no review state changes (docs/srs.md, "Pausing a deck").
   */
  pauseDeck(instanceUrl: string, deck: Deck, resumesOn: string | null, now: Date): Promise<Deck>;
  /**
   * Resume a paused deck today: its pause keeps its start, with today as
   * its resume day, which tells the backlog it left. A deck not paused
   * today writes nothing.
   */
  resumeDeck(instanceUrl: string, deck: Deck, now: Date): Promise<Deck>;
}

/** Pausing and resuming a deck, on the study day of the instance's preferences. */
export function createDeckPauseUseCases({
  deckRepository,
  preferenceStore,
}: {
  deckRepository: Pick<DeckRepository, "setPause">;
  preferenceStore: Pick<PreferenceStore, "get">;
}): DeckPauseUseCases {
  async function todayOf(instanceUrl: string, now: Date) {
    const prefs = await preferenceStore.get(instanceUrl);
    return studyDayOf(now, prefs.dayBoundaryHour);
  }
  return {
    async pauseDeck(instanceUrl, deck, resumesOn, now) {
      const paused = withPause(deck, now, resumesOn, await todayOf(instanceUrl, now));
      return deckRepository.setPause(deck, paused.pause!);
    },
    async resumeDeck(instanceUrl, deck, now) {
      const resumed = withResume(deck, await todayOf(instanceUrl, now));
      return resumed === deck ? deck : deckRepository.setPause(deck, resumed.pause!);
    },
  };
}
