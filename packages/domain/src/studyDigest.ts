// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Answer } from "./answer";
import { chainIndexOf } from "./answerChain";
import { activeCards, promptsOf, type Card, type DeckDirection } from "./deck";
import type { Scheduler } from "./fsrs";
import type { StudyPreferences } from "./preferences";
import { reviewKeyOf, type DueState } from "./review";
import { studyDayOf } from "./scheduling";
import {
  dailyActivity,
  retentionOf,
  streaksOf,
  type DayCounts,
  type Recall,
  type StudyDayFigures,
} from "./statistics";
import { calendarStartOf, periodToDateOf } from "./studyPatterns";
import { ANSWER_CAP_MS, recordedTimeOf } from "./studyTime";

/**
 * What the deck list needs to know of a deck, computed once from its
 * cards and review states and kept (in the instance's digest) for the
 * next visit: how many prompts fall due on which study day, how many are
 * still new, and how many were reviewed and introduced on the day it was
 * computed. With today's preferences that gives the same counts as
 * buildStudyQueue, without the cards or the reviews.
 *
 * It holds while neither document changes (the digest stamps their
 * versions), the deck's direction is the same, the day boundary too, and
 * the scheduler whose due days it counts is still the one in use.
 */
export interface DeckSchedule {
  direction: DeckDirection;
  dayBoundaryHour: number;
  /** The scheduler whose due days it counts: switching sets other days without a write to the reviews. */
  scheduler: Scheduler;
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

/** The deck's schedule from its prompts' due days, those of `scheduler` (effectiveStates). */
export function scheduleOf(input: {
  cards: Card[];
  direction: DeckDirection;
  reviews: readonly DueState[];
  scheduler: Scheduler;
  dayBoundaryHour: number;
  now: Date;
}): DeckSchedule {
  const { cards, direction, reviews, scheduler, dayBoundaryHour, now } = input;
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
    scheduler,
    dueByDay,
    unreviewed,
    studyDay,
    reviewedOnDay: reviews.filter((r) => onDay(r.lastReviewedAt)).length,
    introducedOnDay: reviews.filter((r) => onDay(r.firstReviewedAt)).length,
  };
}

/**
 * Today's counts from a schedule, as buildStudyQueue would give them;
 * null when the schedule cannot say (another direction, day boundary or
 * scheduler, or computed on a later day than today: the clock went back).
 */
export function studyCountsOf(
  schedule: DeckSchedule,
  input: { direction: DeckDirection; prefs: StudyPreferences; now: Date },
): { dueCount: number; newCount: number } | null {
  const { direction, prefs, now } = input;
  if (
    schedule.direction !== direction ||
    schedule.dayBoundaryHour !== prefs.dayBoundaryHour ||
    schedule.scheduler !== prefs.scheduler
  )
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
 * What the today strip needs of one study month of the answer log,
 * summarized once from its answers and kept (in the instance's digest)
 * for the next visit: each study day's answers, introductions, scored
 * reviews and lapses, the month's recall of young prompts, and how long
 * its recalls took. Whether an answer repeats another depends on the
 * answer before it to its prompt (answerChain.ts isRepeat), of the same
 * month while answer times and study days run in the same order, so the
 * counts are those statisticsOf makes of every month at once; they can
 * differ only after the day boundary or the time zone changed in the
 * night of a month's end. The times are counted by the whole
 * second, since a median cannot be put together from medians.
 *
 * It holds while the month's document does not change (the digest
 * stamps its version). Each answer keeps the study day it was given on,
 * so a change of the day boundary changes none of it.
 */
export interface MonthSummary {
  /** Every study day of the month with answers, oldest first. */
  days: DayCounts[];
  /** Its scored reviews of young prompts (Retention.young). */
  young: Recall;
  /**
   * Its recalled answers with a recorded time (recordedTimeOf), by the
   * whole seconds they took, a time of ANSWER_CAP_MS or more counted at
   * the cap: how many took each.
   */
  recallSeconds: Record<number, number>;
}

const STUDY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The most seconds a recall time counts for in a month summary: ANSWER_CAP_MS's. */
export const RECALL_SECONDS_CAP = ANSWER_CAP_MS / 1000;

/** The summary of the answers of one study month (MonthSummary). */
export function monthSummaryOf(answers: readonly Answer[]): MonthSummary {
  const index = chainIndexOf(answers);
  const recallSeconds: Record<number, number> = {};
  for (const answer of answers) {
    const ms = answer.mode === "multiple-choice" ? undefined : recordedTimeOf(answer);
    if (ms === undefined) continue;
    // A time read leniently may be below zero: it counts as none, the least its shape has.
    const seconds = Math.min(Math.max(0, Math.floor(ms / 1000)), RECALL_SECONDS_CAP);
    recallSeconds[seconds] = (recallSeconds[seconds] ?? 0) + 1;
  }
  return {
    // A study day not written "YYYY-MM-DD", as an answer read leniently may have it, is left out.
    days: dailyActivity(answers, index)
      .filter((day) => STUDY_DAY.test(day.studyDay))
      .map(({ studyDay, answers, introduced, reviews, lapses }) => ({
        studyDay,
        answers,
        introduced,
        reviews,
        lapses,
      })),
    young: retentionOf(answers, index).young,
    recallSeconds,
  };
}

/**
 * What the today strip shows (todayOf, welcomeBackOf) and estimates the
 * time left today with (expectedTimeToday).
 */
export interface TodayFigures extends StudyDayFigures {
  /** How well young prompts were remembered. */
  young: Recall;
  /** The median time a recalled answer took, by its recorded times; null while none is known. */
  medianAnswerMs: number | null;
}

/**
 * The today strip's figures of the summaries of the months it looks
 * back over, as statisticsOf makes them of those months' answers with
 * the range's first study day `since` (the first of a month): today's
 * study, the streaks and this week beside the last of the days from
 * `since` or from the activity calendar's first (calendarStartOf), the
 * earlier, and the recall of young prompts and the median answer time of
 * the months from `since` on, a summary being of the month of its days.
 * Only the median answer time can differ: each time counts as the
 * middle of its second (the cap as the cap), so it is off by half a
 * second at most below the cap. While no time was recorded it is null,
 * where statisticsOf estimates one from the pauses between answers.
 */
export function todayFiguresOf(
  summaries: readonly MonthSummary[],
  today: string,
  since: string,
): TodayFigures {
  const calendarStart = calendarStartOf(today);
  const from = since < calendarStart ? since : calendarStart;
  const days = summaries
    .flatMap((summary) => summary.days)
    .filter((day) => day.studyDay >= from)
    .sort((a, b) => a.studyDay.localeCompare(b.studyDay));
  const young: Recall = { reviews: 0, recalled: 0 };
  const counts = Array.from({ length: RECALL_SECONDS_CAP + 1 }, () => 0);
  for (const summary of summaries) {
    if ((summary.days[0]?.studyDay ?? "") < since) continue;
    young.reviews += summary.young.reviews;
    young.recalled += summary.young.recalled;
    for (const [seconds, count] of Object.entries(summary.recallSeconds))
      counts[Number(seconds)]! += count;
  }
  return {
    today,
    days,
    streaks: streaksOf(
      days.map((day) => day.studyDay),
      today,
    ),
    week: periodToDateOf(days, today, "week"),
    young,
    medianAnswerMs: medianOfSeconds(counts),
  };
}

/** The median of the times counted by second (`counts[s]` took s seconds), in milliseconds; null of none. */
function medianOfSeconds(counts: readonly number[]): number | null {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;
  const at = (rank: number) => {
    let seconds = 0;
    for (let below = counts[0]!; below <= rank; below += counts[seconds]!) seconds += 1;
    return seconds === RECALL_SECONDS_CAP ? ANSWER_CAP_MS : seconds * 1000 + 500;
  };
  const middle = Math.floor(total / 2);
  return total % 2 === 1 ? at(middle) : (at(middle - 1) + at(middle)) / 2;
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
  /** By the URL of the answer log's month document. */
  months: Record<string, StoredMonthSummary>;
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

/** A month's summary with the version of its document of the answer log it was made from. */
export interface StoredMonthSummary {
  /** The month's document (instanceLayout.ts historyUrlOf). */
  document: string;
  version: string;
  summary: MonthSummary;
}

/** The version of a document there is none of: its absence too can be known and checked again. */
export const ABSENT_VERSION = "absent";

export function emptyDigest(): InstanceDigest {
  return { receipts: {}, schedules: {}, months: {} };
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

/**
 * The digest with the month summaries given, by document, in place of
 * those it had: a month no longer looked back over is dropped.
 */
export function withMonthSummaries(
  digest: InstanceDigest,
  months: Record<string, StoredMonthSummary>,
): InstanceDigest {
  return { ...digest, months };
}
