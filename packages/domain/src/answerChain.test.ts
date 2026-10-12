// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import {
  chainIndexOf,
  isIntroduction,
  isLapse,
  isRepeat,
  isScoredReview,
  promptKeyOf,
  segmentsOf,
} from "./answerChain";
import { growth } from "./testing/growth";

const DECK = "https://pod.example/i/catalog.ttl#deck-1";
const CARDS = "https://pod.example/i/decks/deck-1.ttl";

function answer(id: string, at: string, extra: Partial<Answer> = {}): Answer {
  return {
    id,
    deckUrl: DECK,
    cardUrl: `${CARDS}#c-1`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: at,
    studyDay: at.slice(0, 10),
    priorIntervalDays: 1,
    nextIntervalDays: 6,
    ...extra,
  };
}

describe("promptKeyOf", () => {
  it("names the deck, the card by fragment id and the direction", () => {
    const before = answer("a", "2026-10-01T10:00:00.000Z");
    const upgraded = { ...before, cardUrl: "https://pod.example/i/decks/deck-1-u1.ttl#c-1" };
    expect(promptKeyOf(upgraded)).toBe(promptKeyOf(before));
    expect(promptKeyOf({ ...before, direction: "back-to-front" })).not.toBe(promptKeyOf(before));
    expect(promptKeyOf({ ...before, cardUrl: `${CARDS}#c-2` })).not.toBe(promptKeyOf(before));
    expect(promptKeyOf({ ...before, deckUrl: `${DECK}0` })).not.toBe(promptKeyOf(before));
  });
});

describe("chainIndexOf", () => {
  it("puts each prompt's answers in the order given, by time and then id", () => {
    const third = answer("c", "2026-10-02T10:00:00.000Z");
    const second = answer("b", "2026-10-01T10:00:00.000Z");
    const first = answer("a", "2026-10-01T10:00:00.000Z");
    const other = answer("d", "2026-10-01T09:00:00.000Z", { cardUrl: `${CARDS}#c-2` });
    const index = chainIndexOf([third, second, other, first]);
    expect([...index.chains.values()]).toEqual([[first, second, third], [other]]);
    expect(index.places.get(second)).toEqual({ chain: [first, second, third], at: 1 });
  });
});

describe("isRepeat, isScoredReview and isLapse", () => {
  it("score a prompt's first review of the day, recalled and graded, and its lapses", () => {
    const introduced = answer("a", "2026-10-01T10:00:00.000Z", {
      priorIntervalDays: undefined,
      grade: 1,
    });
    const repeat = answer("b", "2026-10-01T10:05:00.000Z", { grade: 4 });
    const lapse = answer("c", "2026-10-02T10:00:00.000Z", { grade: 2 });
    const failedAgain = answer("d", "2026-10-02T10:05:00.000Z", { grade: 0 });
    const course = answer("e", "2026-10-03T10:00:00.000Z", {
      mode: "multiple-choice",
      grade: 1,
    });
    const recalled = answer("f", "2026-10-04T10:00:00.000Z", { mode: "recall" });
    const all = [introduced, repeat, lapse, failedAgain, course, recalled];
    const index = chainIndexOf(all);
    expect(all.map((a) => isRepeat(a, index))).toEqual([false, true, false, true, false, false]);
    expect(all.map((a) => isScoredReview(a, index))).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
    expect(all.map((a) => isLapse(a, index))).toEqual([false, false, true, false, false, false]);
  });

  it("introduce a prompt by an answer without a prior interval that repeats none", () => {
    const introduced = answer("a", "2026-10-01T10:00:00.000Z", { priorIntervalDays: undefined });
    // Forgotten in the Studio and studied again the same day: a repeat.
    const again = answer("b", "2026-10-01T10:05:00.000Z", { priorIntervalDays: undefined });
    const reviewed = answer("c", "2026-10-02T10:00:00.000Z");
    // Forgotten in the Studio and studied again another day: introduced again.
    const later = answer("d", "2026-10-03T10:00:00.000Z", { priorIntervalDays: undefined });
    const all = [introduced, again, reviewed, later];
    const index = chainIndexOf(all);
    expect(all.map((a) => isIntroduction(a, index))).toEqual([true, false, false, true]);
  });

  it("tells a repeat by its prompt's chain alone, whatever else was answered that day", () => {
    const one = answer("a", "2026-10-02T10:00:00.000Z");
    const otherWay = answer("b", "2026-10-02T10:01:00.000Z", { direction: "back-to-front" });
    const index = chainIndexOf([one, otherWay]);
    expect(isRepeat(otherWay, index)).toBe(false);
  });

  it("builds the chains in one pass, however many answers there are", { timeout: 30_000 }, () => {
    // A year of 200 answers a day over 2,000 prompts.
    const answers = (count: number) =>
      Array.from({ length: count }, (_, n): Answer => {
        const day = Math.floor(n / 200);
        const at = new Date(Date.UTC(2021, 0, 1 + day, 0, 0, n % 200)).toISOString();
        return answer(`answer-${n}`, at, {
          cardUrl: `${CARDS}#c-${(day * 7 + n) % 2_000}`,
          grade: (n % 6) as Answer["grade"],
        });
      });
    const year = answers(365 * 200);
    expect(chainIndexOf(year).chains.size).toBe(2_000);
    // Four times the answers take about four times as long (a sort a
    // prompt adds a little); work per answer that grew with the answers
    // would take sixteen.
    const ratio = growth(
      (count) => {
        const some = year.slice(0, count);
        return () => {
          const index = chainIndexOf(some);
          return some.filter((a) => isLapse(a, index)).length;
        };
      },
      year.length / 8,
      4,
    );
    expect(ratio).toBeLessThan(10);
  });
});

describe("segmentsOf", () => {
  it("cuts a chain at each introduction, open when it starts without one", () => {
    const moved = answer("a", "2026-10-01T10:00:00.000Z");
    const next = answer("b", "2026-10-02T10:00:00.000Z");
    const forgotten = answer("c", "2026-10-03T10:00:00.000Z", { priorIntervalDays: undefined });
    const after = answer("d", "2026-10-04T10:00:00.000Z");
    expect(segmentsOf([moved, next, forgotten, after])).toEqual([
      { open: true, answers: [moved, next] },
      { open: false, answers: [forgotten, after] },
    ]);
    expect(segmentsOf([])).toEqual([]);
  });
});
