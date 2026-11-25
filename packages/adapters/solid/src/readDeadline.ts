// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";

/** How long a read waits for the server to start answering, or for the next part of its body, in milliseconds. */
export const READ_DEADLINE_MS = 10_000;

/**
 * How long a read of a server that is not the user's may take in all,
 * in milliseconds, its body too: far longer than the largest release
 * in the library takes to download, but a server that answers and then
 * sends its body slowly holds up no reader for good. A read in the
 * user's own storages has none, so a large document on a slow
 * connection still downloads.
 */
export const WHOLE_READ_MS = 120_000;

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Statuses whose answer has no body, though a browser may give a 304 an empty one: no response made with a body can have them. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * `fetch`, with deadlines on every read (docs/boundaries.md#the-pod-fence):
 * a read the server has not started to answer within `ms`, or whose
 * body then waits longer than `ms` for its next part, is aborted and
 * fails with `podNoAnswer`, which the app's queries try again; so is
 * one that takes longer than `wholeMs` in all, its body included, when
 * it is given, as it is for a read of a server that is not the user's.
 * Every read of another server has them, a pod's and a release's from
 * a link alike. Without them, a server that never answers, or answers
 * and then sends its body slowly or not at all, would keep a screen
 * loading for good, and a check that waits on the read would never
 * end. They hold whatever the fetch it wraps does: the read fails when
 * they pass even if that fetch never settles on the abort, and so does
 * its body. The first part of a body is asked for as soon as the answer
 * comes, read or not, and each next one only when the reader asks for
 * it, so a reader that takes its time is not cut off for it. A write
 * has none: one cut off might still be saved, and only its answer says
 * whether it was. A read the caller aborts fails as the caller's
 * signal says.
 */
export function withReadDeadline(
  fetch: typeof globalThis.fetch,
  ms = READ_DEADLINE_MS,
  wholeMs?: number,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!READS.has(method)) return fetch(input, init);
    const url = request?.url ?? String(input);
    const deadline = new AbortController();
    const caller = init?.signal ?? request?.signal;
    const signal = caller ? AbortSignal.any([caller, deadline.signal]) : deadline.signal;
    let late: AppError | undefined;
    let stopBody = (_error: AppError) => {};
    let whole: ReturnType<typeof setTimeout> | undefined;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(whole);
      clearTimeout(wait);
    };
    const giveUp = (after: number) => () => {
      done();
      late = new AppError("podNoAnswer", { url, seconds: after / 1000 });
      deadline.abort(late);
      stopBody(late);
    };
    if (wholeMs !== undefined) whole = setTimeout(giveUp(wholeMs), wholeMs);
    wait = setTimeout(giveUp(ms), ms);
    let response: Response;
    try {
      const answer = fetch(input, { ...init, signal });
      // An answer that comes after the read was given up on is let go.
      answer.then(
        (after) => {
          if (signal.aborted) after.body?.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      const abort = aborted(signal);
      try {
        // The abort comes first, so a read already given up on never wins with an answer let go.
        response = await Promise.race([abort.promise, answer]);
      } finally {
        abort.stop();
      }
    } catch (error) {
      done();
      if (late === undefined || caller?.aborted) throw error;
      throw late;
    }
    clearTimeout(wait);
    if (response.body === null || NULL_BODY_STATUSES.has(response.status)) {
      done();
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stopBody = (error) => {
          controller.error(error);
          // The server's body may not end on the abort; it is let go all the same.
          reader.cancel(error).catch(() => undefined);
        };
      },
      async pull(controller) {
        wait = setTimeout(giveUp(ms), ms);
        try {
          const next = await reader.read();
          if (late !== undefined) return;
          if (next.done) {
            done();
            controller.close();
          } else controller.enqueue(next.value);
        } catch (error) {
          done();
          throw late ?? error;
        } finally {
          clearTimeout(wait);
        }
      },
      cancel(reason) {
        done();
        return reader.cancel(reason);
      },
    });
    const timed = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // A response made here has no URL of its own; the library names the document by it.
    Object.defineProperty(timed, "url", { value: response.url });
    Object.defineProperty(timed, "redirected", { value: response.redirected });
    return timed;
  };
}

/**
 * A promise that fails as `signal` says once it is aborted, and never
 * settles before, and a function that stops it listening once the race
 * it is in is settled.
 */
function aborted(signal: AbortSignal): { promise: Promise<never>; stop: () => void } {
  const controller = new AbortController();
  const promise = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  });
  return { promise, stop: () => controller.abort() };
}
