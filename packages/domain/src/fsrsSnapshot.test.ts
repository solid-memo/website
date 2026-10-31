// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { boundedFsrsSnapshot } from "./fsrsSnapshot";

describe("boundedFsrsSnapshot", () => {
  const snapshot = { stability: 3, difficulty: 5, due: "2026-09-21", lastReviewedAt: "x" };

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

  it("drops a snapshot with a number that is not finite, or a due day that is no real date", () => {
    expect(boundedFsrsSnapshot({ ...snapshot, stability: Number.NaN })).toBeUndefined();
    expect(
      boundedFsrsSnapshot({ ...snapshot, difficulty: Number.POSITIVE_INFINITY }),
    ).toBeUndefined();
    expect(boundedFsrsSnapshot({ ...snapshot, due: "soon" })).toBeUndefined();
    expect(boundedFsrsSnapshot({ ...snapshot, due: "2026-02-30" })).toBeUndefined();
  });
});
