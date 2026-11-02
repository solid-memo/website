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
