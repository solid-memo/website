// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckScheduleV2, DocumentReceiptV1 } from "@solid-memo/vocab/types.generated";
import {
  conceptOfDirection,
  conceptOfScheduler,
  directionOfConcept,
  schedulerOfConcept,
} from "./concepts";
import type { DocumentReceipt, StoredSchedule } from "./studyDigest";

/**
 * The digest's subjects between their shape records and the model. A
 * schedule's prompts due by day are "YYYY-MM-DD count" values in the
 * record, a map in the model; its direction and scheduler are concepts
 * in the record, notations in the model.
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
