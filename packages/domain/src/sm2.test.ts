import { describe, expect, it } from "vitest";
import { applySm2, INITIAL_SM2_STATE, MIN_EASE_FACTOR, type Sm2State } from "./sm2";
import type { ReviewQuality } from "./review";

/** The worked examples in docs/srs.md, row by row: before, grade, after. Keep the two the same. */
const WORKED_EXAMPLES: [Sm2State, ReviewQuality, Sm2State][] = [
  [
    { easeFactor: 2.5, intervalDays: 0, repetitions: 0 },
    5,
    { easeFactor: 2.6, intervalDays: 1, repetitions: 1 },
  ],
  [
    { easeFactor: 2.5, intervalDays: 0, repetitions: 0 },
    3,
    { easeFactor: 2.36, intervalDays: 1, repetitions: 1 },
  ],
  [
    { easeFactor: 2.6, intervalDays: 1, repetitions: 1 },
    5,
    { easeFactor: 2.7, intervalDays: 6, repetitions: 2 },
  ],
  [
    { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
    3,
    { easeFactor: 2.36, intervalDays: 14, repetitions: 3 },
  ],
  [
    { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
    4,
    { easeFactor: 2.5, intervalDays: 15, repetitions: 3 },
  ],
  [
    { easeFactor: 2.5, intervalDays: 6, repetitions: 2 },
    5,
    { easeFactor: 2.6, intervalDays: 16, repetitions: 3 },
  ],
  [
    { easeFactor: 2.0, intervalDays: 10, repetitions: 3 },
    3,
    { easeFactor: 1.86, intervalDays: 19, repetitions: 4 },
  ],
  [
    { easeFactor: 1.3, intervalDays: 10, repetitions: 3 },
    3,
    { easeFactor: 1.3, intervalDays: 13, repetitions: 4 },
  ],
  [
    { easeFactor: 2.2, intervalDays: 30, repetitions: 5 },
    2,
    { easeFactor: 2.2, intervalDays: 1, repetitions: 0 },
  ],
  [
    { easeFactor: 2.2, intervalDays: 30, repetitions: 5 },
    0,
    { easeFactor: 2.2, intervalDays: 1, repetitions: 0 },
  ],
];

describe("applySm2", () => {
  it.each(WORKED_EXAMPLES)(
    "gives the worked example's state after %o graded %i",
    (before, grade, after) => {
      const next = applySm2(before, grade);
      expect(next.easeFactor).toBeCloseTo(after.easeFactor);
      expect({ intervalDays: next.intervalDays, repetitions: next.repetitions }).toEqual({
        intervalDays: after.intervalDays,
        repetitions: after.repetitions,
      });
    },
  );

  describe("correct answers (quality >= 3)", () => {
    it("gives a 1-day interval on the first repetition", () => {
      const next = applySm2(INITIAL_SM2_STATE, 5);
      expect(next).toEqual({
        easeFactor: 2.6,
        intervalDays: 1,
        repetitions: 1,
      });
    });

    it("gives a 6-day interval on the second repetition", () => {
      const next = applySm2({ easeFactor: 2.6, intervalDays: 1, repetitions: 1 }, 5);
      expect(next.repetitions).toBe(2);
      expect(next.intervalDays).toBe(6);
    });

    it("grows the interval by the UPDATED ease factor from the third repetition", () => {
      const next = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 3);
      expect(next.easeFactor).toBeCloseTo(2.36);
      expect(next.intervalDays).toBe(14);
      expect(next.repetitions).toBe(3);
    });

    it("keeps the ease factor unchanged for quality 4", () => {
      const next = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 4);
      expect(next.easeFactor).toBeCloseTo(2.5);
    });

    it("raises the ease factor by 0.1 for quality 5", () => {
      const next = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 5);
      expect(next.easeFactor).toBeCloseTo(2.6);
    });

    it("lowers the ease factor by 0.14 for quality 3", () => {
      const next = applySm2({ easeFactor: 2.0, intervalDays: 10, repetitions: 3 }, 3);
      expect(next.easeFactor).toBeCloseTo(1.86);
    });

    it("never lets the ease factor drop below 1.3", () => {
      const next = applySm2({ easeFactor: MIN_EASE_FACTOR, intervalDays: 10, repetitions: 3 }, 3);
      expect(next.easeFactor).toBe(MIN_EASE_FACTOR);
    });
  });

  describe("lapses (quality < 3)", () => {
    it.each([0, 1, 2] as ReviewQuality[])(
      "quality %i resets repetitions and interval but keeps the ease factor",
      (quality) => {
        const next = applySm2({ easeFactor: 2.2, intervalDays: 30, repetitions: 5 }, quality);
        expect(next).toEqual({
          easeFactor: 2.2,
          intervalDays: 1,
          repetitions: 0,
        });
      },
    );
  });
});
