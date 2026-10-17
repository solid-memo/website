// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The key a course as the learner has it (UseCases.getCourse) is queried
 * under: Workspace reads it to resolve the course routes, and the
 * course's screens refresh it after what they write. It is a module of
 * its own so the screens import it without importing CourseContainer,
 * which imports them.
 */
export function courseKey(deckUrl: string): string[] {
  return ["course", deckUrl];
}
