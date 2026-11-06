// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `prefix<n>`, n one more than the highest number `counted` finds after
 * `prefix` in `taken`, then the first such id that is none of `taken`
 * (`width`: n written with zeros before it up to so many digits).
 *
 * Ids can come from deck data, so a number after `prefix` can be any
 * length. `counted` matches 15 digits at most: above that, adding 1 may
 * not change a number, or may spell it in another way. A longer one is
 * ignored, and is an id like any other when it is met on the way up.
 * Numbers counted from there stay exact for far more ids than `taken`
 * can hold, so the search ends.
 */
export function nextNumberedId(
  prefix: string,
  taken: Iterable<string>,
  counted: RegExp,
  width = 1,
): string {
  const ids = new Set(taken);
  let highest = 0;
  for (const id of ids) {
    const n = id.startsWith(prefix) ? id.slice(prefix.length) : "";
    if (counted.test(n)) highest = Math.max(highest, Number(n));
  }
  const idOf = (n: number) => `${prefix}${String(n).padStart(width, "0")}`;
  let n = highest + 1;
  while (ids.has(idOf(n))) n++;
  return idOf(n);
}
