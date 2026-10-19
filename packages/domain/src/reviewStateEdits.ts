// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import type { StudyDirection } from "./deck";
import { type ReviewKey, reviewKeyOf } from "./review";

/**
 * The Studio's edits of a card's review state (docs/studio.md): forget
 * it, or set the day it is due. Answers in the log are never touched:
 * they are what happened.
 */

/** Whether `day` is a study day as a review state's `due` holds it: a real "YYYY-MM-DD" date. */
export function isStudyDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}

/** A state that sets a due day and snapshots what a day's first review overwrites: an SM-2 or FSRS-6 state. */
type Rescheduled = ReviewKey & { due: string; previous?: unknown };

/** The states of the cards of these ids, in one direction or (absent) in both. */
function statesOf<T extends ReviewKey>(
  states: readonly T[],
  ids: readonly string[],
  direction: StudyDirection | undefined,
): T[] {
  const chosen = new Set(ids);
  return states.filter(
    (state) =>
      chosen.has(state.cardId) && (direction === undefined || state.direction === direction),
  );
}

/**
 * Forget the cards of these ids, in one direction or (absent) in both:
 * the keys of their states, to remove, each once (the states may be of
 * both schedulers, an SM-2 and an FSRS-6 state of one prompt). The
 * scheduler then sees them as new; a card never studied has no state,
 * so nothing to forget.
 */
export function resetStates(
  states: readonly ReviewKey[],
  ids: readonly string[],
  direction?: StudyDirection,
): ReviewKey[] {
  const keys = new Map(
    statesOf(states, ids, direction).map(({ cardId, direction }) => [
      reviewKeyOf({ cardId, direction }),
      { cardId, direction },
    ]),
  );
  return [...keys.values()];
}

/**
 * The state due on `due` (a study day, isStudyDay), its interval, ease
 * and repetitions kept. The snapshot of the state before the study
 * day's first review (`previous`) is dropped: resetting that day
 * (resetStudyDay) would otherwise bring back a state from before this
 * one, the due day set here lost. A state reviewed today then has no
 * snapshot, so a reset makes it due today, as for a state written
 * before snapshots existed. Refuses a day that is no date
 * (dueDayInvalid).
 */
export function rescheduleState<T extends Rescheduled>(state: T, due: string): T {
  if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
  const { previous: _stale, ...kept } = state;
  return { ...kept, due } as T;
}

/**
 * Set the cards of these ids due on `due`, in one direction or (absent)
 * in both, as rescheduleState does each state: the states to save. A
 * card never studied has no state, so it stays new. Both schedulers'
 * states are set alike, each list on its own (UseCases.rescheduleCards),
 * so the due day holds whichever sets it, now or after a switch.
 */
export function rescheduleStates<T extends Rescheduled>(
  states: readonly T[],
  ids: readonly string[],
  due: string,
  direction?: StudyDirection,
): T[] {
  if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
  return statesOf(states, ids, direction).map((state) => rescheduleState(state, due));
}
