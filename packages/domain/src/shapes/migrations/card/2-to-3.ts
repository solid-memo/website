// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Card format 3 lets a card be retired (owl:deprecated true): kept, with
 * its reviews, but no longer studied. A format-2 card is in use, which
 * format 3 says by leaving the flag out, so nothing changes.
 */
export const CARD_2_TO_3: MigrationStep<"card", 2, 3> = {
  shape: "card",
  from: 2,
  to: 3,
  up: (data) => ({ ...data }),
};
