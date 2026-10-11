import { getThingAll, type ThingPersisted, type SolidDataset } from "@inrupt/solid-client";
import {
  receiptFromRecord,
  receiptToRecord,
  scheduleFromRecord,
  scheduleToRecord,
} from "@solid-memo/domain/digestRecord";
import type {
  DocumentReceipt,
  InstanceDigest,
  StoredSchedule,
} from "@solid-memo/domain/studyDigest";
import { DECK_SCHEDULE_V1, DOCUMENT_RECEIPT_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/**
 * The digest a digest document holds. Read leniently, being derived
 * data: a subject that does not fit its shape is left out, and so
 * learned again.
 */
export function toDigest(dataset: SolidDataset): InstanceDigest {
  const digest: InstanceDigest = { receipts: {}, schedules: {} };
  for (const thing of getThingAll(dataset)) {
    const receipt = readVersioned(thing, "documentReceipt");
    if (receipt !== null) {
      const read = receiptFromRecord(receipt.record.data);
      digest.receipts[read.document] = read;
      continue;
    }
    const schedule = readVersioned(thing, "deckSchedule");
    if (schedule !== null) {
      const read = scheduleFromRecord(schedule.record.data);
      digest.schedules[read.deck] = read;
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
  return recordThing(url, DECK_SCHEDULE_V1, scheduleToRecord(schedule), existing);
}
