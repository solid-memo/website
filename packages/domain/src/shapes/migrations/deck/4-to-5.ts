// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Deck format 5 lets a title and description be in any language, English
 * no longer required. Every format-4 deck is a format-5 deck already, so
 * nothing changes but the version the chain stamps: no language is
 * guessed, and text tagged English stays so.
 */
export const DECK_4_TO_5: MigrationStep<"deck", 4, 5> = {
  shape: "deck",
  from: 4,
  to: 5,
  up: (data) => ({ ...data }),
};
