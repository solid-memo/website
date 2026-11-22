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

/**
 * Whether a subject URL is a document's own (`<>`, no fragment) rather
 * than one of the subjects in it: what says whose the document is
 * (dcterms:isPartOf) is stated of it, so it is never read, or removed,
 * as a record such as a card, a distractor or a review state.
 */
export function isDocumentSubject(subjectUrl: string): boolean {
  return !subjectUrl.includes("#");
}

/**
 * Whether two URLs name subjects of the same document: their document
 * URLs (documentUrlOf) are one. A document's own URL, with no fragment,
 * names a subject of that document too.
 */
export function isSameDocument(url: string, other: string): boolean {
  return documentUrlOf(url) === documentUrlOf(other);
}
