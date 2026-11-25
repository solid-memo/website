// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

const SNAPSHOT_FIELDS = [
  "previousEaseFactor",
  "previousIntervalDays",
  "previousRepetitions",
  "previousDue",
  "previousLastReviewedAt",
] as const;

/**
 * Review-state format 2 has the fields format 1 had, but its previous*
 * snapshot is all five triples or none: a partial snapshot, which format
 * 1 admitted and readers always treated as absent, is dropped. The
 * version moved because the snapshot and the per-direction subject
 * naming became part of the contract, and because every state is now
 * stamped.
 */
export const REVIEW_STATE_1_TO_2: MigrationStep<"reviewState", 1, 2> = {
  shape: "reviewState",
  from: 1,
  to: 2,
  up: (data) => {
    if (SNAPSHOT_FIELDS.every((field) => data[field] !== undefined)) {
      return { ...data };
    }
    const {
      previousEaseFactor,
      previousIntervalDays,
      previousRepetitions,
      previousDue,
      previousLastReviewedAt,
      ...rest
    } = data;
    void [
      previousEaseFactor,
      previousIntervalDays,
      previousRepetitions,
      previousDue,
      previousLastReviewedAt,
    ];
    return rest;
  },
};
