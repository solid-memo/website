// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Card format 2 lets a side be a picture; a format-1 card has text on
 * both sides, which format 2 still allows, so nothing changes.
 */
export const CARD_1_TO_2: MigrationStep<"card", 1, 2> = {
  shape: "card",
  from: 1,
  to: 2,
  up: (data) => ({ ...data }),
};
