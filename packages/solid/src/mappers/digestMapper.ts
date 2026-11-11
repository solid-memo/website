// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, type NamedSubject, asUrl, getThingAll } from "../client/rdf";
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
import {
  catalogUrlOf,
  instanceDocumentUrls,
  isSafeDocumentUrl,
  isSameUrl,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { MAX_CATALOG_LINKS } from "../catalogLinks";
import { readVersioned, recordThing } from "../records";
import { MAX_DRAFT_DOCUMENTS_IN_ALL } from "../solidReleaseDraftRepository";

/** The subjects of a digest document each receipt, schedule and month summary was read from, by its key. */
export interface DigestSubjects {
  receipts: Map<string, string[]>;
  schedules: Map<string, string[]>;
  months: Map<string, string[]>;
  /** Those of receipts and schedules the digest was read without: about none of the instance's, past the most it is read with, or a schedule whose due days are not as its shape has them. */
  dropped: string[];
}

/**
 * The most receipts a digest of the instance at `instanceUrl` is read
 * with: one for each document the app notes one of, its fixed documents
 * (instanceDocumentUrls), each deck's two, MAX_CATALOG_LINKS decks at
 * most, and each of the drafts' documents, MAX_DRAFT_DOCUMENTS_IN_ALL at
 * most. A digest is data anyone may have written (a foreign instance's),
 * and each fact a visit learns is a change made to it, so what it holds
 * is kept to what an instance can have.
 */
function maxReceiptsOf(instanceUrl: string): number {
  return (
    instanceDocumentUrls(instanceUrl, []).length +
    2 * MAX_CATALOG_LINKS +
    MAX_DRAFT_DOCUMENTS_IN_ALL
  );
}

/** The most schedules a digest is read with: one for each deck, MAX_CATALOG_LINKS at most. */
const MAX_SCHEDULES = MAX_CATALOG_LINKS;

/**
 * Keep `next`, the digest `before` with changes made to it, to the most
 * receipts and schedules a digest is read with (maxReceiptsOf,
 * MAX_SCHEDULES), in place: past them, the entries no change replaced
 * go first, the earliest first, so what was just learned is written and
 * read back, and a digest that holds as many as it may (stale entries of
 * documents gone, or ones planted) still takes new ones.
 */
export function keepWithinLimits(
  instanceUrl: string,
  before: InstanceDigest,
  next: InstanceDigest,
): void {
  trim(next.receipts, before.receipts, maxReceiptsOf(instanceUrl));
  trim(next.schedules, before.schedules, MAX_SCHEDULES);
}

function trim<T>(now: Record<string, T>, was: Record<string, T>, most: number): void {
  const keys = Object.keys(now);
  if (keys.length <= most) return;
  const kept = (key: string) => was[key] === now[key];
  const order = [...keys.filter(kept), ...keys.filter((key) => !kept(key))];
  for (const key of order.slice(0, keys.length - most)) delete now[key];
}

/**
 * The digest a digest document holds, and the subjects it was read
 * from (more than one for a key said twice; whichever the app would
 * name it or not), so that what is dropped or written over is removed
 * where it is. Read leniently, being derived data: a subject that does
 * not fit its shape is left out, and so learned again. A schedule of an
 * older format is brought up to the latest (one of format 1 counted
 * SM-2's due days). So are a receipt of no document the app reads one
 * at (isSafeDocumentUrl), a schedule of no deck of the instance at
 * `instanceUrl` (a subject of its catalog), a schedule whose due days are
 * not as its shape has them (scheduleFromRecord), and those past
 * the most it is read with (maxReceiptsOf, MAX_SCHEDULES): their subjects are
 * `dropped`.
 */
export function toDigest(
  dataset: Dataset,
  instanceUrl: string,
): { digest: InstanceDigest; subjects: DigestSubjects } {
  const digest = emptyDigest();
  const subjects: DigestSubjects = {
    receipts: new Map(),
    schedules: new Map(),
    months: new Map(),
    dropped: [],
  };
  const catalog = catalogUrlOf(instanceUrl);
  const maxReceipts = maxReceiptsOf(instanceUrl);
  const readAt = (of: Map<string, string[]>, key: string, thing: NamedSubject) => {
    const at = of.get(key);
    if (at === undefined) of.set(key, [asUrl(thing)]);
    else at.push(asUrl(thing));
  };
  for (const thing of getThingAll(dataset)) {
    const receipt = readVersioned(thing, "documentReceipt");
    if (receipt !== null) {
      const read = receiptFromRecord(receipt.record.data);
      if (
        isSafeDocumentUrl(read.document) &&
        (subjects.receipts.has(read.document) || subjects.receipts.size < maxReceipts)
      ) {
        digest.receipts[read.document] = read;
        readAt(subjects.receipts, read.document, thing);
      } else subjects.dropped.push(asUrl(thing));
      continue;
    }
    const schedule = readVersioned(thing, "deckSchedule");
    if (schedule !== null) {
      const read = scheduleFromRecord(
        migrate("deckSchedule", schedule.record, { subject: asUrl(thing) }),
      );
      if (
        read !== null &&
        isSameUrl(documentUrlOf(read.deck), catalog) &&
        (subjects.schedules.has(read.deck) || subjects.schedules.size < MAX_SCHEDULES)
      ) {
        digest.schedules[read.deck] = read;
        readAt(subjects.schedules, read.deck, thing);
      } else subjects.dropped.push(asUrl(thing));
      continue;
    }
    const summary = readVersioned(thing, "monthSummary");
    if (summary !== null) {
      const read = monthSummaryFromRecord(summary.record.data);
      if (read !== null) {
        digest.months[read.document] = read;
        readAt(subjects.months, read.document, thing);
      }
    }
  }
  return { digest, subjects };
}

/**
 * The receipt's subject at `url`, built new rather than onto what `url`
 * held: the digest is derived data, so nothing else said there is kept
 * (withDigest in solidDigestRepository.ts).
 */
export function toReceiptThing(url: string, receipt: DocumentReceipt): NamedSubject {
  return recordThing(url, DOCUMENT_RECEIPT_V1, receiptToRecord(receipt), null);
}

/** The schedule's subject at `url`, built new as toReceiptThing builds a receipt's. */
export function toScheduleThing(url: string, schedule: StoredSchedule): NamedSubject {
  return recordThing(url, DECK_SCHEDULE_V2, scheduleToRecord(schedule), null);
}

/** The month summary's subject at `url`, built new as toReceiptThing builds a receipt's. */
export function toMonthSummaryThing(url: string, summary: StoredMonthSummary): NamedSubject {
  return recordThing(url, MONTH_SUMMARY_V1, monthSummaryToRecord(summary), null);
}
