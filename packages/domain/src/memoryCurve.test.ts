// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { chainIndexOf } from "./answerChain";
import {
  latenessBucketOf,
  latenessOf,
  memoryOverTime,
  recallByInterval,
  recallByLateness,
  timeToMatureOf,
  weeklyRetention,
} from "./memoryCurve";
import { growth } from "./testing/growth";

const DECK = "https://pod.example/i/catalog.ttl#deck-";
let n = 0;
/** An answer to card `card` of deck `deck` on `studyDay`, of prior interval `prior` (none: a first answer) and next `next`. */
function answer(
  studyDay: string,
  grade: Answer["grade"],
  prior: number | undefined,
  next: number,
  { deck = "1", card = "c", ...extra }: Partial<Answer> & { deck?: string; card?: string } = {},
): Answer {
  n += 1;
  return {
    id: `answer-${String(n).padStart(8, "0")}`,
    deckUrl: `${DECK}${deck}`,
    cardUrl: `https://pod.example/i/decks/deck-${deck}.ttl#${card}`,
    direction: "front-to-back",
    grade,
    // Answers given at the same time keep the order they were made in, by their padded ids.
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(prior === undefined ? {} : { priorIntervalDays: prior }),
    nextIntervalDays: next,
    ...extra,
  };
}

describe("recallByInterval", () => {
  it("bins scored reviews by their prior interval, every bin given", () => {
    const answers = [
      answer("2026-10-01", 4, undefined, 1),
      answer("2026-10-02", 4, 1, 6),
      // Back in the session the same day: no review.
      answer("2026-10-02", 4, 1, 6),
      answer("2026-10-08", 2, 6, 1),
      answer("2026-10-09", 4, 0, 1, { card: "d" }),
      answer("2026-10-10", 5, 400, 900, { card: "e" }),
      answer("2026-10-11", 3, 6, 15, { card: "f", mode: "multiple-choice" }),
    ];
    const bins = recallByInterval(answers, chainIndexOf(answers));
    expect(bins).toHaveLength(9);
    expect(bins[0]).toEqual({ from: 1, to: 2, recall: { reviews: 2, recalled: 2 } });
    expect(bins[2]).toEqual({ from: 4, to: 8, recall: { reviews: 1, recalled: 0 } });
    expect(bins[1]!.recall).toEqual({ reviews: 0, recalled: 0 });
    expect(bins[8]).toEqual({ from: 366, recall: { reviews: 1, recalled: 1 } });
  });
});

describe("latenessOf and latenessBucketOf", () => {
  it("count the days after a review fell due, from the answer before it", () => {
    const first = answer("2026-10-01", 4, undefined, 1);
    const onTime = answer("2026-10-02", 4, 1, 6);
    const late = answer("2026-10-12", 4, 6, 15);
    // A reschedule in the Studio keeps the interval: it shows as late.
    const rescheduled = answer("2026-11-27", 4, 15, 38);
    // An edit the log does not hold: the prior interval is not the one given.
    const edited = answer("2027-01-10", 4, 20, 50);
    const early = answer("2027-02-20", 4, 50, 120);
    const all = [first, onTime, late, rescheduled, edited, early];
    const index = chainIndexOf(all);
    expect(all.map((a) => latenessOf(a, index))).toEqual([null, 0, 4, 31, null, -9]);
    expect([null, -1, 0, 1, 2, 3, 6, 7, 29, 30].map(latenessBucketOf)).toEqual([
      "unknown",
      "early",
      "onTime",
      "late1",
      "late1",
      "late3",
      "late3",
      "late7",
      "late7",
      "late30",
    ]);
  });

  it("knows nothing of a review whose answer before it was not read", () => {
    const review = answer("2026-10-02", 4, 1, 6);
    expect(latenessOf(review, chainIndexOf([review]))).toBeNull();
  });

  it("takes the day a review was due from the review, where it recorded it", () => {
    // Its answer before was not read, yet the review says when it was due.
    const alone = answer("2026-10-05", 4, 1, 6, { priorDue: "2026-10-02" });
    expect(latenessOf(alone, chainIndexOf([alone]))).toBe(3);
    // Moved to the 20th in the Studio and done on the 11th: 9 days early, not 9 late.
    const first = answer("2026-10-01", 4, undefined, 1);
    const rescheduled = answer("2026-10-11", 4, 1, 6, { priorDue: "2026-10-20" });
    const index = chainIndexOf([first, rescheduled]);
    expect(latenessOf(rescheduled, index)).toBe(-9);
    const moved = answer("2026-10-20", 4, 1, 6, { priorDue: "2026-10-20", card: "d" });
    expect(latenessOf(moved, chainIndexOf([moved]))).toBe(0);
  });
});

describe("recallByLateness", () => {
  it("counts scored reviews by lateness, every lateness given in order", () => {
    const answers = [
      answer("2026-10-01", 4, undefined, 1),
      answer("2026-10-02", 4, 1, 6),
      answer("2026-10-12", 1, 6, 1),
      answer("2026-10-12", 4, 1, 1),
      answer("2026-10-05", 4, 3, 6, { card: "d" }),
    ];
    expect(recallByLateness(answers, chainIndexOf(answers))).toEqual([
      { lateness: "onTime", recall: { reviews: 1, recalled: 1 } },
      { lateness: "late1", recall: { reviews: 0, recalled: 0 } },
      { lateness: "late3", recall: { reviews: 1, recalled: 0 } },
      { lateness: "late7", recall: { reviews: 0, recalled: 0 } },
      { lateness: "late30", recall: { reviews: 0, recalled: 0 } },
      { lateness: "early", recall: { reviews: 0, recalled: 0 } },
      { lateness: "unknown", recall: { reviews: 1, recalled: 1 } },
    ]);
  });
});

describe("weeklyRetention", () => {
  it("splits each week's scored reviews into young and mature, oldest week first", () => {
    const answers = [
      answer("2026-10-14", 4, 30, 70),
      answer("2026-10-05", 4, 1, 6),
      answer("2026-10-11", 1, 6, 1),
      answer("2026-10-12", 4, undefined, 1, { card: "d" }),
    ];
    expect(weeklyRetention(answers, chainIndexOf(answers))).toEqual([
      {
        week: "2026-10-05",
        retention: { young: { reviews: 2, recalled: 1 }, mature: { reviews: 0, recalled: 0 } },
      },
      {
        week: "2026-10-12",
        retention: { young: { reviews: 0, recalled: 0 }, mature: { reviews: 1, recalled: 1 } },
      },
    ]);
  });
});

describe("memoryOverTime", () => {
  it("is none of no answers", () => {
    expect(memoryOverTime([], chainIndexOf([]), "2026-10-12")).toEqual([]);
  });

  it("replays where each prompt stood at the end of each week, a forget starting it over", () => {
    const answers = [
      answer("2026-09-30", 4, undefined, 1),
      answer("2026-10-01", 4, 1, 6),
      answer("2026-10-01", 4, undefined, 1, { card: "d" }),
      answer("2026-10-02", 1, 1, 1, { card: "d" }),
      answer("2026-10-07", 4, 6, 25),
      // Forgotten in the Studio, and introduced again.
      answer("2026-10-14", 4, undefined, 1),
    ];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-10-14")).toEqual([
      { week: "2026-09-28", relearning: 1, young: 1, mature: 0, medianInterval: 3.5 },
      { week: "2026-10-05", relearning: 1, young: 0, mature: 1, medianInterval: 13 },
      { week: "2026-10-12", relearning: 1, young: 1, mature: 0, medianInterval: 1 },
    ]);
  });

  it("starts at the range, the answers before it setting where the prompts stand", () => {
    const answers = [
      answer("2026-08-03", 4, undefined, 1),
      answer("2026-08-04", 5, 1, 30),
      answer("2026-08-04", 4, undefined, 1, { card: "d" }),
    ];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-10-14", "2026-10-08")).toEqual([
      { week: "2026-10-05", relearning: 0, young: 1, mature: 1, medianInterval: 15.5 },
      { week: "2026-10-12", relearning: 0, young: 1, mature: 1, medianInterval: 15.5 },
    ]);
  });

  it("holds no prompt in the range's weeks before its first answer", () => {
    const answers = [answer("2026-10-13", 4, undefined, 1)];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-10-14", "2026-10-01")).toEqual([
      { week: "2026-09-28", relearning: 0, young: 0, mature: 0, medianInterval: null },
      { week: "2026-10-05", relearning: 0, young: 0, mature: 0, medianInterval: null },
      { week: "2026-10-12", relearning: 0, young: 1, mature: 0, medianInterval: 1 },
    ]);
  });

  it("moves a card moved with its progress out of its old deck, but not a namesake", () => {
    const answers = [
      answer("2026-10-05", 4, undefined, 1),
      answer("2026-10-06", 4, 1, 6),
      // The same card in another deck, its chain going on from 6 days.
      answer("2026-10-12", 4, 6, 15, { deck: "2" }),
      // A card of the same id in a third deck, at another interval: another card.
      answer("2026-10-13", 4, 3, 8, { deck: "3" }),
    ];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-10-14")).toEqual([
      { week: "2026-10-05", relearning: 0, young: 1, mature: 0, medianInterval: 6 },
      { week: "2026-10-12", relearning: 0, young: 2, mature: 0, medianInterval: 11.5 },
    ]);
  });

  it("keeps a namesake in another deck whose chain starts before the answers read, at the same interval", () => {
    const answers = [
      answer("2026-08-03", 4, 15, 38),
      // Due again before the first deck's interval ran out: not moved from it.
      answer("2026-08-20", 4, 38, 95, { deck: "2" }),
      answer("2026-08-03", 4, 15, 38, { card: "d" }),
      answer("2026-09-15", 4, 38, 95, { card: "d", deck: "2" }),
      // The first deck's card is answered again: it was never moved.
      answer("2026-09-22", 4, 38, 95, { card: "d" }),
    ];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-09-22", "2026-09-14")).toEqual([
      { week: "2026-09-14", relearning: 0, young: 0, mature: 4, medianInterval: 66.5 },
      { week: "2026-09-21", relearning: 0, young: 0, mature: 4, medianInterval: 95 },
    ]);
  });

  it("counts an interval below 0, beyond a century or not a number as the nearer end", () => {
    const answers = [
      answer("2026-10-12", 4, undefined, -1),
      answer("2026-10-12", 4, undefined, 5e9, { card: "d" }),
      answer("2026-10-12", 4, undefined, Number.NaN, { card: "e" }),
      answer("2026-10-12", 4, undefined, 3.7, { card: "f" }),
    ];
    expect(memoryOverTime(answers, chainIndexOf(answers), "2026-10-14")).toEqual([
      { week: "2026-10-12", relearning: 0, young: 3, mature: 1, medianInterval: 1.5 },
    ]);
  });

  it("grows linearly with the answers", () => {
    // Eight times the cards over the same weeks take about as long as an
    // eighth of them eight times over.
    const answers = (cards: number) =>
      Array.from({ length: cards * 10 }, (_, i) => {
        const day = `2026-0${1 + Math.floor((i % 10) / 2)}-1${i % 10}`;
        return answer(day, 4, i % 10 === 0 ? undefined : 6, i % 400, { card: `c${i % cards}` });
      });
    const ratio = growth(
      (cards) => {
        const some = answers(cards);
        const index = chainIndexOf(some);
        return () => memoryOverTime(some, index, "2026-06-30");
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("timeToMatureOf", () => {
  it("takes the medians of the segments introduced among the answers that grew mature", () => {
    const answers = [
      answer("2026-08-01", 4, undefined, 1),
      answer("2026-08-02", 4, 1, 6),
      answer("2026-08-02", 4, 1, 6),
      answer("2026-08-08", 4, 6, 15),
      answer("2026-08-23", 4, 15, 38),
      answer("2026-08-01", 4, undefined, 1, { card: "d" }),
      answer("2026-08-02", 5, 1, 25, { card: "d" }),
      // Seen before the answers read: an open segment, left out.
      answer("2026-08-02", 5, 10, 25, { card: "e" }),
      // Not mature yet.
      answer("2026-08-01", 4, undefined, 1, { card: "f" }),
    ];
    const index = chainIndexOf(answers);
    expect(timeToMatureOf(index)).toEqual({ prompts: 2, days: 11.5, reviews: 2 });
    expect(timeToMatureOf(index, "2026-08-10")).toEqual({ prompts: 1, days: 22, reviews: 3 });
    expect(timeToMatureOf(chainIndexOf([]))).toEqual({ prompts: 0, days: null, reviews: null });
  });
});
