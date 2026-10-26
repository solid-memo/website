// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_DESIRED_RETENTION } from "./fsrs";
import { gradePrompt } from "./grading";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "./preferences";
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

  it("read a desired retention outside 70% to 97% as the default", () => {
    const read = (desiredRetention: number) =>
      preferencesFromRecord({ ...preferencesToRecord(DEFAULT_PREFERENCES), desiredRetention })
        .desiredRetention;
    expect([-1, 2, 0.69, 0.98, Number.NaN, Number.POSITIVE_INFINITY].map(read)).toEqual(
      Array(6).fill(DEFAULT_DESIRED_RETENTION),
    );
    expect([0.7, 0.97, 0.85].map(read)).toEqual([0.7, 0.97, 0.85]);
  });

  it("grade under FSRS-6 to a real due day with a desired retention out of range", () => {
    const fsrs6: StudyPreferences = { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" };
    const stored = preferencesFromRecord({ ...preferencesToRecord(fsrs6), desiredRetention: 2 });
    const grade = (scheduling: StudyPreferences) =>
      gradePrompt(
        { cardId: "c", direction: "front-to-back" },
        { sm2: null, fsrs: null },
        { grade: 4 },
        new Date(2026, 8, 21, 12, 0),
        scheduling,
      ).fsrs?.due;
    expect(grade(stored)).toMatch(/^2026-\d{2}-\d{2}$/);
    expect(grade(stored)).toBe(grade(fsrs6));
  });
});
