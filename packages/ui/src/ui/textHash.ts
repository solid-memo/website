// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** Where each page's hashes start, drawn once a page, so which texts share a hash can't be known ahead. */
const SEED = crypto.getRandomValues(new Uint32Array(1))[0]!;

/**
 * A number for a text, read from all of its characters (FNV-1a, from a
 * seed drawn once a page), for a cache to keep the text under: V8's Map
 * keyed by the text itself hashes a long string by its length alone, so
 * every lookup among long texts of one length would compare it with all
 * of them. Two texts may share a number: a cache keeps one text under
 * each and compares a text with it before using what it keeps. A text
 * whose number another text has replaces that entry; entries are not
 * chained, so texts made to share a number cost at most one uncached
 * pass each, which is linear in the text.
 */
export function textHash(text: string): number {
  let hash = SEED;
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}
