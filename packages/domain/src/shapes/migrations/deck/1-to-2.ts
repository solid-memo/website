// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Deck format 2 states the study direction. A format-1 deck was studied
 * front→back, the only way there was, so that is what it now says.
 */
export const DECK_1_TO_2: MigrationStep<"deck", 1, 2> = {
  shape: "deck",
  from: 1,
  to: 2,
  up: (data) => ({ ...data, direction: "front-to-back" }),
};
