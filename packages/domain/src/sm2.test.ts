// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applySm2, INITIAL_SM2_STATE, MIN_EASE_FACTOR, type Sm2State } from "./sm2";
import type { ReviewQuality } from "./review";

/** docs/srs.md, whose worked examples these tests check. */
const SRS_DOC = resolve(import.meta.dirname, "../../../docs/srs.md");

/** "2.5, 0, 0 (new)" as a state. */
function stateOf(cell: string): Sm2State {
  const [easeFactor, intervalDays, repetitions] = cell
    .replace("(new)", "")
    .split(",")
    .map((field) => Number(field.trim()));
  return { easeFactor: easeFactor!, intervalDays: intervalDays!, repetitions: repetitions! };
}

/** The lines of the "Worked examples" table in docs/srs.md, header and separator included. */
function workedExampleLines(): string[] {
  const section = readFileSync(SRS_DOC, "utf8").split("### Worked examples\n")[1]!;
  return section
    .split(/^#/m)[0]!
    .split("\n")
    .filter((line) => line.startsWith("|"));
}

/**
 * The table's rows, each the state before an answer, its grade and the
 * state after: read from the page, so a change to the rules or to the
 * table that leaves the two apart fails.
 */
function workedExamples(): [Sm2State, ReviewQuality, Sm2State][] {
  return workedExampleLines()
    .slice(2)
    .map((line) => {
      const [before, grade, after] = line.split("|").slice(1, 4);
      return [stateOf(before!), Number(grade!.trim()) as ReviewQuality, stateOf(after!)];
    });
}

describe("docs/srs.md's worked examples", () => {
  it("are a table whose every row reads as a state, a grade and a state", () => {
    expect(workedExampleLines()[0]).toBe(
      "| Before: ease, interval, repetitions | Grade | After: ease, interval, repetitions | Why |",
    );
    const rows = workedExamples();
    expect(rows.length).toBeGreaterThan(0);
    for (const [before, grade, after] of rows) {
      expect(
        [...Object.values(before), grade, ...Object.values(after)].every(Number.isFinite),
      ).toBe(true);
    }
  });
});

describe("applySm2", () => {
  it.each(workedExamples())(
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
