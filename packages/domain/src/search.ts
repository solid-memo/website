// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { arabicFolded } from "./langText";

/**
 * Text search as the app does it: case-insensitively, and whatever the
 * Unicode form the text is in. Both sides are compared composed (NFC),
 * so a query pasted decomposed (NFD), as macOS file names and some PDFs
 * hold text — "사람" as five jamo, "é" as "e" and a combining accent —
 * finds the same text written composed, and the other way round. Arabic
 * is compared without the marks its writers mostly leave out (arabicFolded),
 * so "كتاب" finds "كِتَاب".
 */

/** The form of `text` a search compares: composed (NFC), Arabic folded, in lower case. */
export function searchForm(text: string): string {
  return arabicFolded(text.normalize("NFC")).toLocaleLowerCase();
}

/**
 * Whether any of `texts` contains `query`, by searchForm; a query of
 * nothing but spaces matches everything.
 */
export function matchesQuery(texts: readonly string[], query: string): boolean {
  const needle = searchForm(query.trim());
  return needle === "" || texts.some((text) => searchForm(text).includes(needle));
}
