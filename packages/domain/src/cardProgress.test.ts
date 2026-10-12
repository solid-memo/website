// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  cardProgressOf,
  mergeCardProgress,
  mergeForecasts,
  newCardsRunOutOf,
  type CardProgress,
} from "./cardProgress";
import type { Card, StudyDirection } from "./deck";
import type { ReviewState } from "./review";

function card(id: string, retired = false): Card {
  return {
    id,
    url: `https://pod.example/decks/d.ttl#${id}`,
    front: { "": "front" },
    back: { "": "back" },
    createdAt: "2026-09-01T00:00:00.000Z",
    formatVersion: 1,
    ...(retired ? { retired: true as const } : {}),
  };
}

function review(
  cardId: string,
  intervalDays: number,
  due: string,
  direction: StudyDirection = "front-to-back",
  repetitions = 1,
): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays,
    repetitions,
    due,
    firstReviewedAt: "2026-09-01T10:00:00.000Z",
    lastReviewedAt: "2026-09-20T10:00:00.000Z",
    formatVersion: 2,
  };
}

/** A deck with something of everything: new, relearning, young, mature, retired, the other way, a card gone. */
const cards = [card("a"), card("b"), card("c"), card("d"), card("e"), card("retired", true)];
const reviews = [
  review("a", 1, "2026-09-21"),
  // Forgotten last time: relearning, whatever its interval.
  review("e", 1, "2026-09-21", "front-to-back", 0),
  review("b", 20, "2026-09-22"),
  review("c", 21, "2026-09-22"),
  review("a", 40, "2026-10-30", "back-to-front"),
  review("retired", 3, "2026-09-21"),
  review("gone", 3, "2026-09-21"),
];

describe("cardProgressOf", () => {
  it("counts the deck's active prompts new, relearning, young or mature", () => {
    expect(cardProgressOf({ cards, direction: "front-to-back", reviews })).toEqual({
      new: 1,
      relearning: 1,
      young: 2,
      mature: 1,
    });
  });

  it("counts a card once each way it is studied", () => {
    expect(cardProgressOf({ cards, direction: "back-to-front", reviews })).toEqual({
      new: 4,
      relearning: 0,
      young: 0,
      mature: 1,
    });
    expect(cardProgressOf({ cards, direction: "bidirectional", reviews })).toEqual({
      new: 5,
      relearning: 1,
      young: 2,
      mature: 2,
    });
  });
});

describe("mergeCardProgress", () => {
  it("adds decks' progress together, and is nothing of none", () => {
    const one: CardProgress = { new: 1, relearning: 1, young: 2, mature: 3 };
    const two: CardProgress = { new: 10, relearning: 2, young: 0, mature: 1 };
    expect(mergeCardProgress([one, two])).toEqual({ new: 11, relearning: 3, young: 2, mature: 4 });
    expect(mergeCardProgress([])).toEqual({ new: 0, relearning: 0, young: 0, mature: 0 });
  });
});

describe("newCardsRunOutOf", () => {
  const today = "2026-09-21";
  const runOut = (count: number, newCardsPerDay: number, introducedToday = 0) =>
    newCardsRunOutOf({ count, newCardsPerDay, introducedToday, today });

  it("is the day the last new prompt comes at the daily cap, from today on", () => {
    expect(runOut(10, 5)).toBe("2026-09-22");
    expect(runOut(11, 5)).toBe("2026-09-23");
    expect(runOut(1, 20)).toBe("2026-09-21");
    expect(runOut(0, 20)).toBe("2026-09-21");
  });

  it("gives today only what is left of its cap after the prompts met today", () => {
    // The cap of 10 had 7 met today: 3 more today, the other 2 tomorrow.
    expect(runOut(5, 10, 7)).toBe("2026-09-22");
    expect(runOut(3, 10, 7)).toBe("2026-09-21");
    // Today's cap used up: none until tomorrow, then 20 a day.
    expect(runOut(15, 20, 20)).toBe("2026-09-22");
    expect(runOut(21, 20, 25)).toBe("2026-09-23");
  });

  it("is never at a cap of 0", () => {
    expect(runOut(3, 0)).toBeNull();
  });
});

describe("mergeForecasts", () => {
  const one = [
    { studyDay: "2026-09-21", due: 5, reviews: 3 },
    { studyDay: "2026-09-22", due: 0, reviews: 2 },
  ];
  const two = [
    { studyDay: "2026-09-21", due: 1, reviews: 1 },
    { studyDay: "2026-09-22", due: 4, reviews: 4 },
  ];

  it("adds decks' forecasts together day by day, over the next 30 study days", () => {
    const merged = mergeForecasts([one, two], "2026-09-21");
    expect(merged).toHaveLength(30);
    expect(merged.slice(0, 3)).toEqual([
      { studyDay: "2026-09-21", due: 6, reviews: 4 },
      { studyDay: "2026-09-22", due: 4, reviews: 6 },
      { studyDay: "2026-09-23", due: 0, reviews: 0 },
    ]);
    expect(merged.at(-1)).toEqual({ studyDay: "2026-10-20", due: 0, reviews: 0 });
  });

  it("is nothing of no decks", () => {
    expect(
      mergeForecasts([], "2026-09-21").every(({ due, reviews }) => due === 0 && reviews === 0),
    ).toBe(true);
  });
});
