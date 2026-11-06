// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Authors whose agent URLs (agentUrlOf) are longer than the 16,383
 * characters V8 hashes all of, though each term is not, and all of one
 * length (pathKeys.ts).
 */

/** A deck subject that, with a name of 24 characters, makes such a URL. */
export const LONG_SUBJECT = `https://pod.example/${"p".repeat(16_340)}#d`;

/** So many names of `length` characters, each with an ending of its own and nothing the slug takes out. */
export function namesOf(count: number, length: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const ending = String(i)
      .padStart(6, "0")
      .replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]!);
    return `${"a".repeat(length - ending.length)}${ending}`;
  });
}

/** As many names as namesOf that, under an ordinary subject, make such a URL too. */
export function longNames(count: number): string[] {
  return namesOf(count, 16_370);
}

/** The two ways to such URLs: a deck's subject with short names, or an ordinary one with long names. */
export const LONG_AGENTS = [
  {
    variant: "a long subject",
    subject: LONG_SUBJECT,
    authors: (count: number) => namesOf(count, 24),
  },
  { variant: "long names", subject: "https://pod.example/a/catalog.ttl#d", authors: longNames },
];
