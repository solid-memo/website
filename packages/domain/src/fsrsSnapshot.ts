// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { FsrsSnapshot } from "./review";
import { isStudyDay } from "./reviewStateEdits";

/** The bounds of an FSRS-6 stability, in days, as the write check keeps them (above 0). */
export const MIN_STABILITY = 0.001;
export const MAX_STABILITY = 36_500;

/** The bounds of an FSRS-6 difficulty. */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/**
 * The fields a review of a state overwrites, bounded as the write check
 * expects them (docs/srs.md): the stability above 0 and at most
 * 36,500 days, the difficulty from 1 to 10. A snapshot with a value
 * that is not a finite number, or a due day that is not a real
 * "YYYY-MM-DD" date (isStudyDay), is dropped (undefined): it could not
 * be written back, so a state read from elsewhere still takes grades.
 */
export function boundedFsrsSnapshot(snapshot: FsrsSnapshot): FsrsSnapshot | undefined {
  const { stability, difficulty, due, lastReviewedAt } = snapshot;
  if (![stability, difficulty].every(Number.isFinite) || !isStudyDay(due)) return undefined;
  return {
    stability: clamp(stability, MIN_STABILITY, MAX_STABILITY),
    difficulty: clamp(difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY),
    due,
    lastReviewedAt,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
