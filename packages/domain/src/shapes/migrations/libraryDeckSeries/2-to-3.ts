// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { untaggedKeywords } from "../../../keywords";
import type { MigrationStep } from "../step";

/**
 * Deck series format 3 states keywords per language, as library deck
 * format 5 does: format 2's untagged ones stay untagged (""), their
 * language unknown.
 */
export const LIBRARY_DECK_SERIES_2_TO_3: MigrationStep<"libraryDeckSeries", 2, 3> = {
  shape: "libraryDeckSeries",
  from: 2,
  to: 3,
  up: ({ keyword, ...data }) => ({ ...data, keyword: untaggedKeywords(keyword) }),
};
