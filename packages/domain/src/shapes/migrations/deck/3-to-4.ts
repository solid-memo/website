// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { descriptionInFormat4 } from "../../../dcat";
import { inEnglish } from "../../../langText";
import type { MigrationStep } from "../step";

/**
 * Deck format 4 states the title and description as language-tagged text,
 * one per language and one of them English. A format-3 deck's untagged
 * title and description become its English ones; the default description,
 * which the app wrote, is stated in Swedish as well.
 */
export const DECK_3_TO_4: MigrationStep<"deck", 3, 4> = {
  shape: "deck",
  from: 3,
  to: 4,
  up: ({ title, description, ...data }) => ({
    ...data,
    title: inEnglish(title),
    description: descriptionInFormat4(description, title),
  }),
};
