// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** Fragment id of a subject URL, e.g. "deck-1" for ".../catalog.ttl#deck-1". */
export function fragmentIdOf(subjectUrl: string): string {
  return subjectUrl.slice(subjectUrl.indexOf("#") + 1);
}

/** Document URL of a subject URL (strips the fragment). */
export function documentUrlOf(subjectUrl: string): string {
  return subjectUrl.split("#")[0];
}
