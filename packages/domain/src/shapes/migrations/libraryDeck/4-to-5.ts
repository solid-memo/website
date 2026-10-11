// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { untaggedKeywords } from "../../../keywords";
import type { MigrationStep } from "../step";

/**
 * Library deck format 5 states keywords per language, several per
 * language. A format-4 release's keywords state none, so they stay
 * untagged (""), their language unknown, as deck 5→6 keeps a copy's: no
 * language is guessed.
 */
export const LIBRARY_DECK_4_TO_5: MigrationStep<"libraryDeck", 4, 5> = {
  shape: "libraryDeck",
  from: 4,
  to: 5,
  up: ({ keyword, ...data }) => ({ ...data, keyword: untaggedKeywords(keyword) }),
};
