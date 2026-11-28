// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReadBudget } from "@solid-memo/application/ports/checks";
import { ReadLimitError, type ReadLimits } from "@solid-memo/solid-client/interface";
import {
  type HeldRoom,
  holdRoom,
  limitsOf,
  type ReadsSpent,
  refusalOf,
  spentOf,
} from "@solid-memo/solid-client/readLimits";
import {
  fromSent,
  type OffPageConfig,
  type PageMessage,
  type Port,
  READ_HEADERS,
  READ_METHODS,
  refreeze,
  type SentError,
  type SentResponse,
  toSent,
  type WorkerMessage,
} from "./offPageProtocol";

/**
 * How long a job may work off the page, in milliseconds, its requests'
 * time aside: the page waits for those itself, each with the deadlines
 * of its fetch (readDeadline.ts). The check of the largest release in
 * the library takes a small part of it on a slow phone. Past it, the
 * worker is ended and the document is shown as too large to read.
 */
export const OFF_PAGE_DEADLINE_MS = 60_000;

/**
 * How many jobs of one pool work at once, each in a worker of its own.
 * Each worker holds the shapes it has read, so more would take more of
 * the device's memory. A job keeps its worker while it waits for its
 * requests too, unless its runner frees it then (createOffPage
 * `freeWhileWaiting`).
 */
export const OFF_PAGE_WORKERS = 4;

/** How many workers there are at most where a job waiting for its requests frees its place: those waiting among them. */
export const OFF_PAGE_WORKERS_IN_ALL = 16;

/** How long a worker no job needs is kept, in milliseconds, for the next one, with the shapes it has read; then it is ended. */
export const IDLE_WORKER_MS = 30_000;

/** A worker as the page holds it (Worker): its channel, and the way to end it. */
export interface WorkerLike extends Port {
  terminate(): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: (event: MessageEvent & Event) => void,
  ): void;
}

/** A job to run off the page (offPageJobs.ts names them). */
export interface OffPageJob {
  job: string;
  input: unknown;
  /** The page's fetches the job makes its requests with, by the names the job knows them by. */
  fetches?: Record<string, typeof globalThis.fetch>;
  /** A budget of the page's its reads spend (ReadBudget). */
  budget?: ReadBudget;
  /**
   * What the job fails with when it runs past its deadline, or its
   * worker ends before it is done (out of memory, say): the document's
   * "too large to read".
   */
  tooLarge: () => unknown;
}

/** Runs jobs off the page (createOffPage). */
export interface OffPage {
  run<T>(job: OffPageJob): Promise<T>;
}

/** A worker of the pool, and what it does with what it hears while a job runs on it. */
interface Slot {
  worker: WorkerLike;
  hear: (message: WorkerMessage) => void;
  end: () => void;
  idle?: ReturnType<typeof setTimeout>;
}

/**
 * The page's answer to a job's request, its body read whole, with the
 * limits the fetch reads it under and the tally of those it counts in,
 * if any (limitedFetch).
 */
async function answerOf(
  fetch: typeof globalThis.fetch,
  { url, init }: Extract<WorkerMessage, { type: "fetch" }>,
  signal: AbortSignal,
): Promise<{ sent: SentResponse; read?: { limits: ReadLimits; spent: ReadsSpent } }> {
  // The page holds the worker to reads too: any other method is refused, and only a read's headers are sent.
  const method = init.method.toUpperCase();
  if (!READ_METHODS.has(method)) throw new TypeError(`A read off the page only reads: ${method}`);
  const response = await fetch(url, {
    method,
    headers: init.headers.filter(([name]) => READ_HEADERS.has(name.toLowerCase())),
    ...(init.cache === undefined ? {} : { cache: init.cache }),
    ...(init.redirect === undefined ? {} : { redirect: init.redirect }),
    signal,
  });
  // A browser may give a 304 an empty body, which no response made with a status that has none may have.
  const body =
    response.body === null || NULL_BODY_STATUSES.has(response.status)
      ? null
      : await bytesOf(response.body).catch((error: unknown) => {
          throw refusalOf(response) ?? error;
        });
  const sent: SentResponse = {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    redirected: response.redirected,
    headers: [...response.headers],
    body,
  };
  const limits = limitsOf(response);
  return limits === undefined ? { sent } : { sent, read: { limits, spent: spentOf(response)! } };
}

/**
 * Work on documents the app did not write, off the page
 * (docs/validation.md, Off the page): each job runs in a worker of its
 * own, at most `workers` of them at once, the others waiting their
 * turn; a worker done with its job is kept `idleMs` for the next. With
 * `freeWhileWaiting`, a job waiting for its requests doesn't count
 * among them, so a slow server holds no other job up, and there are at
 * most `workersInAll` workers: for jobs that read no shapes, whose
 * workers are cheap to start. Its answers then wait for a place to
 * work, so that no more than `workers` jobs parse at once. The
 * room each answer's parse may take of a budget the page's reads share
 * is held in the page's tally until its counts come back (holdRoom). The
 * job's requests are made here, with the page's fetches it is given, so
 * that the worker never holds the user's login (offPageServe.ts). Its
 * clock runs while it is not waiting for one of them: past `deadlineMs`,
 * the worker is ended, and the job fails as its `tooLarge` says, as it
 * does when the worker ends on its own. The page goes on either way.
 */
export function createOffPage({
  spawn,
  config,
  deadlineMs = OFF_PAGE_DEADLINE_MS,
  workers = OFF_PAGE_WORKERS,
  workersInAll = OFF_PAGE_WORKERS_IN_ALL,
  freeWhileWaiting = false,
  idleMs = IDLE_WORKER_MS,
}: {
  spawn: () => WorkerLike;
  config: OffPageConfig;
  deadlineMs?: number;
  workers?: number;
  workersInAll?: number;
  freeWhileWaiting?: boolean;
  idleMs?: number;
}): OffPage {
  const idle: Slot[] = [];
  const waiting: { take: (slot: Slot) => void; fail: (error: unknown) => void }[] = [];
  /** The jobs whose requests are answered, waiting for a place to work again (`freeWhileWaiting`): before any new job. */
  const resuming: (() => void)[] = [];
  /** The workers there are, and the jobs working: on a worker, and not waiting for a request. */
  let running = 0;
  let working = 0;
  /** An id for each of the page's fetches, the same in every job, so a worker keeps what it read with one apart. */
  const fetchIds = new WeakMap<typeof globalThis.fetch, number>();
  let fetches = 0;
  const idOf = (fetch: typeof globalThis.fetch) => {
    let id = fetchIds.get(fetch);
    if (id === undefined) {
      id = ++fetches;
      fetchIds.set(fetch, id);
    }
    return id;
  };

  function spawned(): Slot {
    const worker = spawn();
    const slot: Slot = { worker, hear: ignore, end: ignore };
    worker.addEventListener("message", (event) => slot.hear(event.data as WorkerMessage));
    worker.addEventListener("error", () => slot.end());
    worker.addEventListener("messageerror", () => slot.end());
    return slot;
  }

  /** A worker for a job that may work now, counted as working: an idle one, else a new one; none while too many work. */
  function take(): Slot | undefined {
    if (working >= workers) return undefined;
    const kept = idle.pop();
    if (kept !== undefined) {
      clearTimeout(kept.idle);
      kept.end = ignore;
      working++;
      return kept;
    }
    if (running >= workersInAll) return undefined;
    running++;
    try {
      const slot = spawned();
      working++;
      return slot;
    } catch (error) {
      running--;
      throw error;
    }
  }

  /** The jobs waiting, each given a place to work while there is one: those answered first, then new ones on a worker. */
  function wake(): void {
    while (resuming.length > 0 && working < workers) {
      working++;
      resuming.shift()!();
    }
    while (waiting.length > 0) {
      let slot: Slot | undefined;
      try {
        slot = take();
      } catch (error) {
        waiting.shift()!.fail(error);
        continue;
      }
      if (slot === undefined) return;
      waiting.shift()!.take(slot);
    }
  }

  async function acquire(): Promise<Slot> {
    return take() ?? new Promise((take, fail) => waiting.push({ take, fail }));
  }

  /** The slot, its job done, kept idle for `idleMs`, for the jobs waiting first; one that ends meanwhile is let go. */
  function release(slot: Slot): void {
    slot.hear = ignore;
    const retire = () => {
      clearTimeout(slot.idle);
      idle.splice(idle.indexOf(slot), 1);
      slot.worker.terminate();
      running--;
      wake();
    };
    slot.end = retire;
    slot.idle = setTimeout(retire, idleMs);
    idle.push(slot);
    wake();
  }

  function discard(slot: Slot): void {
    slot.hear = ignore;
    slot.end = ignore;
    slot.worker.terminate();
    running--;
    wake();
  }

  function runOn<T>(slot: Slot, job: OffPageJob): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const named = Object.entries(job.fetches ?? {});
      const byId = new Map(named.map(([, fetch]) => [idOf(fetch), fetch]));
      const calls = new Map<number, AbortController>();
      /** The room each answer read under limits holds in the page's tally for the job's parse of it, until its counts come back. */
      const held = new Map<number, { room: HeldRoom; url: string }>();
      /** The budget each answer's parse went past, by its address, where the room held for it was less than its own limits. */
      const pastBudgets = new Map<string, ReadLimits>();
      const budgetDone = new Map<number, () => void>();
      const sentErrors = new Map<number, unknown>();
      const send = (message: PageMessage, transfer: Transferable[] = []) =>
        slot.worker.postMessage(message, transfer);
      /** The answers kept from the worker while the job has no place to work (`freeWhileWaiting`). */
      let unsent: [PageMessage, Transferable[]][] = [];
      let settled = false;
      /** Whether the job has a place among those that work, and the way it waits for one. */
      let placed = true;
      let resumer: (() => void) | undefined;
      let left = deadlineMs;
      let since = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let waitingOn = 0;
      /** An answer for the worker: sent once the job has a place to work, so that no more jobs parse at once than there are places. */
      const answer = (message: PageMessage, transfer: Transferable[] = []) => {
        unsent.push([message, transfer]);
        if (placed) flush();
      };
      const flush = () => {
        for (const [message, transfer] of unsent) send(message, transfer);
        unsent = [];
      };
      /**
       * What the job failed with, made again: a read past its limits whose
       * parse went past the room a budget the page's reads share left it
       * (HeldRoom's settle) names that budget, as a read in the page would
       * (isPastBudget).
       */
      const failure = (sent: SentError): unknown => {
        const error = fromSent(sent);
        if (!(error instanceof ReadLimitError)) return error;
        // Past the room a budget left: the budget, though the room given back leaves the tally within it now.
        const budget = pastBudgets.get(error.url);
        return budget === undefined ? error : new ReadLimitError(error.url, budget);
      };
      const work = () => {
        since = Date.now();
        timer = setTimeout(slot.end, left);
        flush();
      };
      // A job waiting for its requests doesn't work; with `freeWhileWaiting`, it gives up its place, and waits for one again.
      const resume = () => {
        if (!freeWhileWaiting) return work();
        resumer = () => {
          resumer = undefined;
          placed = true;
          work();
        };
        resuming.push(resumer);
        wake();
      };
      const pause = () => {
        // A request made while the job waits for a place: it goes on waiting for its requests.
        if (resumer !== undefined) {
          resuming.splice(resuming.indexOf(resumer), 1);
          resumer = undefined;
          return;
        }
        clearTimeout(timer);
        left -= Date.now() - since;
        if (!freeWhileWaiting) return;
        placed = false;
        working--;
        wake();
      };
      // Once settled, the slot hears nothing more of this job (release, discard): it settles once.
      const settle = (done: () => void, ended = false) => {
        settled = true;
        if (placed) working--;
        if (resumer !== undefined) resuming.splice(resuming.indexOf(resumer), 1);
        unsent = [];
        clearTimeout(timer);
        for (const controller of calls.values()) controller.abort();
        for (const finish of budgetDone.values()) finish();
        // The room of an answer the job's parse sent no counts of goes back to the budget.
        for (const { room } of held.values()) room.settle({ quads: 0, characters: 0 });
        held.clear();
        if (ended) discard(slot);
        else release(slot);
        done();
      };
      /** The answer to a request, with the room its parse may take of the page's tally, held until its counts come back. */
      const answered = async (
        call: number,
        { sent, read }: Awaited<ReturnType<typeof answerOf>>,
      ) => {
        if (read !== undefined && !settled) {
          // A job holding room already takes what is left at once, so that it never waits for itself: that
          // may be no room, and its parse is then past the budget at once, which settling it names (failure).
          const room = await holdRoom(read.spent, read.limits, { wait: held.size === 0 });
          if (settled) return room.settle({ quads: 0, characters: 0 });
          held.set(call, { room, url: sent.url });
          sent.read = { limits: read.limits, spent: room.start };
        }
        if (!settled) answer({ type: "response", call, response: sent }, bodyOf(sent));
      };
      slot.end = () => settle(() => reject(job.tooLarge()), true);
      slot.hear = (message) => {
        switch (message.type) {
          case "fetch": {
            const controller = new AbortController();
            calls.set(message.call, controller);
            if (waitingOn++ === 0) pause();
            answerOf(byId.get(message.fetch)!, message, controller.signal)
              .then(
                (got) => answered(message.call, got),
                (error: unknown) => {
                  const ref = sentErrors.size + 1;
                  sentErrors.set(ref, error);
                  if (!settled)
                    answer({ type: "rejected", call: message.call, error: toSent(error, ref) });
                },
              )
              .finally(() => {
                calls.delete(message.call);
                if (--waitingOn === 0 && !settled) resume();
              });
            return;
          }
          case "abort":
            calls.get(message.call)?.abort();
            return;
          case "tally": {
            // Sent only of an answer read under limits, whose room is held, and only once.
            const { room, url } = held.get(message.call)!;
            held.delete(message.call);
            const budget = room.settle(message);
            if (budget !== undefined) pastBudgets.set(url, budget);
            return;
          }
          case "spend":
            void job
              .budget!.spend(SPENT, async () => {
                send({ type: "budget", call: message.call, event: "start" });
                await new Promise<void>((done) => budgetDone.set(message.call, done));
                return DONE;
              })
              .then((spent) => {
                budgetDone.delete(message.call);
                if (spent === SPENT && !settled)
                  send({ type: "budget", call: message.call, event: "spent" });
              });
            return;
          case "spendDone":
            budgetDone.get(message.call)?.();
            return;
          case "done":
            settle(() => resolve(refreeze(message.result as T, message.frozen)));
            return;
          case "failed":
            settle(() =>
              reject(
                message.error.ref === undefined
                  ? failure(message.error)
                  : sentErrors.get(message.error.ref),
              ),
            );
        }
      };
      since = Date.now();
      timer = setTimeout(slot.end, left);
      send({
        type: "run",
        job: job.job,
        input: job.input,
        config,
        fetches: Object.fromEntries(named.map(([name, fetch]) => [name, idOf(fetch)])),
        budget: job.budget !== undefined,
      });
    });
  }

  return {
    async run<T>(job: OffPageJob): Promise<T> {
      return runOn<T>(await acquire(), job);
    },
  };
}

/** The statuses whose responses have no body (Fetch Standard, "null body status"). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/** What a worker's slot does with what it hears, or with its end, while no job runs on it: nothing. */
function ignore(): void {}

/** What a budget's spend gives when the budget is spent before the read is done, and when it is. */
const SPENT = Symbol("spent");
const DONE = Symbol("done");

/**
 * A body's bytes, read from its stream: a failure of the stream is
 * thrown as it is, as a parse of the body in the page would have met it
 * (readDeadline.ts fails a body that stops coming with podNoAnswer),
 * not as reading the whole of it with arrayBuffer may wrap it.
 */
async function bytesOf(body: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = body.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(next.value);
    length += next.value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes.buffer;
}

/** The body of an answer, handed over to the worker rather than copied. */
function bodyOf(response: SentResponse): Transferable[] {
  return response.body === null ? [] : [response.body];
}
