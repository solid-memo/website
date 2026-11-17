// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";

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

/**
 * A list a screen draws a page of at a time: the first LIST_LIMIT at
 * first, LIST_LIMIT more each time the user asks for them (`showMore`),
 * and how many more there are. A new list starts again at the first
 * LIST_LIMIT.
 */
export function usePaged<T>(all: readonly T[]): {
  shown: T[];
  more: number;
  showMore: () => void;
} {
  const [paged, setPaged] = useState({ all, limit: LIST_LIMIT });
  const limit = paged.all === all ? paged.limit : LIST_LIMIT;
  return {
    ...bounded(all, all.length, limit),
    showMore: () => setPaged({ all, limit: limit + LIST_LIMIT }),
  };
}
