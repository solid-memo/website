// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StudyDirection } from "./deck";
import type { ReviewQuality } from "./review";

/**
 * One grade given to one prompt during study: an entry of the instance's
 * answer log, which the study statistics are computed from (see
 * docs/data-model.md). Appended as it is given, never edited; resetting a
 * study day removes that day's answers.
 */
export interface Answer {
  /**
   * The entry's fragment id in its month document: "answer-<time>-<random>";
   * for one added from a guest's study, followed by the id of the deck it
   * was added to (guest.ts mergedAnswer).
   */
  id: string;
  /** The deck's catalog entry, which may since have been removed. */
  deckUrl: string;
  /** The card's subject, which may since have been removed. */
  cardUrl: string;
  direction: StudyDirection;
  /** The SM-2 quality, whichever answer scale gave it. */
  grade: ReviewQuality;
  /** ISO dateTime. */
  answeredAt: string;
  /** The study day the answer counts toward, fixed when it was given. */
  studyDay: string;
  /** The prompt's interval before the answer; absent on its first answer, which introduced it. */
  priorIntervalDays?: number;
  /** The prompt's interval after the answer. */
  nextIntervalDays: number;
  /**
   * How it was answered (vocabulary 1.14): recalled and graded by the
   * learner, or chosen among options, as a course asks. Absent means
   * recalled, as every answer before 1.14 was.
   */
  mode?: AnswerMode;
  /**
   * For a wrong multiple-choice answer, the wrong option chosen: the
   * distractor's subject in the deck's cards document. Absent otherwise.
   */
  chosenDistractor?: string;
  /**
   * Milliseconds from the prompt shown to the answer revealed, or to the
   * option chosen, the time the app was hidden left out (vocabulary 1.19).
   * Absent when not measured, as before 1.19, or above ten minutes, when
   * the learner was away.
   */
  recallMillis?: number;
  /** Milliseconds from the answer revealed to the grade, as recallMillis is measured; absent on a multiple-choice answer. */
  gradeMillis?: number;
  /** The study day the prompt was due before the answer (vocabulary 1.19); absent on its first answer, and before 1.19. */
  priorDue?: string;
  /**
   * The device's offset from UTC when the answer was given, in minutes,
   * positive east of Greenwich (vocabulary 1.19); absent before 1.19.
   */
  utcOffsetMinutes?: number;
}

/** How an answer was given; the notations of the AnswerModes scheme's concepts. */
export type AnswerMode = "recall" | "multiple-choice";

/** An entry's fragment id: its time without separators and a random part, so tabs and devices never collide. */
export function answerIdOf(answeredAt: string, random: string): string {
  return `answer-${answeredAt.replace(/[-:.]/g, "")}-${random}`;
}

/** The month of the answer log a study day belongs to, "YYYY-MM": a study day is never split. */
export function monthOfStudyDay(studyDay: string): string {
  return studyDay.slice(0, 7);
}

/** The study day `days` after (or before, when negative) another, by the calendar. */
export function shiftStudyDay(studyDay: string, days: number): string {
  const [year, month, day] = studyDay.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** A prompt reviewed at an interval of this many days or more is mature; below, young. */
export const MATURE_INTERVAL_DAYS = 21;

/** Whether an answer remembered the card: SM-2 grades 3 and up. */
export function isRecalled(answer: Pick<Answer, "grade">): boolean {
  return answer.grade >= 3;
}

/**
 * How long an answer took, as the screen measured it, in milliseconds,
 * the time the app was hidden left out: from the prompt shown to the
 * answer revealed or the option chosen (recall), and from the answer
 * revealed to the grade (grade). Either is absent when not measured.
 */
export interface ResponseTimes {
  recallMillis?: number;
  gradeMillis?: number;
}

/** A response time longer than this is not recorded: the learner was away, not thinking. */
export const MAX_RESPONSE_MILLIS = 10 * 60_000;

/**
 * The response times an answer records: each in whole milliseconds,
 * those longer than MAX_RESPONSE_MILLIS (or not a time at all) left out.
 */
export function recordedResponseTimes(times: ResponseTimes): ResponseTimes {
  const kept = (millis: number | undefined) =>
    millis !== undefined && millis >= 0 && millis <= MAX_RESPONSE_MILLIS
      ? Math.round(millis)
      : undefined;
  const recallMillis = kept(times.recallMillis);
  const gradeMillis = kept(times.gradeMillis);
  return {
    ...(recallMillis === undefined ? {} : { recallMillis }),
    ...(gradeMillis === undefined ? {} : { gradeMillis }),
  };
}

/** The device's offset from UTC at an instant, in minutes, positive east of Greenwich (Answer.utcOffsetMinutes). */
export function utcOffsetMinutesAt(instant: Date): number {
  // 0 - x, not -x: an offset of 0 is never -0.
  return 0 - instant.getTimezoneOffset();
}
