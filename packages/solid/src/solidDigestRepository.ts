// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, type NamedSubject, createSolidDataset, removeThings } from "./client/rdf";
import type { DigestRepository } from "@solid-memo/application/ports";
import { digestSubjectOf, digestUrlOf } from "@solid-memo/domain/instanceLayout";
import {
  changedDigest,
  emptyDigest,
  type DigestChange,
  type InstanceDigest,
} from "@solid-memo/domain/studyDigest";
import { AppError } from "@solid-memo/domain/appError";
import { HttpError } from "./client/interface";
import { editOf } from "./datasetEdit";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import {
  type DigestSubjects,
  keepWithinLimits,
  toDigest,
  toMonthSummaryThing,
  toReceiptThing,
  toScheduleThing,
} from "./mappers/digestMapper";
import { noWriteCheck, type WriteCheck } from "./writeCheck";

export interface SolidDigestRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** Waits before a write is made again (tests: at once). */
  wait?: (ms: number) => Promise<void>;
}

/**
 * How often a write is made, in all, while the digest keeps changing
 * elsewhere (412), and how long it waits before each try again. Another
 * page learning a check's documents writes the digest several times
 * running; trying again at once, a write could lose to each of those and
 * be dropped, so it waits a little longer each time, for them to be done.
 */
const ATTEMPTS = 6;
const PAUSE_MS = 50;

/** What a pod answers when it will not take what a write says, as opposed to who asks or how it is doing. */
const REFUSED_STATUSES = new Set([400, 409, 413, 422]);

/**
 * Whether a write, once the digest was read and changed, may have been
 * refused for what one of its changes says: the app refused a term or a
 * shape, or the pod answered with one of REFUSED_STATUSES. Not a version
 * conflict and not a request that failed, which each change alone would
 * meet the same way; a failed read of the digest is never asked about
 * (write). A pod that refuses every write alike is found by the
 * changes first written alone (settleApart).
 */
function isRefusal(error: unknown): boolean {
  if (error instanceof PreconditionFailedError) return false;
  if (error instanceof HttpError) return REFUSED_STATUSES.has(error.statusCode);
  return error instanceof AppError;
}

/** A write refused for what it says (isRefusal), and why. */
class Refused {
  constructor(readonly reason: unknown) {}
}

/** The status the pod refused a write with (isRefusal), or undefined when it was refused otherwise or not at all. */
const podRefusalOf = (error: unknown) =>
  error instanceof Refused && error.reason instanceof HttpError
    ? error.reason.statusCode
    : undefined;

/** What a write failed with, as its callers are told. */
const reasonOf = (error: unknown) => (error instanceof Refused ? error.reason : error);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A change waiting to be written, and who to tell how it went. */
interface Waiting {
  change: DigestChange;
  done: () => void;
  failed: (e: unknown) => void;
}

/**
 * Each instance's digest as its digest.ttl (domain/studyDigest.ts). A
 * change is read → change → written like any edit (If-Match); when the
 * document changed meanwhile, it is read and changed again. Changes asked
 * for while a write is under way go together in the next one, so a visit
 * that learns many things writes the digest once or twice; they are made
 * to one copy of what was read (changedDigest), so many of them take
 * time that grows with the digest and their number, not their product.
 * What is written is kept to what a digest is read with, the entries
 * just changed kept first (keepWithinLimits). Changes refused together
 * are written again one at a time, so only the one refused fails
 * (isRefusal, settleApart).
 */
export function createSolidDigestRepository({
  fetch,
  checkWrite = noWriteCheck,
  wait = sleep,
}: SolidDigestRepositoryDeps): DigestRepository {
  const queues = new Map<string, { waiting: Waiting[]; writing: boolean }>();

  async function write(instanceUrl: string, changes: DigestChange[]): Promise<void> {
    const url = digestUrlOf(instanceUrl);
    for (let attempt = 1; ; attempt++) {
      if (attempt > 1) await wait(PAUSE_MS * (attempt - 1));
      const dataset = await getSolidDatasetOrNull(url, fetch);
      const stored = dataset === null ? null : toDigest(dataset, instanceUrl);
      const next = changedDigest(stored?.digest ?? null, changes);
      keepWithinLimits(instanceUrl, stored?.digest ?? emptyDigest(), next);
      const { updated, subjects } = withDigest(
        instanceUrl,
        dataset ?? createSolidDataset(),
        stored,
        next,
      );
      if (subjects.length === 0) return;
      try {
        await checkWrite(updated, subjects, "pod");
        await saveDataset(url, updated, fetch);
        return;
      } catch (error) {
        if (isRefusal(error)) throw new Refused(error);
        if (!(error instanceof PreconditionFailedError) || attempt === ATTEMPTS) throw error;
      }
    }
  }

  async function drain(instanceUrl: string): Promise<void> {
    const queue = queues.get(instanceUrl)!;
    while (queue.waiting.length > 0) {
      await settle(instanceUrl, queue.waiting.splice(0));
    }
    queue.writing = false;
  }

  async function settle(instanceUrl: string, batch: Waiting[]): Promise<void> {
    try {
      await write(
        instanceUrl,
        batch.map(({ change }) => change),
      );
      for (const { done } of batch) done();
    } catch (error) {
      if (error instanceof Refused && batch.length > 1) {
        await settleApart(instanceUrl, batch, error);
      } else for (const { failed } of batch) failed(reasonOf(error));
    }
  }

  /**
   * `batch`, refused together (`refusal`), written a change at a time,
   * so only the one refused fails. Until one is written, a pod that
   * refuses one alone with an answer it gave already, to the batch or
   * to one before, is taken to refuse every write alike (over its
   * quota, say), and the rest fail with it unwritten: such a pod is
   * asked to write twice more at most. A change the app refuses never
   * stops the others, and once one is written, each is.
   */
  async function settleApart(
    instanceUrl: string,
    batch: Waiting[],
    refusal: Refused,
  ): Promise<void> {
    const answered = new Set([podRefusalOf(refusal)]);
    let written = false;
    for (const [i, { change, done, failed }] of batch.entries()) {
      try {
        await write(instanceUrl, [change]);
        done();
        written = true;
      } catch (error) {
        const why = reasonOf(error);
        failed(why);
        const status = podRefusalOf(error);
        if (written || status === undefined) continue;
        if (answered.has(status)) {
          for (const rest of batch.slice(i + 1)) rest.failed(why);
          return;
        }
        answered.add(status);
      }
    }
  }

  return {
    async readDigest(instanceUrl) {
      const dataset = await getSolidDatasetOrNull(digestUrlOf(instanceUrl), fetch);
      return dataset === null ? null : toDigest(dataset, instanceUrl).digest;
    },

    updateDigest(instanceUrl, change) {
      let queue = queues.get(instanceUrl);
      if (queue === undefined) {
        queue = { waiting: [], writing: false };
        queues.set(instanceUrl, queue);
      }
      const done = new Promise<void>((resolve, reject) =>
        queue.waiting.push({ change, done: resolve, failed: reject }),
      );
      if (!queue.writing) {
        queue.writing = true;
        void drain(instanceUrl);
      }
      return done;
    },
  };
}

/**
 * The digest document holding `next`: only the subjects that differ
 * from `stored` are written or removed, all in one edit of the dataset
 * (datasetEdit.ts), so a write takes time that grows with the document
 * and its subjects, not their product. What is dropped is removed at
 * each subject it was read from, as is any other subject a rewritten
 * one was read from, so none is left to be read again, and every subject
 * the digest was read without (toDigest).
 */
function withDigest(
  instanceUrl: string,
  dataset: Dataset,
  stored: { digest: InstanceDigest; subjects: DigestSubjects } | null,
  next: InstanceDigest,
): { updated: Dataset; subjects: string[] } {
  const before = stored?.digest ?? emptyDigest();
  const readAt = stored?.subjects ?? {
    receipts: new Map(),
    schedules: new Map(),
    months: new Map(),
    dropped: [],
  };
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const sets: { url: string; make: (existing: NamedSubject | null) => NamedSubject }[] = [];
  const gone: string[] = [...readAt.dropped];
  function plan<T>(
    kind: "receipt" | "schedule" | "month",
    was: Record<string, T>,
    now: Record<string, T>,
    at: Map<string, string[]>,
    toThing: (url: string, value: T, existing: NamedSubject | null) => NamedSubject,
  ): void {
    for (const [key, value] of Object.entries(now)) {
      // An entry no change replaced is the one read (changedDigest).
      if (was[key] === value || !differs(was[key], value)) continue;
      const url = digestSubjectOf(instanceUrl, kind, key);
      for (const other of at.get(key) ?? []) if (other !== url) gone.push(other);
      sets.push({ url, make: (existing) => toThing(url, value, existing) });
    }
    for (const key of Object.keys(was)) {
      if (Object.hasOwn(now, key)) continue;
      for (const subject of at.get(key)!) gone.push(subject);
    }
  }
  plan("receipt", before.receipts, next.receipts, readAt.receipts, toReceiptThing);
  plan("schedule", before.schedules, next.schedules, readAt.schedules, toScheduleThing);
  plan("month", before.months, next.months, readAt.months, toMonthSummaryThing);
  const edit = editOf(removeThings(dataset, gone));
  for (const { url, make } of sets) edit.setThing(make(edit.getThing(url)));
  return {
    updated: edit.done(),
    subjects: [...new Set([...sets.map(({ url }) => url), ...gone])],
  };
}
