// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** How many requests are made at once: as many as a browser asks one server for over HTTP/1.1. */
export const READS_AT_ONCE = 6;

/**
 * `each` of `items`, in their order, `atOnce` of them at most at once:
 * a list anyone may have written, as long as it is, never asks for all
 * of its documents together. The first to fail fails the whole, and no
 * other is started after it.
 */
export async function mapAtOnce<T, R>(
  items: readonly T[],
  each: (item: T) => Promise<R>,
  atOnce = READS_AT_ONCE,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const at = next++;
      try {
        results[at] = await each(items[at]!);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
  return results;
}

/**
 * Work taken in turns, `atOnce` at most at once, the rest waiting in the
 * order asked: whoever asks, a list as long as anyone may write never
 * runs all of its work together. A turn ends when its work does, failed
 * or not.
 */
export function inTurns(atOnce = READS_AT_ONCE): <T>(work: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (work) => {
    if (running >= atOnce) await new Promise<void>((start) => waiting.push(start));
    else running++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next === undefined) running--;
      else next();
    }
  };
}

/**
 * Every one of `work`, as `Promise.all` gives them, settled before this
 * is: a turn whose first read fails ends only once its other reads have
 * too, so a failing read never frees the turn for more while they run.
 * It then fails with the failure of the first of `work` in their order
 * that failed, not the first to fail in time. It never fails early, on
 * purpose: failing before the others settle is what would free the turn.
 */
export async function allSettledThen<T extends readonly unknown[] | []>(
  work: T,
): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const settled = await Promise.allSettled(work);
  for (const one of settled) if (one.status === "rejected") throw one.reason;
  return settled.map((one) => (one as PromiseFulfilledResult<unknown>).value) as {
    -readonly [P in keyof T]: Awaited<T[P]>;
  };
}
