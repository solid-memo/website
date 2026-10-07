import { activeCards, promptsOf, type Card, type DeckDirection, type Prompt } from "./deck";
import type { StudyPreferences } from "./preferences";
import {
  reviewKeyOf,
  type ReviewKey,
  type ReviewQuality,
  type ReviewSnapshot,
  type ReviewState,
} from "./review";

/**
 * The study day ("YYYY-MM-DD", device-local time) an instant belongs to.
 * The day rolls over at dayBoundaryHour, so 03:00 with a boundary of 4
 * still counts as the previous day. Note: computed in the device's local
 * timezone; a user crossing timezones sees cards a few hours early/late.
 * Accepted for v1.
 */
export function studyDayOf(instant: Date, dayBoundaryHour: number): string {
  const shifted = new Date(instant.getTime() - dayBoundaryHour * 3_600_000);
  return formatLocalDate(shifted);
}

/** The study day a card reviewed now with the given interval is next due. */
export function nextDueDate(
  reviewedAt: Date,
  intervalDays: number,
  dayBoundaryHour: number,
): string {
  const shifted = new Date(
    reviewedAt.getTime() - dayBoundaryHour * 3_600_000,
  );
  shifted.setDate(shifted.getDate() + intervalDays);
  return formatLocalDate(shifted);
}

/**
 * Today's session material. A deck studied both ways makes two prompts
 * of each card, so the counts and budgets are in prompts: a card
 * introduced both ways today costs two of the day's new-card budget.
 */
export interface StudyQueue {
  /** Prompts with review state due today or earlier, oldest due first. */
  due: Prompt[];
  /** Never-reviewed prompts, capped by the daily new-card budget. */
  newPrompts: Prompt[];
  /** Reviews made during the current study day (what a reset would undo). */
  studiedToday: number;
}

export function buildStudyQueue(args: {
  /** The deck's cards; retired ones are never studied. */
  cards: Card[];
  /** The deck's direction: which prompts its cards make. */
  direction: DeckDirection;
  reviews: ReviewState[];
  prefs: StudyPreferences;
  now: Date;
  /** Uniform [0, 1) source deciding which new prompts are introduced. */
  random: () => number;
}): StudyQueue {
  const { cards, direction, reviews, prefs, now, random } = args;
  const today = studyDayOf(now, prefs.dayBoundaryHour);
  const reviewOf = new Map(reviews.map((r) => [reviewKeyOf(r), r]));
  const prompts = promptsOf(activeCards(cards), direction);

  const reviewedToday = reviews.filter(
    (r) => studyDayOf(new Date(r.lastReviewedAt), prefs.dayBoundaryHour) === today,
  ).length;
  const introducedToday = reviews.filter(
    (r) =>
      studyDayOf(new Date(r.firstReviewedAt), prefs.dayBoundaryHour) === today,
  ).length;

  const dueBudget = Math.max(0, prefs.maxReviewsPerDay - reviewedToday);
  const newBudget = Math.max(0, prefs.newCardsPerDay - introducedToday);

  const keyOf = (prompt: Prompt) =>
    reviewKeyOf({ cardId: prompt.card.id, direction: prompt.direction });
  const due = prompts
    .filter((prompt) => {
      const review = reviewOf.get(keyOf(prompt));
      return review !== undefined && review.due <= today;
    })
    .sort((a, b) => {
      const dueA = reviewOf.get(keyOf(a))!.due;
      const dueB = reviewOf.get(keyOf(b))!.due;
      return dueA < dueB ? -1 : dueA > dueB ? 1 : 0;
    })
    .slice(0, dueBudget);

  const newPrompts = shuffle(
    prompts.filter((prompt) => !reviewOf.has(keyOf(prompt))),
    random,
  ).slice(0, newBudget);

  return { due, newPrompts, studiedToday: reviewedToday };
}

/**
 * A study session's order: the new prompts spread evenly among the
 * due ones rather than queued after them, so a deck with a backlog still
 * introduces something new early on — and a deck just made bidirectional
 * shows its other direction within the first few cards. Each list keeps
 * its own order; the session opens with a due prompt when there is one.
 */
export function interleave<T>(due: T[], fresh: T[]): T[] {
  const result: T[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    const dueTurn =
      j >= fresh.length ||
      (i < due.length &&
        (i === 0 || (2 * i + 1) * fresh.length <= (2 * j + 1) * due.length));
    result.push(dueTurn ? due[i++] : fresh[j++]);
  }
  return result;
}

/** Fisher–Yates over the injected `random` source; returns a new array. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A grade this low sends the card round again within the session. */
export function repeatsInSession(quality: ReviewQuality): boolean {
  return quality <= 1;
}

/**
 * Put a failed card back into the rest of the session at a random spot —
 * never straight away, unless nothing else is left to come between.
 */
export function requeueCard<T>(
  remaining: T[],
  card: T,
  random: () => number,
): T[] {
  if (remaining.length === 0) return [card];
  const at = 1 + Math.floor(random() * remaining.length);
  return [...remaining.slice(0, at), card, ...remaining.slice(at)];
}

/**
 * The snapshot a review must carry forward: the state from before the
 * study day's FIRST review. A second review on the same day keeps the
 * snapshot it already has; a card without earlier state has none.
 */
export function snapshotBeforeReview(
  current: ReviewState | null,
  now: Date,
  dayBoundaryHour: number,
): ReviewSnapshot | undefined {
  if (current === null) return undefined;
  const reviewedToday =
    studyDayOf(new Date(current.lastReviewedAt), dayBoundaryHour) ===
    studyDayOf(now, dayBoundaryHour);
  if (reviewedToday) return current.previous;
  return {
    easeFactor: current.easeFactor,
    intervalDays: current.intervalDays,
    repetitions: current.repetitions,
    due: current.due,
    lastReviewedAt: current.lastReviewedAt,
  };
}

/** The writes that undo one study day. */
export interface StudyDayReset {
  /** States to write back, restored to before today's reviews. */
  restore: ReviewState[];
  /** Prompts introduced today: their state goes, making them new again. */
  remove: ReviewKey[];
}

/**
 * Undo the current study day: every prompt reviewed today goes back to
 * how it was before. Untouched prompts are not mentioned in the result.
 *
 * A prompt reviewed today that has no snapshot (state written before
 * snapshots existed) cannot be restored; it is made due today instead, so
 * it can at least be studied again.
 */
export function resetStudyDay(
  reviews: ReviewState[],
  now: Date,
  dayBoundaryHour: number,
): StudyDayReset {
  const today = studyDayOf(now, dayBoundaryHour);
  const isToday = (instant: string) =>
    studyDayOf(new Date(instant), dayBoundaryHour) === today;

  const reset: StudyDayReset = { restore: [], remove: [] };
  for (const review of reviews) {
    if (!isToday(review.lastReviewedAt)) continue;
    if (isToday(review.firstReviewedAt)) {
      reset.remove.push({ cardId: review.cardId, direction: review.direction });
    } else if (review.previous !== undefined) {
      const { previous, ...state } = review;
      reset.restore.push({ ...state, ...previous });
    } else {
      reset.restore.push({ ...review, due: today });
    }
  }
  return reset;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
