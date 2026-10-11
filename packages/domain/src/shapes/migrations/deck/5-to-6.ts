// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { untaggedKeywords } from "../../../keywords";
import type { MigrationStep } from "../step";

/**
 * Deck format 6 states keywords per language, several per language.
 * Format 5's keywords state none, so they stay untagged (""), their
 * language unknown: no language is guessed. Library deck 4→5 maps them
 * the same way, so a copy still compares equal to its release.
 */
export const DECK_5_TO_6: MigrationStep<"deck", 5, 6> = {
  shape: "deck",
  from: 5,
  to: 6,
  up: ({ keyword, ...data }) => ({ ...data, keyword: untaggedKeywords(keyword) }),
};
