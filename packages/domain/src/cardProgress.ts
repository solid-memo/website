// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { activeCards, promptsOf, type Card, type DeckDirection } from "./deck";
import type { ReviewState } from "./review";
import { FORECAST_DAYS, scheduledStates, type ForecastDay } from "./scheduleInsight";
import { MATURE_INTERVAL_DAYS, shiftStudyDay } from "./answer";

/**
 * How far along a deck's prompts are, computed from its cards and review
 * states as they are now: how many are still new, relearning, young or
 * mature, each prompt in one of them. A prompt is a card in one
 * direction, so a deck studied both ways counts each card twice.
 */
export interface CardProgress {
  /** Prompts never reviewed. */
  new: number;
  /**
   * Prompts forgotten last time and not remembered since: SM-2 leaves
   * them no repetition in a row (sm2.ts), as the card query's "learning"
   * state has it (cardQuery.ts). Not a beginner's stage: a card passed
   * once is never back in it until it is forgotten.
   */
  relearning: number;
  /** Other prompts reviewed at an interval below MATURE_INTERVAL_DAYS. */
  young: number;
  /** Other prompts reviewed at an interval of MATURE_INTERVAL_DAYS or more. */
  mature: number;
}

/**
 * The progress of a deck's active prompts in its direction: a review
 * state of a retired card, or of a direction the deck is not studied in,
 * counts for nothing (scheduledStates, as in scheduleOf, studyDigest.ts).
 */
export function cardProgressOf(input: {
  cards: Card[];
  direction: DeckDirection;
  reviews: ReviewState[];
}): CardProgress {
  const { cards, direction, reviews } = input;
  const states = scheduledStates(cards, direction, reviews);
  const passed = states.filter((state) => state.repetitions > 0);
  const young = passed.filter((state) => state.intervalDays < MATURE_INTERVAL_DAYS).length;
  return {
    new: promptsOf(activeCards(cards), direction).length - states.length,
    relearning: states.length - passed.length,
    young,
    mature: passed.length - young,
  };
}

/** The progress of several decks taken together. */
export function mergeCardProgress(list: readonly CardProgress[]): CardProgress {
  const merged: CardProgress = { new: 0, relearning: 0, young: 0, mature: 0 };
  for (const progress of list) {
    merged.new += progress.new;
    merged.relearning += progress.relearning;
    merged.young += progress.young;
    merged.mature += progress.mature;
  }
  return merged;
}

/**
 * Several decks' forecasts (forecastOf, scheduleInsight.ts, each over
 * FORECAST_DAYS study days from `today`) taken together: on each day,
 * what falls due and the reviews let through, of every deck.
 */
export function mergeForecasts(
  list: readonly (readonly ForecastDay[])[],
  today: string,
): ForecastDay[] {
  const merged = Array.from({ length: FORECAST_DAYS }, (_, offset) => ({
    studyDay: shiftStudyDay(today, offset),
    due: 0,
    reviews: 0,
  }));
  for (const forecast of list) {
    forecast.forEach((day, offset) => {
      merged[offset]!.due += day.due;
      merged[offset]!.reviews += day.reviews;
    });
  }
  return merged;
}

/**
 * The study day the last of `count` new prompts is introduced, at
 * `newCardsPerDay` a day, as a learner who studies each day would meet
 * them: today only what is left of the cap after the `introducedToday`
 * prompts already met today (as buildStudyQueue, scheduling.ts), each
 * later day the whole cap. Null when the cap is 0, as they never would.
 */
export function newCardsRunOutOf(input: {
  count: number;
  newCardsPerDay: number;
  introducedToday: number;
  today: string;
}): string | null {
  const { count, newCardsPerDay, introducedToday, today } = input;
  if (newCardsPerDay === 0) return null;
  const leftToday = Math.max(0, newCardsPerDay - introducedToday);
  if (count <= leftToday) return today;
  return shiftStudyDay(today, Math.ceil((count - leftToday) / newCardsPerDay));
}
