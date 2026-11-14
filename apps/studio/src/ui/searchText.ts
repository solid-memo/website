// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { folded } from "@solid-memo/domain/langText";

/**
 * How much of a text the Studio's searches match, in UTF-16 code units: a
 * name or an address as long as a pod lets it be costs no more to search
 * than one this long.
 */
const MATCHED_LENGTH = 200;

/**
 * A text as the Studio's searches match it: its first MATCHED_LENGTH
 * code units, case and accents aside (folded). Worked out once for each
 * text, when the list searched changes, not for each letter typed.
 */
export function searchedText(text: string): string {
  return folded(text.slice(0, MATCHED_LENGTH));
}
