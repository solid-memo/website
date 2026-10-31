// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DeckScheduleV2,
  DocumentReceiptV1,
  MonthSummaryV1,
} from "@solid-memo/vocab/types.generated";
import { isOfStudyMonth } from "./answer";
import {
  conceptOfDirection,
  conceptOfScheduler,
  directionOfConcept,
  schedulerOfConcept,
} from "./concepts";
import type { DocumentReceipt, StoredMonthSummary, StoredSchedule } from "./studyDigest";

/**
 * The digest's subjects between their shape records and the model. A
 * schedule's prompts due by day are "YYYY-MM-DD count" values in the
 * record, a map in the model; its direction and scheduler are concepts
 * in the record, notations in the model. A month summary's days are
 * "YYYY-MM-DD answers introduced reviews lapses" values, its recall
 * times "seconds count" ones.
 */
export function receiptFromRecord(data: DocumentReceiptV1): DocumentReceipt {
  return {
    document: data.document,
    version: data.version,
    ...(data.conformedTo === undefined ? {} : { conformedTo: data.conformedTo }),
    ...(data.latestFormat === true ? { latestFormat: true as const } : {}),
  };
}

export function receiptToRecord(receipt: DocumentReceipt): DocumentReceiptV1 {
  return {
    document: receipt.document,
    version: receipt.version,
    ...(receipt.conformedTo === undefined ? {} : { conformedTo: receipt.conformedTo }),
    ...(receipt.latestFormat === undefined ? {} : { latestFormat: true }),
  };
}

export function scheduleFromRecord(data: DeckScheduleV2): StoredSchedule {
  const dueByDay: Record<string, number> = {};
  for (const value of data.dueOnDay) {
    const [day, count] = value.split(" ");
    dueByDay[day!] = Number(count);
  }
  return {
    deck: data.deck,
    cardsVersion: data.cardsVersion,
    reviewsVersion: data.reviewsVersion,
    schedule: {
      direction: directionOfConcept(data.direction)!,
      dayBoundaryHour: data.dayBoundaryHour,
      scheduler: schedulerOfConcept(data.scheduler)!,
      dueByDay,
      unreviewed: data.unreviewed,
      studyDay: data.studyDay,
      reviewedOnDay: data.reviewedOnDay,
      introducedOnDay: data.introducedOnDay,
    },
  };
}

export function scheduleToRecord(stored: StoredSchedule): DeckScheduleV2 {
  const { schedule } = stored;
  return {
    deck: stored.deck,
    cardsVersion: stored.cardsVersion,
    reviewsVersion: stored.reviewsVersion,
    direction: conceptOfDirection(schedule.direction),
    dayBoundaryHour: schedule.dayBoundaryHour,
    scheduler: conceptOfScheduler(schedule.scheduler),
    studyDay: schedule.studyDay,
    dueOnDay: Object.entries(schedule.dueByDay)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => `${day} ${count}`),
    unreviewed: schedule.unreviewed,
    reviewedOnDay: schedule.reviewedOnDay,
    introducedOnDay: schedule.introducedOnDay,
  };
}

/**
 * A month summary's values as its shape has them (month-summary/v1.ttl),
 * each count of at most 15 digits, so a safe integer.
 */
const DAY_COUNTS = /^\d{4}-\d{2}-\d{2} [1-9]\d{0,14}( \d{1,15}){3}$/;
const RECALL_SECONDS = /^([0-9]|[1-5][0-9]|60) [1-9][0-9]{0,14}$/;
/**
 * The month a summary is of, by its answer-log document, a path ending
 * in history/<YYYY-MM>.ttl with no query or fragment (historyUrlOf).
 */
const SUMMARIZED_MONTH = /^[^?#]*\/history\/(\d{4}-\d{2})\.ttl$/;
/** The most study days a month's answers can have: its own and a day either side (isOfStudyMonth). */
const MONTH_DAYS = 33;

/**
 * null when a value is not as the shape has it, or its days are not
 * days of its month, each once: the summary is derived, so it is made
 * again from the month's answers.
 */
export function monthSummaryFromRecord(data: MonthSummaryV1): StoredMonthSummary | null {
  const month = SUMMARIZED_MONTH.exec(data.document)?.[1];
  if (
    month === undefined ||
    data.days.length > MONTH_DAYS ||
    !data.days.every((value) => DAY_COUNTS.test(value)) ||
    !data.recallSeconds.every((value) => RECALL_SECONDS.test(value)) ||
    ![data.youngReviews, data.youngRecalled].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    )
  )
    return null;
  const studyDays = data.days.map((value) => value.split(" ")[0]!);
  if (
    new Set(studyDays).size !== studyDays.length ||
    !studyDays.every((day) => isOfStudyMonth(day, month))
  )
    return null;
  const recallSeconds: Record<number, number> = {};
  for (const value of data.recallSeconds) {
    const [seconds, count] = value.split(" ").map(Number);
    recallSeconds[seconds!] = count!;
  }
  return {
    document: data.document,
    version: data.version,
    summary: {
      days: data.days
        .map((value) => {
          const [studyDay, ...counts] = value.split(" ");
          const [answers, introduced, reviews, lapses] = counts.map(Number);
          return {
            studyDay: studyDay!,
            answers: answers!,
            introduced: introduced!,
            reviews: reviews!,
            lapses: lapses!,
          };
        })
        .sort((a, b) => a.studyDay.localeCompare(b.studyDay)),
      young: { reviews: data.youngReviews, recalled: data.youngRecalled },
      recallSeconds,
    },
  };
}

export function monthSummaryToRecord(stored: StoredMonthSummary): MonthSummaryV1 {
  const { summary } = stored;
  return {
    document: stored.document,
    version: stored.version,
    days: summary.days.map(
      (day) => `${day.studyDay} ${day.answers} ${day.introduced} ${day.reviews} ${day.lapses}`,
    ),
    youngReviews: summary.young.reviews,
    youngRecalled: summary.young.recalled,
    recallSeconds: Object.entries(summary.recallSeconds)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([seconds, count]) => `${seconds} ${count}`),
  };
}
