// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { inEnglish } from "../../../langText";
import type { MigrationStep } from "../step";

/**
 * Deck series format 2 states the title and description as language-tagged
 * text, as deck format 4 does: the untagged ones become English.
 */
export const LIBRARY_DECK_SERIES_1_TO_2: MigrationStep<"libraryDeckSeries", 1, 2> = {
  shape: "libraryDeckSeries",
  from: 1,
  to: 2,
  up: ({ title, description, ...data }) => ({
    ...data,
    title: inEnglish(title),
    description: inEnglish(description),
  }),
};
