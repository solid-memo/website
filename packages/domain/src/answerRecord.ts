// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { AnswerV1 } from "@solid-memo/vocab/types.generated";
import { type Answer, MAX_RESPONSE_MILLIS } from "./answer";
import {
  answerModeOfConcept,
  conceptOfAnswerMode,
  conceptOfDirection,
  directionOfConcept,
} from "./concepts";
import type { StudyDirection } from "./deck";
import type { ReviewQuality } from "./review";

/**
 * An answer between its shape record and the model; its id is the
 * subject's fragment. The mode is written as the answer states it: a
 * study session states none, which reads as recall.
 */
export function answerToRecord(answer: Answer): AnswerV1 {
  return {
    deck: answer.deckUrl,
    card: answer.cardUrl,
    direction: conceptOfDirection(answer.direction) as AnswerV1["direction"],
    grade: answer.grade,
    answeredAt: answer.answeredAt,
    studyDay: answer.studyDay,
    ...(answer.priorIntervalDays === undefined
      ? {}
      : { priorIntervalDays: answer.priorIntervalDays }),
    nextIntervalDays: answer.nextIntervalDays,
    ...(answer.mode === undefined ? {} : { mode: conceptOfAnswerMode(answer.mode) }),
    ...(answer.chosenDistractor === undefined ? {} : { chosenDistractor: answer.chosenDistractor }),
    ...(answer.recallMillis === undefined ? {} : { recallMillis: answer.recallMillis }),
    ...(answer.gradeMillis === undefined ? {} : { gradeMillis: answer.gradeMillis }),
    ...(answer.priorDue === undefined ? {} : { priorDue: answer.priorDue }),
    ...(answer.utcOffsetMinutes === undefined ? {} : { utcOffsetMinutes: answer.utcOffsetMinutes }),
  };
}

/** The most an answer's offset from UTC is, either side, in minutes: its shape's bound. */
const MAX_UTC_OFFSET_MINUTES = 840;

/** Whether a number read is a whole number from min to max. */
function isWithin(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * The answer from its record; null when its grade is not a whole number
 * from 0 to 5, or an interval not a whole number of days, 0 or more, that
 * a number holds exactly (Number.MAX_SAFE_INTEGER): out of what its
 * shape allows, or of what can be counted, and the statistics count from both. An
 * interval above the app's cap (MAX_INTERVAL_DAYS) is kept as it is,
 * since an answer written before that cap may carry one, and the
 * statistics bound it where they need to (the median of intervals).
 * A response time that is not a whole number from 0 to
 * MAX_RESPONSE_MILLIS (the bound recordedResponseTimes writes by), or an
 * offset from UTC that is not one from -840 to 840, is left out, the
 * answer kept. A read checks the numbers' datatypes, not their range, so
 * a time of very many digits would otherwise read as an infinite one.
 */
export function answerFromRecord(id: string, data: AnswerV1): Answer | null {
  const isInterval = (days: number) => isWithin(days, 0, Number.MAX_SAFE_INTEGER);
  if (
    !isWithin(data.grade, 0, 5) ||
    !isInterval(data.nextIntervalDays) ||
    (data.priorIntervalDays !== undefined && !isInterval(data.priorIntervalDays))
  )
    return null;
  const isTime = (millis: number | undefined): millis is number =>
    millis !== undefined && isWithin(millis, 0, MAX_RESPONSE_MILLIS);
  const isOffset = (minutes: number | undefined): minutes is number =>
    minutes !== undefined && isWithin(minutes, -MAX_UTC_OFFSET_MINUTES, MAX_UTC_OFFSET_MINUTES);
  return {
    id,
    deckUrl: data.deck,
    cardUrl: data.card,
    direction: directionOfConcept(data.direction) as StudyDirection,
    grade: data.grade as ReviewQuality,
    answeredAt: data.answeredAt,
    studyDay: data.studyDay,
    ...(data.priorIntervalDays === undefined ? {} : { priorIntervalDays: data.priorIntervalDays }),
    nextIntervalDays: data.nextIntervalDays,
    ...(data.mode === undefined ? {} : { mode: answerModeOfConcept(data.mode)! }),
    ...(data.chosenDistractor === undefined ? {} : { chosenDistractor: data.chosenDistractor }),
    ...(isTime(data.recallMillis) ? { recallMillis: data.recallMillis } : {}),
    ...(isTime(data.gradeMillis) ? { gradeMillis: data.gradeMillis } : {}),
    ...(data.priorDue === undefined ? {} : { priorDue: data.priorDue }),
    ...(isOffset(data.utcOffsetMinutes) ? { utcOffsetMinutes: data.utcOffsetMinutes } : {}),
  };
}
