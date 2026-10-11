// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { activeCards, promptsOf, type Card, type DeckDirection } from "./deck";
import type { StudyPreferences } from "./preferences";
import { reviewKeyOf, type ReviewState } from "./review";
import { studyDayOf } from "./scheduling";

/**
 * What the deck list needs to know of a deck, computed once from its
 * cards and review states and kept (in the instance's digest) for the
 * next visit: how many prompts fall due on which study day, how many are
 * still new, and how many were reviewed and introduced on the day it was
 * computed. With today's preferences that gives the same counts as
 * buildStudyQueue, without the cards or the reviews.
 *
 * It holds while neither document changes (the digest stamps their
 * versions), the deck's direction is the same and the day boundary too.
 */
export interface DeckSchedule {
  direction: DeckDirection;
  dayBoundaryHour: number;
  /** Prompts with review state, by the study day they are due. */
  dueByDay: Record<string, number>;
  /** Prompts never reviewed. */
  unreviewed: number;
  /** The study day it was computed on. */
  studyDay: string;
  /** Reviews made on that day, of any card (what buildStudyQueue counts). */
  reviewedOnDay: number;
  /** Prompts first reviewed on that day. */
  introducedOnDay: number;
}

export function scheduleOf(input: {
  cards: Card[];
  direction: DeckDirection;
  reviews: ReviewState[];
  dayBoundaryHour: number;
  now: Date;
}): DeckSchedule {
  const { cards, direction, reviews, dayBoundaryHour, now } = input;
  const studyDay = studyDayOf(now, dayBoundaryHour);
  const reviewOf = new Map(reviews.map((r) => [reviewKeyOf(r), r]));
  const dueByDay: Record<string, number> = {};
  let unreviewed = 0;
  for (const prompt of promptsOf(activeCards(cards), direction)) {
    const review = reviewOf.get(
      reviewKeyOf({ cardId: prompt.card.id, direction: prompt.direction }),
    );
    if (review === undefined) unreviewed++;
    else dueByDay[review.due] = (dueByDay[review.due] ?? 0) + 1;
  }
  const onDay = (instant: string) => studyDayOf(new Date(instant), dayBoundaryHour) === studyDay;
  return {
    direction,
    dayBoundaryHour,
    dueByDay,
    unreviewed,
    studyDay,
    reviewedOnDay: reviews.filter((r) => onDay(r.lastReviewedAt)).length,
    introducedOnDay: reviews.filter((r) => onDay(r.firstReviewedAt)).length,
  };
}

/**
 * Today's counts from a schedule, as buildStudyQueue would give them;
 * null when the schedule cannot say (another direction or day boundary,
 * or computed on a later day than today: the clock went back).
 */
export function studyCountsOf(
  schedule: DeckSchedule,
  input: { direction: DeckDirection; prefs: StudyPreferences; now: Date },
): { dueCount: number; newCount: number } | null {
  const { direction, prefs, now } = input;
  if (schedule.direction !== direction || schedule.dayBoundaryHour !== prefs.dayBoundaryHour)
    return null;
  const today = studyDayOf(now, prefs.dayBoundaryHour);
  if (schedule.studyDay > today) return null;
  // Any review since the schedule was computed changed the reviews document, so on a later day none was made yet.
  const sameDay = schedule.studyDay === today;
  const reviewedToday = sameDay ? schedule.reviewedOnDay : 0;
  const introducedToday = sameDay ? schedule.introducedOnDay : 0;
  const due = Object.entries(schedule.dueByDay)
    .filter(([day]) => day <= today)
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    dueCount: Math.min(due, Math.max(0, prefs.maxReviewsPerDay - reviewedToday)),
    newCount: Math.min(schedule.unreviewed, Math.max(0, prefs.newCardsPerDay - introducedToday)),
  };
}

/**
 * An instance's digest (its digest.ttl): what was learned of its
 * documents, each at the version (ETag) it was learned at, so a visit
 * need not download a document that has not changed since. Derived
 * data: whatever does not hold is learned again.
 */
export interface InstanceDigest {
  /** By document URL. */
  receipts: Record<string, DocumentReceipt>;
  /** By deck URL. */
  schedules: Record<string, StoredSchedule>;
}

/** What a document was found to be at one version. */
export interface DocumentReceipt {
  document: string;
  version: string;
  /** It conformed to the shapes checked by these rules (a hash of them). */
  conformedTo?: string;
  /** Nothing in it was in an older format. */
  latestFormat?: true;
}

/** A deck's schedule with the versions of its documents it was computed from. */
export interface StoredSchedule {
  deck: string;
  cardsVersion: string;
  reviewsVersion: string;
  schedule: DeckSchedule;
}

/** The version of a document there is none of: its absence too can be known and checked again. */
export const ABSENT_VERSION = "absent";

export function emptyDigest(): InstanceDigest {
  return { receipts: {}, schedules: {} };
}

/**
 * The digest with what is known of a document at a version: added to
 * what was known of that version, replacing what was known of another.
 */
export function withReceipt(
  digest: InstanceDigest,
  document: string,
  version: string,
  facts: Pick<DocumentReceipt, "conformedTo" | "latestFormat">,
): InstanceDigest {
  const before = digest.receipts[document];
  const kept = before?.version === version ? before : { document, version };
  return { ...digest, receipts: { ...digest.receipts, [document]: { ...kept, ...facts } } };
}

export function withSchedule(digest: InstanceDigest, stored: StoredSchedule): InstanceDigest {
  return { ...digest, schedules: { ...digest.schedules, [stored.deck]: stored } };
}
