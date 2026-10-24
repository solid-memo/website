// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { asUrl, getThingAll, type ThingPersisted, type SolidDataset } from "@inrupt/solid-client";
import {
  monthSummaryFromRecord,
  monthSummaryToRecord,
  receiptFromRecord,
  receiptToRecord,
  scheduleFromRecord,
  scheduleToRecord,
} from "@solid-memo/domain/digestRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import {
  emptyDigest,
  type DocumentReceipt,
  type InstanceDigest,
  type StoredMonthSummary,
  type StoredSchedule,
} from "@solid-memo/domain/studyDigest";
import {
  DECK_SCHEDULE_V2,
  DOCUMENT_RECEIPT_V1,
  MONTH_SUMMARY_V1,
} from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/**
 * The digest a digest document holds. Read leniently, being derived
 * data: a subject that does not fit its shape is left out, and so
 * learned again. A schedule of an older format is brought up to the
 * latest (one of format 1 counted SM-2's due days).
 */
export function toDigest(dataset: SolidDataset): InstanceDigest {
  const digest = emptyDigest();
  for (const thing of getThingAll(dataset)) {
    const receipt = readVersioned(thing, "documentReceipt");
    if (receipt !== null) {
      const read = receiptFromRecord(receipt.record.data);
      digest.receipts[read.document] = read;
      continue;
    }
    const schedule = readVersioned(thing, "deckSchedule");
    if (schedule !== null) {
      const read = scheduleFromRecord(
        migrate("deckSchedule", schedule.record, { subject: asUrl(thing) }),
      );
      digest.schedules[read.deck] = read;
      continue;
    }
    const summary = readVersioned(thing, "monthSummary");
    if (summary !== null) {
      const read = monthSummaryFromRecord(summary.record.data);
      if (read !== null) digest.months[read.document] = read;
    }
  }
  return digest;
}

export function toReceiptThing(
  url: string,
  receipt: DocumentReceipt,
  existing: ThingPersisted | null,
): ThingPersisted {
  return recordThing(url, DOCUMENT_RECEIPT_V1, receiptToRecord(receipt), existing);
}

export function toScheduleThing(
  url: string,
  schedule: StoredSchedule,
  existing: ThingPersisted | null,
): ThingPersisted {
  return recordThing(url, DECK_SCHEDULE_V2, scheduleToRecord(schedule), existing);
}

export function toMonthSummaryThing(
  url: string,
  summary: StoredMonthSummary,
  existing: ThingPersisted | null,
): ThingPersisted {
  return recordThing(url, MONTH_SUMMARY_V1, monthSummaryToRecord(summary), existing);
}
