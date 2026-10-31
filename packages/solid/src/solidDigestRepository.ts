// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, type NamedSubject, createSolidDataset, removeThings } from "./client/rdf";
import type { DigestRepository } from "@solid-memo/application/ports";
import { digestSubjectOf, digestUrlOf } from "@solid-memo/domain/instanceLayout";
import { emptyDigest, type InstanceDigest } from "@solid-memo/domain/studyDigest";
import { editOf } from "./datasetEdit";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import {
  type DigestSubjects,
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Each instance's digest as its digest.ttl (domain/studyDigest.ts). A
 * change is read → change → written like any edit (If-Match); when the
 * document changed meanwhile, it is read and changed again. Changes asked
 * for while a write is under way go together in the next one, so a visit
 * that learns many things writes the digest once or twice.
 */
export function createSolidDigestRepository({
  fetch,
  checkWrite = noWriteCheck,
  wait = sleep,
}: SolidDigestRepositoryDeps): DigestRepository {
  type Change = (stored: InstanceDigest | null) => InstanceDigest;
  const queues = new Map<
    string,
    {
      waiting: { change: Change; done: () => void; failed: (e: unknown) => void }[];
      writing: boolean;
    }
  >();

  async function write(instanceUrl: string, changes: Change[]): Promise<void> {
    const url = digestUrlOf(instanceUrl);
    for (let attempt = 1; ; attempt++) {
      if (attempt > 1) await wait(PAUSE_MS * (attempt - 1));
      const dataset = await getSolidDatasetOrNull(url, fetch);
      const stored = dataset === null ? null : toDigest(dataset);
      const next = changes.reduce<InstanceDigest | null>(
        (digest, change) => change(digest),
        stored?.digest ?? null,
      )!;
      const { updated, subjects } = withDigest(
        instanceUrl,
        dataset ?? createSolidDataset(),
        stored,
        next,
      );
      if (subjects.length === 0) return;
      await checkWrite(updated, subjects, "pod");
      try {
        await saveDataset(url, updated, fetch);
        return;
      } catch (error) {
        if (!(error instanceof PreconditionFailedError) || attempt === ATTEMPTS) throw error;
      }
    }
  }

  async function drain(instanceUrl: string): Promise<void> {
    const queue = queues.get(instanceUrl)!;
    while (queue.waiting.length > 0) {
      const batch = queue.waiting.splice(0);
      try {
        await write(
          instanceUrl,
          batch.map(({ change }) => change),
        );
        for (const { done } of batch) done();
      } catch (error) {
        for (const { failed } of batch) failed(error);
      }
    }
    queue.writing = false;
  }

  return {
    async readDigest(instanceUrl) {
      const dataset = await getSolidDatasetOrNull(digestUrlOf(instanceUrl), fetch);
      return dataset === null ? null : toDigest(dataset).digest;
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
 * one was read from, so none is left to be read again.
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
  };
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const sets: { url: string; make: (existing: NamedSubject | null) => NamedSubject }[] = [];
  const gone: string[] = [];
  function plan<T>(
    kind: "receipt" | "schedule" | "month",
    was: Record<string, T>,
    now: Record<string, T>,
    at: Map<string, string[]>,
    toThing: (url: string, value: T, existing: NamedSubject | null) => NamedSubject,
  ): void {
    for (const [key, value] of Object.entries(now)) {
      if (!differs(was[key], value)) continue;
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
