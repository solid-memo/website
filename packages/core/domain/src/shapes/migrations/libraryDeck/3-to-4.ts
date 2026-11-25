// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { descriptionInFormat4 } from "../../../dcat";
import { inEnglish } from "../../../langText";
import type { MigrationStep } from "../step";

/**
 * Deck format 4 in the library, as in a pod: a format-3 release's untagged
 * title and description become its English ones; the default description
 * in Swedish as well.
 */
export const LIBRARY_DECK_3_TO_4: MigrationStep<"libraryDeck", 3, 4> = {
  shape: "libraryDeck",
  from: 3,
  to: 4,
  up: ({ title, description, ...data }) => ({
    ...data,
    title: inEnglish(title),
    description: descriptionInFormat4(description, title),
  }),
};
