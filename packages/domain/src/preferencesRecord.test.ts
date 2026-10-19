// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { preferencesFromRecord, preferencesToRecord } from "./preferencesRecord";

describe("preferences records", () => {
  it("round-trip every field, the invalid data policy, the theme and the scheduler as concepts", () => {
    const preferences = {
      newCardsPerDay: 5,
      maxReviewsPerDay: 50,
      dayBoundaryHour: 0,
      answerScale: "minimal" as const,
      developerMode: true,
      invalidDataPolicy: "warn-only" as const,
      theme: "dark" as const,
      scheduler: "fsrs6" as const,
      desiredRetention: 0.85,
    };
    expect(preferencesToRecord(preferences)).toEqual({
      ...preferences,
      invalidDataPolicy: "https://solid-memo.com/ns/vocab/v1.ttl#warnOnly",
      theme: "https://solid-memo.com/ns/vocab/v1.ttl#darkTheme",
      scheduler: "https://solid-memo.com/ns/vocab/v1.ttl#fsrs6",
    });
    expect(preferencesFromRecord(preferencesToRecord(preferences))).toEqual(preferences);
  });
});
