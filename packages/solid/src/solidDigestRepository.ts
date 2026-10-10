import { createSolidDataset, getThing, removeThing, setThing, type SolidDataset } from "@inrupt/solid-client";
import type { DigestRepository } from "@solid-memo/application/ports";
import { digestSubjectOf, digestUrlOf } from "@solid-memo/domain/instanceLayout";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { toDigest, toReceiptThing, toScheduleThing } from "./mappers/digestMapper";
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
  const queues = new Map<string, { waiting: { change: Change; done: () => void; failed: (e: unknown) => void }[]; writing: boolean }>();

  async function write(instanceUrl: string, changes: Change[]): Promise<void> {
    const url = digestUrlOf(instanceUrl);
    for (let attempt = 1; ; attempt++) {
      if (attempt > 1) await wait(PAUSE_MS * (attempt - 1));
      const dataset = await getSolidDatasetOrNull(url, fetch);
      const stored = dataset === null ? null : toDigest(dataset);
      const next = changes.reduce<InstanceDigest | null>((digest, change) => change(digest), stored)!;
      const { updated, subjects } = withDigest(instanceUrl, dataset ?? createSolidDataset(), stored, next);
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
        await write(instanceUrl, batch.map(({ change }) => change));
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
      return dataset === null ? null : toDigest(dataset);
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

/** The digest document holding `next`: only the subjects that differ from `stored` are written or removed. */
function withDigest(
  instanceUrl: string,
  dataset: SolidDataset,
  stored: InstanceDigest | null,
  next: InstanceDigest,
): { updated: SolidDataset; subjects: string[] } {
  let updated = dataset;
  const subjects: string[] = [];
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const before = stored ?? { receipts: {}, schedules: {} };
  for (const [document, receipt] of Object.entries(next.receipts)) {
    if (!differs(before.receipts[document], receipt)) continue;
    const url = digestSubjectOf(instanceUrl, "receipt", document);
    updated = setThing(updated, toReceiptThing(url, receipt, getThing(updated, url)));
    subjects.push(url);
  }
  for (const [deck, schedule] of Object.entries(next.schedules)) {
    if (!differs(before.schedules[deck], schedule)) continue;
    const url = digestSubjectOf(instanceUrl, "schedule", deck);
    updated = setThing(updated, toScheduleThing(url, schedule, getThing(updated, url)));
    subjects.push(url);
  }
  const gone = [
    ...Object.keys(before.receipts).filter((document) => !(document in next.receipts)).map((d) => digestSubjectOf(instanceUrl, "receipt", d)),
    ...Object.keys(before.schedules).filter((deck) => !(deck in next.schedules)).map((d) => digestSubjectOf(instanceUrl, "schedule", d)),
  ];
  for (const url of gone) {
    updated = removeThing(updated, url);
    subjects.push(url);
  }
  return { updated, subjects };
}
