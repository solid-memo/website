// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fsrsInterval, fsrsReview, fuzzedInterval, fuzzFactor } from "./fsrs";
import { gradePrompt, previewIntervals, ratingOfAnswer, type Scheduling } from "./grading";
import type { FsrsState, ReviewState } from "./review";
import { studyDayOf } from "./scheduling";
import { daysBetween } from "./studyPatterns";

const key = { cardId: "c", direction: "front-to-back" } as const;
const yesterday = new Date(2026, 8, 20, 12, 0);
const now = new Date(2026, 8, 21, 12, 0);

const sm2: Scheduling = { scheduler: "sm2", desiredRetention: 0.9, dayBoundaryHour: 4 };
const fsrs6: Scheduling = { ...sm2, scheduler: "fsrs6" };

const before: ReviewState = {
  ...key,
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-09-20",
  firstReviewedAt: new Date(2026, 8, 1, 12, 0).toISOString(),
  lastReviewedAt: new Date(2026, 8, 14, 12, 0).toISOString(),
  formatVersion: 2,
};

const fresh: FsrsState = {
  ...key,
  stability: 7,
  difficulty: 4,
  due: "2026-09-21",
  firstReviewedAt: before.firstReviewedAt,
  lastReviewedAt: before.lastReviewedAt,
  formatVersion: 1,
};

describe("gradePrompt", () => {
  it("introduces a new prompt by SM-2", () => {
    expect(gradePrompt(key, { sm2: null, fsrs: null }, { grade: 4 }, now, sm2)).toEqual({
      sm2: {
        ...key,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-22",
        firstReviewedAt: now.toISOString(),
        lastReviewedAt: now.toISOString(),
        formatVersion: 2,
      },
    });
  });

  it("steps an SM-2 state, snapshotting it, and leaves the FSRS-6 state under SM-2", () => {
    const graded = gradePrompt(key, { sm2: before, fsrs: fresh }, { grade: 4 }, now, sm2);
    expect(graded).toEqual({
      sm2: {
        ...key,
        easeFactor: 2.5,
        intervalDays: 15,
        repetitions: 3,
        due: "2026-10-06",
        firstReviewedAt: before.firstReviewedAt,
        lastReviewedAt: now.toISOString(),
        formatVersion: 2,
        previous: {
          easeFactor: 2.5,
          intervalDays: 6,
          repetitions: 2,
          due: "2026-09-20",
          lastReviewedAt: before.lastReviewedAt,
        },
      },
    });
  });

  it("steps both states under FSRS-6, rating a recalled grade by its button", () => {
    const current = { sm2: before, fsrs: fresh };
    const graded = gradePrompt(key, current, { grade: 3, mode: "recall" }, now, fsrs6);
    expect(graded.sm2).toEqual(gradePrompt(key, current, { grade: 3 }, now, sm2).sm2);
    expect(graded.fsrs).toEqual(fsrsReview(key, current, 2, now, 0.9, 4));
  });

  it("rates a multiple-choice answer by whether it was right", () => {
    const current = { sm2: before, fsrs: fresh };
    const choice = (grade: 1 | 3) =>
      gradePrompt(key, current, { grade, mode: "multiple-choice" }, now, fsrs6).fsrs;
    expect(choice(3)).toEqual(fsrsReview(key, current, 3, now, 0.9, 4));
    expect(choice(1)).toEqual(fsrsReview(key, current, 1, now, 0.9, 4));
  });

  it("aims FSRS-6 at the desired retention", () => {
    const current = { sm2: { ...before, lastReviewedAt: yesterday.toISOString() }, fsrs: null };
    const graded = gradePrompt(key, current, { grade: 4 }, now, {
      ...fsrs6,
      desiredRetention: 0.8,
    });
    expect(graded.fsrs).toEqual(fsrsReview(key, current, 3, now, 0.8, 4));
  });
});

describe("ratingOfAnswer", () => {
  it("rates a multiple-choice answer by whether it was right, any other by its grade", () => {
    expect(ratingOfAnswer({ grade: 3, mode: "multiple-choice" })).toBe(3);
    expect(ratingOfAnswer({ grade: 1, mode: "multiple-choice" })).toBe(1);
    expect(ratingOfAnswer({ grade: 3, mode: "recall" })).toBe(2);
    expect(ratingOfAnswer({ grade: 5 })).toBe(4);
  });
});

describe("previewIntervals", () => {
  it("gives SM-2's interval of each grade under SM-2", () => {
    expect(previewIntervals(key, { sm2: before, fsrs: fresh }, now, sm2)).toEqual({
      0: 1,
      1: 1,
      2: 1,
      3: 14,
      4: 15,
      5: 16,
    });
    expect(previewIntervals(key, { sm2: null, fsrs: null }, now, sm2)[4]).toBe(1);
  });

  it("gives FSRS-6's fuzzed interval of each grade under FSRS-6, at the desired retention", () => {
    const current = { sm2: before, fsrs: fresh };
    const intervals = previewIntervals(key, current, now, fsrs6);
    const factor = fuzzFactor(key, before.lastReviewedAt);
    for (const grade of [0, 1, 2, 3, 4, 5] as const) {
      const graded = gradePrompt(key, current, { grade }, now, fsrs6).fsrs!;
      const interval = fsrsInterval(graded.stability, 0.9);
      expect(intervals[grade]).toBe(fuzzedInterval(interval, factor));
    }
    expect(intervals[1]).toBeLessThan(intervals[3]);
    expect(intervals[3]).toBeLessThan(intervals[4]);
    expect(intervals[4]).toBeLessThan(intervals[5]);
    // A lower retention waits longer.
    const lower = previewIntervals(key, current, now, { ...fsrs6, desiredRetention: 0.8 });
    expect(lower[4]).toBeGreaterThan(intervals[4]);
  });

  it("shows under FSRS-6 the study days to the due day each grade sets", () => {
    const today = studyDayOf(now, fsrs6.dayBoundaryHour);
    for (let i = 0; i < 100; i++) {
      const prompt = { cardId: `card-${i}`, direction: "front-to-back" } as const;
      const at = new Date(2026, 8, 1 + (i % 20), 12, i);
      const sm2State = {
        ...before,
        ...prompt,
        intervalDays: 1 + (i % 30),
        lastReviewedAt: at.toISOString(),
      };
      const current = { sm2: sm2State, fsrs: null };
      const intervals = previewIntervals(prompt, current, now, fsrs6);
      for (const grade of [0, 1, 2, 3, 4, 5] as const) {
        const graded = gradePrompt(prompt, current, { grade }, now, fsrs6).fsrs!;
        expect(intervals[grade]).toBe(daysBetween(today, graded.due));
      }
      expect(intervals[3] <= intervals[4] && intervals[4] <= intervals[5]).toBe(true);
    }
  });
});
