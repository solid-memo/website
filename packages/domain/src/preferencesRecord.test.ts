// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "./preferences";
import { preferencesFromRecord, preferencesToRecord } from "./preferencesRecord";

describe("preferences records", () => {
  it("round-trip every field, the invalid data policy, the theme, the scheduler and the text size as concepts", () => {
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
      schedulerInvitationDismissed: true,
      palette: "https://solid-memo.com/ns/vocab/v1.ttl#parchmentPalette",
      textSize: "larger" as const,
    };
    expect(preferencesToRecord(preferences)).toEqual({
      ...preferences,
      invalidDataPolicy: "https://solid-memo.com/ns/vocab/v1.ttl#warnOnly",
      theme: "https://solid-memo.com/ns/vocab/v1.ttl#darkTheme",
      scheduler: "https://solid-memo.com/ns/vocab/v1.ttl#fsrs6",
      textSize: "https://solid-memo.com/ns/vocab/v1.ttl#largerTextSize",
    });
    expect(preferencesFromRecord(preferencesToRecord(preferences))).toEqual(preferences);
  });

  it("keep a palette this version does not know as it is", () => {
    const record = preferencesToRecord({
      ...DEFAULT_PREFERENCES,
      palette: "https://pod.example/solid-memo/a/palettes.ttl#mine",
    });
    expect(record.palette).toBe("https://pod.example/solid-memo/a/palettes.ttl#mine");
    expect(preferencesFromRecord(record).palette).toBe(
      "https://pod.example/solid-memo/a/palettes.ttl#mine",
    );
  });
});
