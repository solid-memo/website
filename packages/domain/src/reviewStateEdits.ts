import { AppError } from "./appError";
import type { StudyDirection } from "./deck";
import type { ReviewKey, ReviewState } from "./review";

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

/** The states of the cards of these ids, in one direction or (absent) in both. */
function statesOf(
  states: readonly ReviewState[],
  ids: readonly string[],
  direction: StudyDirection | undefined,
): ReviewState[] {
  const chosen = new Set(ids);
  return states.filter((state) => chosen.has(state.cardId) && (direction === undefined || state.direction === direction));
}

/**
 * Forget the cards of these ids, in one direction or (absent) in both:
 * the keys of their states, to remove. The scheduler then sees them as
 * new; a card never studied has no state, so nothing to forget.
 */
export function resetStates(
  states: readonly ReviewState[],
  ids: readonly string[],
  direction?: StudyDirection,
): ReviewKey[] {
  return statesOf(states, ids, direction).map(({ cardId, direction }) => ({ cardId, direction }));
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
export function rescheduleState(state: ReviewState, due: string): ReviewState {
  if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
  const { previous: _stale, ...kept } = state;
  return { ...kept, due };
}

/**
 * Set the cards of these ids due on `due`, in one direction or (absent)
 * in both, as rescheduleState does each state: the states to save. A
 * card never studied has no state, so it stays new.
 */
export function rescheduleStates(
  states: readonly ReviewState[],
  ids: readonly string[],
  due: string,
  direction?: StudyDirection,
): ReviewState[] {
  if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
  return statesOf(states, ids, direction).map((state) => rescheduleState(state, due));
}
