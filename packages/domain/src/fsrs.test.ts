// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIRED_RETENTION,
  effectiveStates,
  fsrsInterval,
  fsrsReview,
  fuzzedInterval,
  fuzzFactor,
  isFresh,
  memoryFromSm2,
  nextMemory,
  ratingOfGrade,
  recallNow,
  retrievability,
  usableDesiredRetention,
  type FsrsMemory,
  type FsrsRating,
} from "./fsrs";
import type { FsrsState, ReviewQuality, ReviewState } from "./review";
import { nextDueDate } from "./scheduling";
import { INITIAL_SM2_STATE, MAX_EASE_FACTOR, MAX_INTERVAL_DAYS } from "./sm2";
import type { StudyDirection } from "./deck";

/** docs/srs.md, whose FSRS-6 worked examples these tests check. */
const SRS_DOC = resolve(import.meta.dirname, "../../../docs/srs.md");

/**
 * Whether `actual` is within 0.0001 of `expected`, relative to it when
 * it is above 1: the official vectors are computed in 32-bit floating
 * point, so a large value differs from ours in its later digits.
 */
function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-4 * Math.max(1, Math.abs(expected));
}

function expectNear(actual: number, expected: number): void {
  expect(near(actual, expected), `${actual} is near ${expected}`).toBe(true);
}

/** That `actual` is within 0.0001 of `expected`: the table's values are rounded to 4 decimals. */
function expectWithin(actual: number, expected: number): void {
  expect(
    Math.abs(actual - expected),
    `${actual} is within 0.0001 of ${expected}`,
  ).toBeLessThanOrEqual(1e-4);
}

/** What a "Before" cell says: a new prompt, a memory, or an SM-2 state to estimate one from. */
type Before =
  | { kind: "new" }
  | { kind: "memory"; memory: FsrsMemory }
  | { kind: "sm2"; easeFactor: number; intervalDays: number };

function numbersOf(cell: string): number[] {
  return cell.split(",").map((field) => Number(field.trim()));
}

function beforeOf(cell: string): Before {
  const text = cell.trim();
  if (text === "(new)") return { kind: "new" };
  if (text.startsWith("SM-2:")) {
    const [easeFactor, intervalDays] = numbersOf(text.slice("SM-2:".length));
    return { kind: "sm2", easeFactor: easeFactor!, intervalDays: intervalDays! };
  }
  const [stability, difficulty] = numbersOf(text);
  return { kind: "memory", memory: { stability: stability!, difficulty: difficulty! } };
}

/** The lines of the "FSRS-6 worked examples" table in docs/srs.md, header and separator included. */
function workedExampleLines(): string[] {
  const section = readFileSync(SRS_DOC, "utf8").split("### FSRS-6 worked examples\n")[1]!;
  return section
    .split(/^#/m)[0]!
    .split("\n")
    .filter((line) => line.startsWith("|"));
}

interface WorkedExample {
  before: Before;
  rating: FsrsRating;
  days: number;
  after: FsrsMemory;
  interval: number;
}

/** The table's rows: read from the page, so a change to the formulas or the table that leaves the two apart fails. */
function workedExamples(): WorkedExample[] {
  return workedExampleLines()
    .slice(2)
    .map((line) => {
      const [before, rating, days, after, interval] = line.split("|").slice(1, 6);
      const [stability, difficulty] = numbersOf(after!);
      return {
        before: beforeOf(before!),
        rating: Number.parseInt(rating!.trim(), 10) as FsrsRating,
        days: Number(days!.trim()),
        after: { stability: stability!, difficulty: difficulty! },
        interval: Number(interval!.trim()),
      };
    });
}

function memoryBefore(before: Before): FsrsMemory | null {
  if (before.kind === "new") return null;
  if (before.kind === "sm2") return memoryFromSm2(before);
  return before.memory;
}

/** The FSRS-6 forgetting curve's factor, for the days at which recall falls to a chance. */
const FACTOR = 0.9 ** (-1 / 0.1542) - 1;

/** The days after which a memory of `stability` days is recalled with chance `r`. */
function daysAt(stability: number, r: number): number {
  return (stability / FACTOR) * (r ** (-1 / 0.1542) - 1);
}

/** A memory stepped through the ratings, each `days` after the one before. */
function replay(answers: readonly [FsrsRating, number][]): FsrsMemory {
  let memory: FsrsMemory | null = null;
  for (const [rating, days] of answers) memory = nextMemory(memory, rating, days);
  return memory!;
}

describe("docs/srs.md's FSRS-6 worked examples", () => {
  it("are a table whose every row reads as a memory, a rating, days, a memory and an interval", () => {
    expect(workedExampleLines()[0]).toBe(
      "| Before: stability, difficulty | Rating | Days | After: stability, difficulty | Interval | Why |",
    );
    const rows = workedExamples();
    expect(rows.length).toBeGreaterThan(0);
    for (const { before, rating, days, after, interval } of rows) {
      const memory = memoryBefore(before);
      expect(
        [rating, days, after.stability, after.difficulty, interval].every(Number.isFinite),
      ).toBe(true);
      if (memory !== null) {
        expect([memory.stability, memory.difficulty].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it.each(workedExamples())("gives the worked example's memory after %o", (example) => {
    const next = nextMemory(memoryBefore(example.before), example.rating, example.days);
    expectWithin(next.stability, example.after.stability);
    expectWithin(next.difficulty, example.after.difficulty);
    expect(fsrsInterval(next.stability, DEFAULT_DESIRED_RETENTION)).toBe(example.interval);
  });
});

describe("retrievability", () => {
  it("follows the forgetting curve of the official vectors", () => {
    const vectors: [number, number, number][] = [
      [0, 1, 1],
      [1, 2, 0.9403443],
      [2, 3, 0.9253786],
      [3, 4, 0.9185229],
      [4, 4, 0.9],
      [5, 2, 0.8261359],
    ];
    for (const [days, stability, r] of vectors) expectNear(retrievability(days, stability), r);
  });

  it("is 90% after as many days as the stability", () => {
    expect(retrievability(37, 37)).toBeCloseTo(0.9, 12);
  });
});

describe("recallNow", () => {
  // Instants in local time, as study days are.
  const state = { stability: 4, lastReviewedAt: new Date(2026, 9, 5, 10).toISOString() };

  it("counts the whole study days since the last review", () => {
    expectNear(recallNow(state, new Date(2026, 9, 9, 9), 4), 0.9);
    // Before the day boundary (04:00) it is still the 8th.
    expectNear(recallNow(state, new Date(2026, 9, 9, 3), 4), retrievability(3, 4));
  });

  it("is certain the same study day, and when the last review is later than now", () => {
    expect(recallNow(state, new Date(2026, 9, 5, 20), 4)).toBe(1);
    expect(recallNow(state, new Date(2026, 9, 1, 12), 4)).toBe(1);
  });
});

describe("fsrsInterval", () => {
  it("gives the official intervals of a memory of 1 day at each desired retention", () => {
    const intervals = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((r) => fsrsInterval(1, r));
    expect(intervals).toEqual([34793, 2508, 387, 90, 27, 9, 3, 1, 1]);
  });

  it("is the stability, rounded, at 90%", () => {
    expect(fsrsInterval(121.01552, 0.9)).toBe(121);
    expect(fsrsInterval(162.5001, 0.9)).toBe(163);
  });

  it("is never under 1 day nor over 36,500", () => {
    expect(fsrsInterval(0.212, 0.9)).toBe(1);
    expect(fsrsInterval(1, 0.1)).toBe(36_500);
  });

  it("grows as the desired retention falls", () => {
    let memory = nextMemory(null, 3, 0);
    const at = (r: number) => fsrsInterval(memory.stability, r);
    expect([at(0.8), at(0.9), at(0.95)]).toEqual([8, 2, 1]);
    memory = nextMemory(memory, 3, 8);
    expect(at(0.8)).toBe(75);
  });
});

describe("usableDesiredRetention", () => {
  it("keeps a desired retention from 70% to 97%", () => {
    expect([0.7, 0.85, 0.9, 0.97].map(usableDesiredRetention)).toEqual([0.7, 0.85, 0.9, 0.97]);
  });

  it("is the default for one outside that range or no number at all", () => {
    const outside = [-1, 0, 0.69, 0.98, 1, 2, Number.NaN, Number.POSITIVE_INFINITY];
    expect(outside.map(usableDesiredRetention)).toEqual(
      outside.map(() => DEFAULT_DESIRED_RETENTION),
    );
  });
});

describe("nextMemory", () => {
  it("starts from the rating alone on a first review", () => {
    expect([1, 2, 3, 4].map((rating) => nextMemory(null, rating as FsrsRating, 5))).toEqual([
      { stability: 0.212, difficulty: 6.4133 },
      { stability: 1.2931, difficulty: expect.closeTo(5.1121707, 6) },
      { stability: 2.3065, difficulty: expect.closeTo(2.118104, 6) },
      { stability: 8.2956, difficulty: 1 },
    ]);
  });

  it("replays the official review history to its memory", () => {
    const memory = replay([
      [1, 0],
      [3, 0],
      [3, 1],
      [3, 3],
      [3, 8],
      [3, 21],
    ]);
    expectNear(memory.stability, 53.62691);
    expectNear(memory.difficulty, 6.3574867);
  });

  it("gives the official intervals of six Good answers, the second the same day", () => {
    const intervals: number[] = [];
    let memory: FsrsMemory | null = null;
    for (const days of [0, 0, 2, 11, 46, 163]) {
      memory = nextMemory(memory, 3, days);
      intervals.push(fsrsInterval(memory.stability, 0.9));
    }
    expect(intervals).toEqual([2, 2, 11, 46, 163, 498]);
    expectNear(memory!.stability, 497.876555);
  });

  it("steps the difficulty by the rating, reverted a little toward Easy's", () => {
    const after = [1, 2, 3, 4].map(
      (rating) => nextMemory({ stability: 5, difficulty: 5 }, rating as FsrsRating, 5).difficulty,
    );
    [8.341763, 6.6659956, 4.990228, 3.3144615].forEach((d, i) => expectNear(after[i]!, d));
  });

  it("keeps the difficulty from 1 to 10", () => {
    expect(nextMemory({ stability: 5, difficulty: 1 }, 4, 5).difficulty).toBe(1);
    expect(nextMemory({ stability: 5, difficulty: 10 }, 1, 5).difficulty).toBeLessThan(10);
  });

  it("reads a difficulty above 10 as 10", () => {
    for (const rating of [1, 3] as const) {
      const from12 = nextMemory({ stability: 5, difficulty: 12 }, rating, 5);
      expect(from12).toEqual(nextMemory({ stability: 5, difficulty: 10 }, rating, 5));
    }
    expect(nextMemory({ stability: 5, difficulty: 12 }, 3, 5).stability).toBeGreaterThan(5);
  });

  it("gives the official stability after a recall", () => {
    const vectors: [FsrsRating, number, number][] = [
      [2, 0.8, 28.226582],
      [3, 0.7, 58.656002],
      [4, 0.6, 127.226685],
    ];
    for (const [rating, r, stability] of vectors) {
      const next = nextMemory({ stability: 5, difficulty: rating }, rating, daysAt(5, r));
      expectNear(next.stability, stability);
    }
  });

  it("gives the official stability after a lapse", () => {
    const vectors: [number, number, number][] = [
      [1, 0.9, 1.0525396],
      [2, 0.8, 1.1894329],
      [3, 0.7, 1.3680838],
      [4, 0.6, 1.584989],
    ];
    for (const [difficulty, r, stability] of vectors) {
      const next = nextMemory({ stability: 5, difficulty }, 1, daysAt(5, r));
      expectNear(next.stability, stability);
    }
  });

  it("never lets a lapse raise the stability", () => {
    const next = nextMemory({ stability: 0.05, difficulty: 1 }, 1, 30);
    expect(next.stability).toBeCloseTo(0.05 / Math.exp(0.5425 * 0.0912), 12);
  });

  it("takes the same-day formula on the official vectors, never lowering the stability unless Again", () => {
    const after = [1, 2, 3, 4].map(
      (rating) => nextMemory({ stability: 5, difficulty: 5 }, rating as FsrsRating, 0).stability,
    );
    [1.596818, 5, 5, 8.12961].forEach((s, i) => expectNear(after[i]!, s));
  });

  it("keeps the stability from 0.001 to 36,500", () => {
    expect(nextMemory({ stability: 0.0001, difficulty: 5 }, 3, 0).stability).toBe(
      nextMemory({ stability: 0.001, difficulty: 5 }, 3, 0).stability,
    );
    expect(nextMemory({ stability: 30_000, difficulty: 1 }, 4, 30_000).stability).toBe(36_500);
  });
});

describe("memoryFromSm2", () => {
  it("gives the official estimates", () => {
    const estimate = memoryFromSm2({ easeFactor: 2.5, intervalDays: 10 });
    expect(estimate.stability).toBe(10);
    expectNear(estimate.difficulty, 6.9140563);
    expect(memoryFromSm2({ easeFactor: 1.3, intervalDays: 20 })).toEqual({
      stability: 20,
      difficulty: 10,
    });
  });

  it("multiplies the stability by the ease on a Good review on the due day", () => {
    for (const [easeFactor, intervalDays] of [
      [2.5, 10],
      [2, 15],
      [2.36, 6],
    ] as const) {
      const next = nextMemory(memoryFromSm2({ easeFactor, intervalDays }), 3, intervalDays);
      expectNear(next.stability / intervalDays, easeFactor);
    }
  });

  it("keeps the stability above 0 and the difficulty to 1–10", () => {
    expect(memoryFromSm2({ easeFactor: 2.5, intervalDays: 0 })).toEqual({
      stability: 0.001,
      difficulty: 10,
    });
    expect(memoryFromSm2({ easeFactor: 5, intervalDays: 10 }).difficulty).toBe(1);
  });

  it("estimates from the SM-2 state as applySm2 bounds it", () => {
    expect(memoryFromSm2({ easeFactor: 1e20, intervalDays: 1e9 })).toEqual(
      memoryFromSm2({ easeFactor: MAX_EASE_FACTOR, intervalDays: MAX_INTERVAL_DAYS }),
    );
    expect(memoryFromSm2({ easeFactor: Number.NaN, intervalDays: 10 })).toEqual(
      memoryFromSm2(INITIAL_SM2_STATE),
    );
  });
});

describe("ratingOfGrade", () => {
  it("rates a grade by its button: 0 to 2 Again, 3 Hard, 4 Good, 5 Easy", () => {
    expect(([0, 1, 2, 3, 4, 5] as ReviewQuality[]).map(ratingOfGrade)).toEqual([1, 1, 1, 2, 3, 4]);
  });
});

const BOUNDARY = 4;
const yesterday = new Date(2026, 8, 20, 12, 0);
const now = new Date(2026, 8, 21, 12, 0);
const tenDaysAgo = new Date(2026, 8, 11, 12, 0);

function sm2State(
  cardId: string,
  lastReviewedAt: Date,
  fields: Partial<ReviewState> = {},
  direction: StudyDirection = "front-to-back",
): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays: 10,
    repetitions: 3,
    due: "2026-09-21",
    firstReviewedAt: new Date(2026, 7, 1, 12, 0).toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
    ...fields,
  };
}

function fsrsState(
  cardId: string,
  lastReviewedAt: Date,
  fields: Partial<FsrsState> = {},
  direction: StudyDirection = "front-to-back",
): FsrsState {
  return {
    cardId,
    direction,
    stability: 12,
    difficulty: 5,
    due: "2026-10-03",
    firstReviewedAt: new Date(2026, 7, 1, 12, 0).toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 1,
    ...fields,
  };
}

describe("isFresh", () => {
  it("holds while the SM-2 state has the same last review, however it is written", () => {
    const sm2 = sm2State("c", tenDaysAgo, { lastReviewedAt: "2026-09-11T10:00:00Z" });
    expect(
      isFresh(fsrsState("c", tenDaysAgo, { lastReviewedAt: "2026-09-11T10:00:00.000Z" }), sm2),
    ).toBe(true);
    expect(
      isFresh(fsrsState("c", tenDaysAgo, { lastReviewedAt: "2026-09-11T10:00:01Z" }), sm2),
    ).toBe(false);
  });
});

describe("effectiveStates", () => {
  const sm2 = [
    sm2State("fresh", tenDaysAgo),
    sm2State("stale", yesterday),
    sm2State("alone", tenDaysAgo),
    sm2State("fresh", tenDaysAgo, {}, "back-to-front"),
  ];
  const fsrs = [
    fsrsState("fresh", tenDaysAgo),
    fsrsState("stale", tenDaysAgo),
    fsrsState("orphan", tenDaysAgo),
  ];

  it("are the SM-2 states under SM-2", () => {
    expect(effectiveStates(sm2, fsrs, "sm2", BOUNDARY)).toEqual(sm2);
  });

  it("take a fresh FSRS-6 state's due day and interval under FSRS-6, else the SM-2 state's", () => {
    expect(effectiveStates(sm2, fsrs, "fsrs6", BOUNDARY)).toEqual([
      {
        cardId: "fresh",
        direction: "front-to-back",
        due: "2026-10-03",
        intervalDays: 22,
        firstReviewedAt: sm2[0]!.firstReviewedAt,
        lastReviewedAt: sm2[0]!.lastReviewedAt,
      },
      sm2[1],
      sm2[2],
      sm2[3],
    ]);
  });

  it("give an interval of 0 when the due day was set before the last review", () => {
    const [state] = effectiveStates(
      [sm2State("c", tenDaysAgo)],
      [fsrsState("c", tenDaysAgo, { due: "2026-09-05" })],
      "fsrs6",
      BOUNDARY,
    );
    expect(state).toMatchObject({ due: "2026-09-05", intervalDays: 0 });
  });
});

describe("fuzzedInterval", () => {
  /** The fewest and most days `days` fuzzes to, and the middle one. */
  const bounds = (days: number) => [0, 0.5, 1 - 2 ** -32].map((f) => fuzzedInterval(days, f));

  it("leaves an interval shorter than 2.5 days as it is", () => {
    expect(bounds(1)).toEqual([1, 1, 1]);
    expect(bounds(2)).toEqual([2, 2, 2]);
    expect(bounds(2.49)).toEqual([2.49, 2.49, 2.49]);
  });

  it("moves an interval by 1 day, plus 0.15, 0.10 and 0.05 a day past 2.5, 7 and 20", () => {
    expect(bounds(2.5)).toEqual([2, 3, 4]);
    expect(bounds(3)).toEqual([2, 3, 4]);
    expect(bounds(7)).toEqual([5, 7, 9]);
    expect(bounds(17)).toEqual([14, 17, 20]);
    expect(bounds(20)).toEqual([17, 20, 23]);
    expect(bounds(37)).toEqual([33, 37, 41]);
    expect(bounds(100)).toEqual([93, 100, 107]);
  });

  it("keeps a fuzzed interval to 36,500 days", () => {
    expect(bounds(MAX_INTERVAL_DAYS)).toEqual([34_673, 35_587, MAX_INTERVAL_DAYS]);
    expect(bounds(40_000)).toEqual([MAX_INTERVAL_DAYS, MAX_INTERVAL_DAYS, MAX_INTERVAL_DAYS]);
  });

  it("makes each day of the range as likely, for factors spread evenly", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const days = fuzzedInterval(7, i / 1000);
      counts.set(days, (counts.get(days) ?? 0) + 1);
    }
    expect([...counts]).toEqual([
      [5, 200],
      [6, 200],
      [7, 200],
      [8, 200],
      [9, 200],
    ]);
  });

  it("never gives a longer interval a shorter fuzzed one, for one factor", () => {
    for (const factor of [0, 0.1, 0.33, 0.5, 0.77, 0.999]) {
      for (let days = 1; days < 400; days++) {
        expect(fuzzedInterval(days + 1, factor)).toBeGreaterThanOrEqual(
          fuzzedInterval(days, factor),
        );
      }
    }
  });
});

describe("fuzzFactor", () => {
  const key = { cardId: "c", direction: "front-to-back" } as const;
  const last = "2026-09-11T10:00:00.000Z";

  it("draws a factor from the prompt and its last review, the same each time", () => {
    expect(fuzzFactor(key, last)).toBeCloseTo(0.399214, 6);
    expect(fuzzFactor(key, last)).toBe(fuzzFactor({ ...key }, last));
    expect(fuzzFactor({ ...key, direction: "back-to-front" }, last)).toBeCloseTo(0.668236, 6);
    expect(fuzzFactor({ ...key, cardId: "d" }, last)).toBeCloseTo(0.426294, 6);
    expect(fuzzFactor(key, "2026-09-12T10:00:00.000Z")).toBeCloseTo(0.034596, 6);
    expect(fuzzFactor(key, null)).toBeCloseTo(0.96975, 5);
  });

  it("fuzzes docs/srs.md's example, 34 days, to 33", () => {
    expect(fuzzedInterval(34, fuzzFactor(key, last))).toBe(33);
  });

  it("reads the last review as an instant, however it is written", () => {
    expect(fuzzFactor(key, "2026-09-11T12:00:00+02:00")).toBe(fuzzFactor(key, last));
  });

  it("spreads factors from 0 up to 1 evenly over prompts and reviews", () => {
    const tenths = Array.from({ length: 10 }, () => 0);
    for (let i = 0; i < 10_000; i++) {
      const at = new Date(Date.parse(last) + i * 1000).toISOString();
      const factor = fuzzFactor({ cardId: `card-${i % 100}`, direction: "front-to-back" }, at);
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThan(1);
      tenths[Math.floor(factor * 10)]!++;
    }
    for (const count of tenths) {
      expect(count).toBeGreaterThan(900);
      expect(count).toBeLessThan(1100);
    }
  });
});

describe("fsrsReview", () => {
  const key = { cardId: "c", direction: "front-to-back" } as const;

  it("starts a new prompt's memory from the rating", () => {
    const state = fsrsReview(key, { sm2: null, fsrs: null }, 3, now, 0.9, BOUNDARY);
    expect(state).toEqual({
      ...key,
      stability: 2.3065,
      difficulty: expect.closeTo(2.118104, 6),
      due: "2026-09-23",
      firstReviewedAt: now.toISOString(),
      lastReviewedAt: now.toISOString(),
      formatVersion: 1,
    });
  });

  it("ignores an FSRS-6 state without an SM-2 state", () => {
    const orphan = fsrsState("c", yesterday);
    expect(fsrsReview(key, { sm2: null, fsrs: orphan }, 3, now, 0.9, BOUNDARY)).toEqual(
      fsrsReview(key, { sm2: null, fsrs: null }, 3, now, 0.9, BOUNDARY),
    );
  });

  it("builds on a fresh state, the study days since its last review elapsed, and snapshots it", () => {
    const fresh = fsrsState("c", tenDaysAgo);
    const state = fsrsReview(
      key,
      { sm2: sm2State("c", tenDaysAgo), fsrs: fresh },
      3,
      now,
      0.9,
      BOUNDARY,
    );
    const memory = nextMemory(fresh, 3, 10);
    expect(fsrsInterval(memory.stability, 0.9)).toBe(34);
    const fuzzed = fuzzedInterval(34, fuzzFactor(key, tenDaysAgo.toISOString()));
    expect(state).toEqual({
      ...key,
      stability: memory.stability,
      difficulty: memory.difficulty,
      due: nextDueDate(now, fuzzed, BOUNDARY),
      firstReviewedAt: sm2State("c", tenDaysAgo).firstReviewedAt,
      lastReviewedAt: now.toISOString(),
      formatVersion: 1,
      previous: {
        stability: 12,
        difficulty: 5,
        due: "2026-10-03",
        lastReviewedAt: tenDaysAgo.toISOString(),
      },
    });
    // 34 days fuzzes to 30 to 38.
    expect(fuzzed).toBeGreaterThanOrEqual(30);
    expect(fuzzed).toBeLessThanOrEqual(38);
  });

  it("aims the due day at the desired retention", () => {
    const current = { sm2: sm2State("c", tenDaysAgo), fsrs: fsrsState("c", tenDaysAgo) };
    const dues = [0.8, 0.9, 0.95].map((r) => fsrsReview(key, current, 3, now, r, BOUNDARY).due);
    const factor = fuzzFactor(key, tenDaysAgo.toISOString());
    expect(dues[1]).toBe(nextDueDate(now, fuzzedInterval(34, factor), BOUNDARY));
    expect(dues[0]! > dues[1]! && dues[1]! > dues[2]!).toBe(true);
  });

  it("takes the same-day formula on a second review the day, keeping the day's snapshot", () => {
    const morning = new Date(2026, 8, 21, 9, 0);
    const snapshot = {
      stability: 12,
      difficulty: 5,
      due: "2026-09-21",
      lastReviewedAt: tenDaysAgo.toISOString(),
    };
    const fresh = fsrsState("c", morning, { stability: 1.5, difficulty: 7, previous: snapshot });
    const state = fsrsReview(
      key,
      { sm2: sm2State("c", morning), fsrs: fresh },
      3,
      now,
      0.9,
      BOUNDARY,
    );
    expect(state.stability).toBe(nextMemory(fresh, 3, 0).stability);
    expect(state.previous).toEqual(snapshot);
  });

  it("keeps a fresh state's absent snapshot on a second review the day it was introduced", () => {
    const morning = new Date(2026, 8, 21, 9, 0);
    const fresh = fsrsState("c", morning);
    const state = fsrsReview(
      key,
      { sm2: sm2State("c", morning), fsrs: fresh },
      1,
      now,
      0.9,
      BOUNDARY,
    );
    expect(state).not.toHaveProperty("previous");
  });

  it("bounds the snapshot of a state from elsewhere, or drops it when it cannot be written back", () => {
    const sm2 = sm2State("c", tenDaysAgo);
    const review = (fsrs: FsrsState) => fsrsReview(key, { sm2, fsrs }, 3, now, 0.9, BOUNDARY);
    expect(review(fsrsState("c", tenDaysAgo, { stability: 0, difficulty: 50 })).previous).toEqual({
      stability: 0.001,
      difficulty: 10,
      due: "2026-10-03",
      lastReviewedAt: tenDaysAgo.toISOString(),
    });
    expect(review({ ...fsrsState("c", tenDaysAgo), due: "soon" })).not.toHaveProperty("previous");
    const morning = new Date(2026, 8, 21, 9, 0);
    const snapshot = { stability: -5, difficulty: 0, due: "2026-09-21", lastReviewedAt: "" };
    const sameDay = fsrsReview(
      key,
      { sm2: sm2State("c", morning), fsrs: fsrsState("c", morning, { previous: snapshot }) },
      3,
      now,
      0.9,
      BOUNDARY,
    );
    expect(sameDay.previous).toEqual({ ...snapshot, stability: 0.001, difficulty: 1 });
  });

  it("estimates from the SM-2 state when the FSRS-6 state is stale or missing, with no snapshot", () => {
    const sm2 = sm2State("c", tenDaysAgo, { easeFactor: 2.5, intervalDays: 10 });
    const stale = fsrsState("c", new Date(2026, 8, 1, 12, 0));
    const expected = nextMemory(memoryFromSm2(sm2), 3, 10);
    for (const fsrs of [stale, null]) {
      const state = fsrsReview(key, { sm2, fsrs }, 3, now, 0.9, BOUNDARY);
      expect(state.stability).toBe(expected.stability);
      expect(state.stability).toBeCloseTo(25, 9);
      expect(state.difficulty).toBe(expected.difficulty);
      expect(state.due).toBe(
        nextDueDate(now, fuzzedInterval(25, fuzzFactor(key, sm2.lastReviewedAt)), BOUNDARY),
      );
      expect(state).not.toHaveProperty("previous");
    }
  });

  it("fuzzes the interval by the prompt and its last review, not the time of day or the rating", () => {
    const sm2 = sm2State("c", tenDaysAgo);
    const current = { sm2, fsrs: fsrsState("c", tenDaysAgo) };
    const evening = new Date(2026, 8, 21, 22, 0);
    expect(fsrsReview(key, current, 3, evening, 0.9, BOUNDARY)).toMatchObject({
      due: fsrsReview(key, current, 3, now, 0.9, BOUNDARY).due,
    });
    const factor = fuzzFactor(key, sm2.lastReviewedAt);
    for (const rating of [2, 3, 4] as const) {
      const state = fsrsReview(key, current, rating, now, 0.9, BOUNDARY);
      const interval = fsrsInterval(state.stability, 0.9);
      expect(state.due).toBe(nextDueDate(now, fuzzedInterval(interval, factor), BOUNDARY));
    }
  });

  it("fuzzes a new prompt's interval by the prompt alone", () => {
    const state = fsrsReview(key, { sm2: null, fsrs: null }, 4, now, 0.9, BOUNDARY);
    expect(state.due).toBe(nextDueDate(now, fuzzedInterval(8, fuzzFactor(key, null)), BOUNDARY));
  });

  it("keeps Hard, Good and Easy in order after fuzz, for every prompt", () => {
    for (let i = 0; i < 200; i++) {
      const prompt = { cardId: `card-${i}`, direction: "front-to-back" } as const;
      const at = new Date(tenDaysAgo.getTime() + i * 60_000);
      const current = {
        sm2: sm2State(prompt.cardId, at, { intervalDays: 1 + (i % 40) }),
        fsrs: null,
      };
      const [hard, good, easy] = ([2, 3, 4] as const).map(
        (rating) => fsrsReview(prompt, current, rating, now, 0.9, BOUNDARY).due,
      );
      expect(hard! <= good! && good! <= easy!).toBe(true);
    }
  });

  it("counts study days by the day boundary, and none when the last review is after now", () => {
    const sm2 = sm2State("c", new Date(2026, 8, 21, 2, 0));
    const fresh = fsrsState("c", new Date(2026, 8, 21, 2, 0), { stability: 5, difficulty: 5 });
    // 02:00 belongs to the study day before, so 12:00 is one study day later.
    expect(fsrsReview(key, { sm2, fsrs: fresh }, 3, now, 0.9, BOUNDARY).stability).toBe(
      nextMemory(fresh, 3, 1).stability,
    );
    const later = sm2State("c", new Date(2026, 8, 22, 12, 0));
    const ahead = fsrsState("c", new Date(2026, 8, 22, 12, 0), { stability: 5, difficulty: 5 });
    expect(fsrsReview(key, { sm2: later, fsrs: ahead }, 3, now, 0.9, BOUNDARY).stability).toBe(
      nextMemory(ahead, 3, 0).stability,
    );
  });
});
