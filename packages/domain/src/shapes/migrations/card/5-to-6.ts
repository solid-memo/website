// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Card format 6 lets the front have a label above it, as the back has.
 * A format-5 card has none, so every format-5 card is a format-6 card
 * already: nothing changes but the version the chain stamps.
 */
export const CARD_5_TO_6: MigrationStep<"card", 5, 6> = {
  shape: "card",
  from: 5,
  to: 6,
  up: (data) => data,
};
