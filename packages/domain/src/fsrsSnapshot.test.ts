// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  boundedFsrsMemory,
  boundedFsrsSnapshot,
  MIN_DIFFICULTY,
  MIN_STABILITY,
} from "./fsrsSnapshot";

describe("boundedFsrsSnapshot", () => {
  const snapshot = {
    stability: 3,
    difficulty: 5,
    due: "2026-09-21",
    lastReviewedAt: "2026-09-11T10:00:00.000Z",
  };

  it("keeps a snapshot within the bounds as it is", () => {
    expect(boundedFsrsSnapshot(snapshot)).toEqual(snapshot);
  });

  it("keeps the stability above 0 and at most 36,500 days, the difficulty from 1 to 10", () => {
    expect(boundedFsrsSnapshot({ ...snapshot, stability: 1e9, difficulty: -1 })).toEqual({
      ...snapshot,
      stability: 36_500,
      difficulty: 1,
    });
  });

  it("keeps an infinite number at the bound on its side", () => {
    expect(
      boundedFsrsSnapshot({
        ...snapshot,
        stability: Number.POSITIVE_INFINITY,
        difficulty: Number.NEGATIVE_INFINITY,
      }),
    ).toEqual({ ...snapshot, stability: 36_500, difficulty: 1 });
  });

  it("drops a snapshot whose due day is no real date", () => {
    expect(boundedFsrsSnapshot({ ...snapshot, due: "soon" })).toBeUndefined();
    expect(boundedFsrsSnapshot({ ...snapshot, due: "2026-02-30" })).toBeUndefined();
  });
});

describe("a snapshot read from a pod", () => {
  const snapshot = {
    stability: 2,
    difficulty: 5,
    due: "2026-11-10",
    lastReviewedAt: "2026-11-01T00:00:00.000Z",
  };

  it("takes the lower bound for a number that is no number", () => {
    expect(boundedFsrsMemory({ stability: Number.NaN, difficulty: Number.NaN })).toEqual({
      stability: MIN_STABILITY,
      difficulty: MIN_DIFFICULTY,
    });
  });

  it("is dropped when its last review cannot be written back", () => {
    expect(boundedFsrsSnapshot(snapshot)).toEqual(snapshot);
    expect(
      boundedFsrsSnapshot({ ...snapshot, lastReviewedAt: "+012000-01-01T00:00:00Z" }),
    ).toBeUndefined();
  });
});
