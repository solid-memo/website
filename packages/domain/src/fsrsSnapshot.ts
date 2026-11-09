// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { FsrsSnapshot } from "./review";
import { isCarriedOverInstant, isStudyDay } from "./reviewStateEdits";

/** The bounds of an FSRS-6 stability, in days, as the write check keeps them (above 0). */
export const MIN_STABILITY = 0.001;
export const MAX_STABILITY = 36_500;

/** The bounds of an FSRS-6 difficulty. */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/**
 * The fields a review of a state overwrites, bounded as the write check
 * expects them (docs/srs.md, boundedFsrsMemory). A snapshot whose due
 * day is not a real "YYYY-MM-DD" date (isStudyDay), or whose last review
 * is outside the years a grade carries over (isCarriedOverInstant), is
 * dropped (undefined), so a state read from elsewhere still takes
 * grades.
 */
export function boundedFsrsSnapshot(snapshot: FsrsSnapshot): FsrsSnapshot | undefined {
  const { stability, difficulty, due, lastReviewedAt } = snapshot;
  if (!isStudyDay(due) || !isCarriedOverInstant(lastReviewedAt)) return undefined;
  return { ...boundedFsrsMemory({ stability, difficulty }), due, lastReviewedAt };
}

/**
 * A stability and difficulty within the bounds the write check expects:
 * the stability from 0.001 to 36,500 days, the difficulty from 1 to 10.
 * An infinite one takes the bound on its side, and one that is no number
 * the lower bound. An SM-2 state with a
 * number that is not finite counts as a new card's instead
 * (boundedSm2State): SM-2 has a new card's state to fall back to, and
 * FSRS-6 has none but an estimate from the SM-2 state, so its memory
 * keeps the nearest one it may write.
 */
export function boundedFsrsMemory(
  memory: Pick<FsrsSnapshot, "stability" | "difficulty">,
): Pick<FsrsSnapshot, "stability" | "difficulty"> {
  return {
    stability: clamp(memory.stability, MIN_STABILITY, MAX_STABILITY),
    difficulty: clamp(memory.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return value > min ? Math.min(max, value) : min;
}
