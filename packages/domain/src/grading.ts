// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isRecalled, type Answer } from "./answer";
import { ratingOfChoice } from "./course";
import { fsrsReview, ratingOfGrade, type FsrsRating, type Scheduler } from "./fsrs";
import {
  REVIEW_STATE_FORMAT_VERSION,
  type FsrsState,
  type ReviewKey,
  type ReviewQuality,
  type ReviewState,
} from "./review";
import { nextDueDate, snapshotBeforeReview, studyDayOf } from "./scheduling";
import { applySm2, INITIAL_SM2_STATE } from "./sm2";
import { SM2_QUALITIES } from "./answerScale";
import { daysBetween } from "./studyPatterns";

/**
 * One grade applied to one prompt: what each scheduler's state becomes
 * (docs/srs.md). SM-2 is applied on every review, whichever scheduler
 * sets the due days, so switching back to it finds its states current;
 * FSRS-6 only while it sets them.
 */

/** A prompt's states before a grade, each null when there is none. */
export interface PromptStates {
  sm2: ReviewState | null;
  fsrs: FsrsState | null;
}

/** A prompt's states after a grade: an FSRS-6 one only when FSRS-6 sets the due days. */
export interface GradedPrompt {
  sm2: ReviewState;
  fsrs?: FsrsState;
}

/** What a grade is applied with: the instance's choices. */
export interface Scheduling {
  scheduler: Scheduler;
  /** The chance of recall FSRS-6 aims at on the due day. */
  desiredRetention: number;
  dayBoundaryHour: number;
}

/**
 * The FSRS rating of an answer: a multiple-choice answer's by whether
 * it was right (ratingOfChoice), any other by its grade (ratingOfGrade).
 */
export function ratingOfAnswer(answer: Pick<Answer, "grade" | "mode">): FsrsRating {
  return answer.mode === "multiple-choice"
    ? ratingOfChoice(isRecalled(answer))
    : ratingOfGrade(answer.grade);
}

/**
 * The states after grading a prompt `now` (`answer`: the SM-2 grade, and
 * how it was given). SM-2 transitions its state, or the initial one,
 * carrying the snapshot snapshotBeforeReview gives; under FSRS-6 the
 * FSRS-6 state follows too (fsrsReview). Under SM-2 the FSRS-6 state is
 * left as it is, and goes stale.
 */
export function gradePrompt(
  key: ReviewKey,
  current: PromptStates,
  answer: Pick<Answer, "grade" | "mode">,
  now: Date,
  scheduling: Scheduling,
): GradedPrompt {
  const { sm2: before } = current;
  const next = applySm2(before ?? INITIAL_SM2_STATE, answer.grade);
  const previous = snapshotBeforeReview(before, now, scheduling.dayBoundaryHour);
  const sm2: ReviewState = {
    cardId: key.cardId,
    direction: key.direction,
    ...next,
    due: nextDueDate(now, next.intervalDays, scheduling.dayBoundaryHour),
    firstReviewedAt: before?.firstReviewedAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
    formatVersion: REVIEW_STATE_FORMAT_VERSION,
    ...(previous === undefined ? {} : { previous }),
  };
  if (scheduling.scheduler === "sm2") return { sm2 };
  const fsrs = fsrsReview(
    key,
    current,
    ratingOfAnswer(answer),
    now,
    scheduling.desiredRetention,
    scheduling.dayBoundaryHour,
  );
  return { sm2, fsrs };
}

/**
 * The interval each grade would give a prompt `now`, in days, by the
 * scheduler that sets the due days: what a study session shows under
 * each grade button. Under FSRS-6 it depends on the days since the last
 * review, so on `now`, as an SM-2 interval never does, and it is the
 * fuzzed one: the study days from today to the due day the grade sets.
 */
export function previewIntervals(
  key: ReviewKey,
  current: PromptStates,
  now: Date,
  scheduling: Scheduling,
): Record<ReviewQuality, number> {
  const intervals = {} as Record<ReviewQuality, number>;
  const today = studyDayOf(now, scheduling.dayBoundaryHour);
  for (const grade of SM2_QUALITIES) {
    const { sm2, fsrs } = gradePrompt(key, current, { grade }, now, scheduling);
    intervals[grade] = fsrs === undefined ? sm2.intervalDays : daysBetween(today, fsrs.due);
  }
  return intervals;
}
