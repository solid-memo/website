// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A list of what was used last, once `item` is used: `item` first, once
 * (those `same` as it dropped), the rest in their order, at most `limit`.
 */
export function latestFirst<T>(
  list: readonly T[],
  item: T,
  limit: number,
  same: (a: T, b: T) => boolean = Object.is,
): T[] {
  return [item, ...list.filter((each) => !same(each, item))].slice(0, limit);
}
