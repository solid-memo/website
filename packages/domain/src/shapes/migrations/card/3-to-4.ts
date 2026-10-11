// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Card format 4 lets a side's text be language-tagged. A format-3 side's
 * text is untagged, its language unknown, and stays so: it moves under
 * the empty tag ("") and is written back as it was.
 */
export const CARD_3_TO_4: MigrationStep<"card", 3, 4> = {
  shape: "card",
  from: 3,
  to: 4,
  up: ({ front, back, ...rest }) => ({
    ...rest,
    ...(front === undefined ? {} : { front: { "": front } }),
    ...(back === undefined ? {} : { back: { "": back } }),
  }),
};
