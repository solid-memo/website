// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Card format 7 lets a card name what it is about, `dcterms:subject`.
 * Card format 6 has no such field, so the step names nothing. A library
 * release compiled from linked data states the term on cards of older
 * formats all the same, so the pod's reader takes it from the card
 * itself once the chain has run (`readCard` in packages/solid).
 */
export const CARD_6_TO_7: MigrationStep<"card", 6, 7> = {
  shape: "card",
  from: 6,
  to: 7,
  up: (data) => ({ ...data, subject: [] }),
};
