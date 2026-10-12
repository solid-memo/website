// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isRecalled, MATURE_INTERVAL_DAYS, shiftStudyDay, type Answer } from "./answer";
import { isRepeat, isScoredReview, type ChainIndex } from "./answerChain";
import type { StudyDirection } from "./deck";
import type { ReviewQuality } from "./review";
import type { DayActivity, Recall } from "./statistics";

/**
 * How a learner answers and studies, from the answer log: the answer
 * buttons pressed, how often a card is remembered the first time it is
 * seen, how this week and month compare with the last, which weekdays
 * are studied, recall in each study direction, and the new cards taken
 * on beside the reviews done, week by week. Pure; statisticsOf puts them
 * with the rest of the statistics (docs/statistics.md).
 */

/** An answer button, by the grades it gives: the minimal scale's four, which the SM-2 scale's six fall into. */
export type GradeGroup = "again" | "hard" | "good" | "easy";

/** How many answers each button got. */
export type GradeGroups = Record<GradeGroup, number>;

/** The buttons pressed, recalled answers only, repeats the same day left out. */
export interface AnswerButtons {
  /** A prompt's first answer. */
  introductions: GradeGroups;
  /** Scored reviews at an interval below MATURE_INTERVAL_DAYS. */
  young: GradeGroups;
  /** Scored reviews at an interval of MATURE_INTERVAL_DAYS or more. */
  mature: GradeGroups;
}

/** Prompts answered for the first time, and how many of them were remembered then. */
export interface FirstTry {
  introduced: number;
  recalled: number;
}

/** What a stretch of study days held. */
export interface PeriodFigures {
  answers: number;
  studyDays: number;
  introduced: number;
  /** Its scored reviews, and how many were remembered. */
  recall: Recall;
}

/** A week or month so far, beside the same days of the one before. */
export interface PeriodToDate {
  current: PeriodFigures;
  previous: PeriodFigures;
}

/** One weekday's study, of the weekdays from the first study day to today. */
export interface WeekdayRhythm {
  /** Monday 0 to Sunday 6. */
  weekday: number;
  answers: number;
  /** How many of this weekday there were. */
  days: number;
  /** How many of them were studied. */
  studied: number;
}

/** Recall in one study direction. */
export interface DirectionRecall {
  direction: StudyDirection;
  recall: Recall;
}

/** One week's new cards beside its reviews. */
export interface WeekLoad {
  /** The week's Monday, "YYYY-MM-DD". */
  week: string;
  introduced: number;
  /** Scored reviews. */
  reviews: number;
}

/** The days that "studied N of the last days" looks back over, today included. */
export const RECENT_DAYS = 30;

/** The weeks that the new cards beside the reviews are shown for, this one included. */
export const INTAKE_WEEKS = 12;

/** The button a grade is given by: 0 to 2 Again, 3 Hard, 4 Good, 5 Easy, on either scale. */
export function gradeGroupOf(grade: ReviewQuality): GradeGroup {
  return grade <= 2 ? "again" : grade === 3 ? "hard" : grade === 4 ? "good" : "easy";
}

/** Whether an answer was recalled and graded by the learner, not chosen among a course's options. */
function isRecallMode(answer: Answer): boolean {
  return (answer.mode ?? "recall") === "recall";
}

/**
 * The buttons pressed for first answers and for young and mature
 * reviews, of the answers given, whose chains `index` holds: recalled
 * answers only, a card back in the session the same day left out.
 */
export function gradeGroupsOf(answers: readonly Answer[], index: ChainIndex): AnswerButtons {
  const none = (): GradeGroups => ({ again: 0, hard: 0, good: 0, easy: 0 });
  const buttons: AnswerButtons = { introductions: none(), young: none(), mature: none() };
  for (const answer of answers) {
    if (!isRecallMode(answer) || isRepeat(answer, index)) continue;
    const kind =
      answer.priorIntervalDays === undefined
        ? buttons.introductions
        : answer.priorIntervalDays >= MATURE_INTERVAL_DAYS
          ? buttons.mature
          : buttons.young;
    kind[gradeGroupOf(answer.grade)] += 1;
  }
  return buttons;
}

/**
 * Whether an answer of the index is its prompt's first introduction: the
 * first answer to it read. A Studio "forget" introduces a prompt again,
 * which is not a first try, nor is one after reviews (an open segment:
 * the prompt was seen before the answers read).
 */
export function isFirstIntroduction(answer: Answer, index: ChainIndex): boolean {
  return answer.priorIntervalDays === undefined && index.places.get(answer)!.at === 0;
}

/**
 * How many prompts were remembered the first time they were seen, of the
 * answers given, whose chains `index` holds: each prompt's first
 * introduction, recalled and graded; a course's first answers are its
 * graded course answers instead.
 */
export function firstTrySuccessOf(answers: readonly Answer[], index: ChainIndex): FirstTry {
  const firstTry: FirstTry = { introduced: 0, recalled: 0 };
  for (const answer of answers) {
    if (!isRecallMode(answer) || !isFirstIntroduction(answer, index)) continue;
    firstTry.introduced += 1;
    if (isRecalled(answer)) firstTry.recalled += 1;
  }
  return firstTry;
}

/** Weekday of a study day, Monday 0 to Sunday 6. */
export function weekdayOf(studyDay: string): number {
  return (new Date(`${studyDay}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Calendar days from one study day to a later one. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** What the days given held from `first` to `last`, both included. */
function periodOf(days: readonly DayActivity[], first: string, last: string): PeriodFigures {
  const period: PeriodFigures = {
    answers: 0,
    studyDays: 0,
    introduced: 0,
    recall: { reviews: 0, recalled: 0 },
  };
  for (const day of days) {
    if (day.studyDay < first || day.studyDay > last) continue;
    period.answers += day.answers;
    period.studyDays += 1;
    period.introduced += day.introduced;
    period.recall.reviews += day.reviews;
    period.recall.recalled += day.reviews - day.lapses;
  }
  return period;
}

/**
 * This week (from Monday, as the activity calendar's columns) or this
 * month up to today, beside the same days of the one before: last
 * week's Monday up to today's weekday, or last month's first up to
 * today's date (its last day, when it was shorter).
 */
export function periodToDateOf(
  days: readonly DayActivity[],
  today: string,
  period: "week" | "month",
): PeriodToDate {
  if (period === "week") {
    const monday = shiftStudyDay(today, -weekdayOf(today));
    return {
      current: periodOf(days, monday, today),
      previous: periodOf(days, shiftStudyDay(monday, -7), shiftStudyDay(today, -7)),
    };
  }
  const first = `${today.slice(0, 8)}01`;
  // The day before this month's first is the last of the month before.
  const lastOfPrevious = shiftStudyDay(first, -1);
  const dayOfMonth = Math.min(Number(today.slice(8)), Number(lastOfPrevious.slice(8)));
  return {
    current: periodOf(days, first, today),
    previous: periodOf(
      days,
      `${lastOfPrevious.slice(0, 8)}01`,
      `${lastOfPrevious.slice(0, 8)}${String(dayOfMonth).padStart(2, "0")}`,
    ),
  };
}

/** How many of the last `count` study days up to today had answers. */
export function daysStudiedOf(
  days: readonly DayActivity[],
  today: string,
  count = RECENT_DAYS,
): number {
  const first = shiftStudyDay(today, 1 - count);
  return days.filter((day) => day.studyDay >= first && day.studyDay <= today).length;
}

/**
 * Each weekday's answers, Monday first, and how many of that weekday
 * there were and were studied, from the first study day of the days
 * given up to today: every weekday has an entry, with none before the
 * first study day.
 */
export function weekdayRhythmOf(days: readonly DayActivity[], today: string): WeekdayRhythm[] {
  const rhythm = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    answers: 0,
    days: 0,
    studied: 0,
  }));
  const shown = days.filter((day) => day.studyDay <= today);
  if (shown.length === 0) return rhythm;
  const first = shown[0]!.studyDay;
  const total = daysBetween(first, today) + 1;
  // The first seven days each start a run of their weekday, a week apart.
  for (let i = 0; i < Math.min(7, total); i++) {
    rhythm[weekdayOf(shiftStudyDay(first, i))]!.days = Math.floor((total - 1 - i) / 7) + 1;
  }
  for (const day of shown) {
    const weekday = rhythm[weekdayOf(day.studyDay)]!;
    weekday.answers += day.answers;
    weekday.studied += 1;
  }
  return rhythm;
}

/**
 * Recall in each study direction with a scored review, front to back
 * first, of the answers given, whose chains `index` holds.
 */
export function retentionByDirection(
  answers: readonly Answer[],
  index: ChainIndex,
): DirectionRecall[] {
  const byDirection = new Map<StudyDirection, Recall>();
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    const recall = byDirection.get(answer.direction) ?? { reviews: 0, recalled: 0 };
    recall.reviews += 1;
    if (isRecalled(answer)) recall.recalled += 1;
    byDirection.set(answer.direction, recall);
  }
  return (["front-to-back", "back-to-front"] as const)
    .filter((direction) => byDirection.has(direction))
    .map((direction) => ({ direction, recall: byDirection.get(direction)! }));
}

/**
 * The cards introduced and the reviews done each week (from Monday) of
 * the last `weeks` up to this one, oldest first: whether new cards are
 * taken on faster than the reviews they bring can be kept up with. A
 * week without study has none of either.
 */
export function intakeVsLoadOf(
  days: readonly DayActivity[],
  today: string,
  weeks = INTAKE_WEEKS,
): WeekLoad[] {
  const start = shiftStudyDay(today, -weekdayOf(today) - 7 * (weeks - 1));
  const loads = Array.from({ length: weeks }, (_, i) => ({
    week: shiftStudyDay(start, 7 * i),
    introduced: 0,
    reviews: 0,
  }));
  for (const day of days) {
    // Days before the first week, or after this one (a later day boundary can leave some), are left out.
    const load = loads[Math.floor(daysBetween(start, day.studyDay) / 7)];
    if (load === undefined) continue;
    load.introduced += day.introduced;
    load.reviews += day.reviews;
  }
  return loads;
}
