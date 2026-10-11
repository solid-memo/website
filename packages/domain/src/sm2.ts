import type { ReviewQuality } from "./review";

/** The three values the SM-2 algorithm transitions. */
export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export const MIN_EASE_FACTOR = 1.3;

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
 */
export function applySm2(state: Sm2State, quality: ReviewQuality): Sm2State {
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

function nextEaseFactor(easeFactor: number, quality: ReviewQuality): number {
  const q = 5 - quality;
  const updated = easeFactor + (0.1 - q * (0.08 + q * 0.02));
  return Math.max(MIN_EASE_FACTOR, updated);
}

function nextInterval(
  repetitions: number,
  previousIntervalDays: number,
  easeFactor: number,
): number {
  if (repetitions === 1) return 1;
  if (repetitions === 2) return 6;
  return Math.round(previousIntervalDays * easeFactor);
}
