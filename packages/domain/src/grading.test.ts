// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fsrsReview } from "./fsrs";
import { gradePrompt, type Scheduling } from "./grading";
import type { FsrsState, ReviewState } from "./review";

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
