// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReviewQuality } from "./review";

/** The three values the SM-2 algorithm transitions. */
export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export const MIN_EASE_FACTOR = 1.3;

/** The highest ease factor: 25 grades of 5 in a row from the start. */
export const MAX_EASE_FACTOR = 5;

/** The longest interval, in days: 100 years, for SM-2 and FSRS-6 alike. */
export const MAX_INTERVAL_DAYS = 36_500;

export const INITIAL_SM2_STATE: Sm2State = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
};

/**
 * One SM-2 transition (SuperMemo 2). Source: Woźniak, P. A. (1990).
 * Optimization of learning. Master's thesis, University of Technology
 * in Poznań. Described at
 * https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 * (docs/srs.md, which also says where Solid Memo departs from it).
 *
 * quality >= 3 (correct): repetitions increments; the ease factor is
 * updated first and the new value is used for the interval growth.
 * quality < 3 (lapse): repetitions and interval reset, ease factor kept.
 *
 * The state read is bounded first (boundedSm2State), and the one given
 * keeps the ease factor from 1.3 to 5 and the interval from 1 to 36,500
 * days, so that a state from elsewhere still gives a due day that can
 * be written.
 */
export function applySm2(read: Sm2State, quality: ReviewQuality): Sm2State {
  const state = boundedSm2State(read);
  if (quality < 3) {
    return {
      easeFactor: state.easeFactor,
      intervalDays: 1,
      repetitions: 0,
    };
  }

  const easeFactor = nextEaseFactor(state.easeFactor, quality);
  const repetitions = state.repetitions + 1;
  return {
    easeFactor,
    repetitions,
    intervalDays: nextInterval(repetitions, state.intervalDays, easeFactor),
  };
}

/**
 * An SM-2 state within the bounds Solid Memo keeps (docs/srs.md): the
 * ease factor from 1.3 to 5, the interval and the repetitions from 0
 * to 36,500. A state with a value that is not a finite number counts as
 * a new one. Bounded, a state from elsewhere is written back as numbers
 * the write check accepts.
 */
export function boundedSm2State(state: Sm2State): Sm2State {
  const { easeFactor, intervalDays, repetitions } = state;
  if (![easeFactor, intervalDays, repetitions].every(Number.isFinite)) return INITIAL_SM2_STATE;
  return {
    easeFactor: clamp(easeFactor, MIN_EASE_FACTOR, MAX_EASE_FACTOR),
    intervalDays: clamp(intervalDays, 0, MAX_INTERVAL_DAYS),
    repetitions: clamp(repetitions, 0, MAX_INTERVAL_DAYS),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextEaseFactor(easeFactor: number, quality: ReviewQuality): number {
  const q = 5 - quality;
  const updated = easeFactor + (0.1 - q * (0.08 + q * 0.02));
  return clamp(updated, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
}

function nextInterval(
  repetitions: number,
  previousIntervalDays: number,
  easeFactor: number,
): number {
  if (repetitions === 1) return 1;
  if (repetitions === 2) return 6;
  return clamp(Math.round(previousIntervalDays * easeFactor), 1, MAX_INTERVAL_DAYS);
}
