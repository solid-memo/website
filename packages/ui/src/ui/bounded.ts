// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * How many of a list a screen draws at most: a release can state any
 * number of a thing, so each of its lists on a screen is bounded so,
 * and says how many more there are (bounded).
 */
export const LIST_LIMIT = 50;

/** The first `limit` of a list a screen draws, and how many more there are of `count` in all. */
export function bounded<T>(
  all: readonly T[],
  count = all.length,
  limit = LIST_LIMIT,
): { shown: T[]; more: number } {
  const shown = all.slice(0, limit);
  return { shown, more: Math.max(0, count - shown.length) };
}
