// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import type { Deck } from "./deck";
import type { StudyPreferences } from "./preferences";

/**
 * A deck's own study caps. Each is optional: a deck that sets none is
 * studied at the instance's pace (its preferences), and one that sets
 * only one cap follows the preferences for the other.
 */
export interface DeckPace {
  newCardsPerDay?: number;
  maxReviewsPerDay?: number;
}

/** The caps a deck sets itself. */
export function paceOf(deck: Deck): DeckPace {
  return {
    ...(deck.newCardsPerDay === undefined ? {} : { newCardsPerDay: deck.newCardsPerDay }),
    ...(deck.maxReviewsPerDay === undefined ? {} : { maxReviewsPerDay: deck.maxReviewsPerDay }),
  };
}

/**
 * The deck with its caps replaced by `pace`; a cap left out goes back to
 * the preferences. Throws on a cap that is not a whole number, 0 or more.
 */
export function withPace(deck: Deck, pace: DeckPace): Deck {
  for (const cap of [pace.newCardsPerDay, pace.maxReviewsPerDay]) {
    if (cap !== undefined && !(Number.isInteger(cap) && cap >= 0)) {
      throw new AppError("dailyLimitInvalid");
    }
  }
  const { newCardsPerDay: _new, maxReviewsPerDay: _max, ...rest } = deck;
  return { ...rest, ...paceOf({ ...rest, ...pace }) };
}

/** The preferences a deck is studied with: the instance's, with the deck's own caps in their place. */
export function deckPreferences(prefs: StudyPreferences, deck: Deck): StudyPreferences {
  return { ...prefs, ...paceOf(deck) };
}
