// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";

/** How long a read waits for the server to start answering, in milliseconds. */
export const READ_DEADLINE_MS = 10_000;

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * `fetch`, with a deadline on every read (docs/boundaries.md#the-pod-fence):
 * a read the server has not started to answer within `ms` is aborted, and
 * rejects with `podNoAnswer`, which the app's queries try again. Without
 * it, a request the server never answers would keep a screen loading for
 * good. The deadline ends with the response's headers, so a large
 * document takes as long as it needs to download. A write has none: one
 * cut off might still be saved, and only its answer says whether it was.
 * A read the caller aborts rejects as the caller's signal says.
 */
export function withReadDeadline(
  fetch: typeof globalThis.fetch,
  ms = READ_DEADLINE_MS,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!READS.has(method)) return fetch(input, init);
    const deadline = new AbortController();
    const caller = init?.signal ?? request?.signal;
    const signal = caller ? AbortSignal.any([caller, deadline.signal]) : deadline.signal;
    const timer = setTimeout(() => deadline.abort(), ms);
    try {
      return await fetch(input, { ...init, signal });
    } catch (error) {
      if (!deadline.signal.aborted || caller?.aborted) throw error;
      const url = request?.url ?? String(input);
      throw new AppError("podNoAnswer", { url, seconds: ms / 1000 });
    } finally {
      clearTimeout(timer);
    }
  };
}
