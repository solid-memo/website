// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { shiftStudyDay } from "./answer";
import { DEFAULT_DESIRED_RETENTION } from "./fsrs";
import { gradePrompt } from "./grading";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "./preferences";
import { preferencesFromRecord, preferencesToRecord } from "./preferencesRecord";
import { nextDueDate, studyDayOf } from "./scheduling";

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

  it("read a day boundary that is not an hour of the day, 0 to 23, as the default", () => {
    const read = (dayBoundaryHour: number) =>
      preferencesFromRecord({ ...preferencesToRecord(DEFAULT_PREFERENCES), dayBoundaryHour })
        .dayBoundaryHour;
    expect([2.5e9, -2.5e9, -1, 24, 99_999_999, 3.5, Number.NaN].map(read)).toEqual(
      Array(7).fill(DEFAULT_PREFERENCES.dayBoundaryHour),
    );
    expect([0, 23, 6].map(read)).toEqual([0, 23, 6]);
  });

  it("read a negative or fractional daily limit as the default", () => {
    const read = (count: number) =>
      preferencesFromRecord({
        ...preferencesToRecord(DEFAULT_PREFERENCES),
        newCardsPerDay: count,
        maxReviewsPerDay: count,
      });
    for (const count of [-1, -2.5e9, 1.5, Number.NaN]) {
      expect(read(count)).toMatchObject({
        newCardsPerDay: DEFAULT_PREFERENCES.newCardsPerDay,
        maxReviewsPerDay: DEFAULT_PREFERENCES.maxReviewsPerDay,
      });
    }
    expect(read(0)).toMatchObject({ newCardsPerDay: 0, maxReviewsPerDay: 0 });
    expect(read(9999)).toMatchObject({ newCardsPerDay: 9999, maxReviewsPerDay: 9999 });
  });

  it("study today and save answers on a calendar day with a day boundary of 2.5e9 stored", () => {
    const stored = preferencesFromRecord({
      ...preferencesToRecord(DEFAULT_PREFERENCES),
      dayBoundaryHour: 2_500_000_000,
    });
    const now = new Date(2026, 9, 30, 12, 0);
    const today = studyDayOf(now, stored.dayBoundaryHour);
    expect(today).toBe("2026-10-30");
    expect(shiftStudyDay(today, -1)).toBe("2026-10-29");
    expect(nextDueDate(now, 1, stored.dayBoundaryHour)).toBe("2026-10-31");
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
