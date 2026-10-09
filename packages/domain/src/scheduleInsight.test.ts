import { describe, expect, it } from "vitest";
import type { Card } from "./deck";
import type { ReviewState } from "./review";
import {
  easeHistogram,
  forecastOf,
  freshSchedule,
  intervalHistogram,
  leechesOf,
  scheduledStates,
} from "./scheduleInsight";
import type { DeckSchedule, StoredSchedule } from "./studyDigest";

function card(id: string, retired = false): Card {
  return {
    id,
    url: `https://pod.example/decks/d.ttl#${id}`,
    front: { en: "front" },
    back: { en: "back" },
    createdAt: "2026-09-01T00:00:00.000Z",
    formatVersion: 5,
    ...(retired ? { retired: true as const } : {}),
  };
}

function state(cardId: string, extra: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-10-10",
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-09T10:00:00.000Z",
    formatVersion: 2,
    ...extra,
  };
}

function schedule(extra: Partial<DeckSchedule> = {}): DeckSchedule {
  return {
    direction: "front-to-back",
    dayBoundaryHour: 4,
    dueByDay: {},
    unreviewed: 0,
    studyDay: "2026-10-09",
    reviewedOnDay: 0,
    introducedOnDay: 0,
    ...extra,
  };
}

describe("freshSchedule", () => {
  const stored: StoredSchedule = { deck: "https://pod.example/catalog.ttl#d", cardsVersion: "c1", reviewsVersion: "r1", schedule: schedule() };
  const versions = { cards: "c1", reviews: "r1" };
  const input = { direction: "front-to-back" as const, dayBoundaryHour: 4, today: "2026-10-09" };

  it("is the digest's schedule while it was computed from the documents as they are now, as the deck is studied", () => {
    expect(freshSchedule(stored, versions, input)).toBe(stored.schedule);
    expect(freshSchedule(stored, versions, { ...input, today: "2026-10-12" })).toBe(stored.schedule);
  });

  it("is none once anything it was computed from is otherwise", () => {
    expect(freshSchedule(undefined, versions, input)).toBeNull();
    expect(freshSchedule(stored, { ...versions, cards: null }, input)).toBeNull();
    expect(freshSchedule(stored, { ...versions, reviews: null }, input)).toBeNull();
    expect(freshSchedule(stored, { ...versions, cards: "c2" }, input)).toBeNull();
    expect(freshSchedule(stored, { ...versions, reviews: "r2" }, input)).toBeNull();
    expect(freshSchedule(stored, versions, { ...input, direction: "bidirectional" })).toBeNull();
    expect(freshSchedule(stored, versions, { ...input, dayBoundaryHour: 0 })).toBeNull();
    // Computed on a later day: the clock went back.
    expect(freshSchedule(stored, versions, { ...input, today: "2026-10-08" })).toBeNull();
  });
});

describe("forecastOf", () => {
  it("counts what falls due each day, today's with every prompt overdue, and carries what the cap holds back", () => {
    const due = { "2026-10-01": 2, "2026-10-09": 3, "2026-10-10": 1, "2026-10-12": 4 };
    const forecast = forecastOf(schedule({ dueByDay: due, reviewedOnDay: 2 }), { today: "2026-10-09", days: 4, maxReviewsPerDay: 4 });
    expect(forecast).toEqual([
      // Two of today's four reviews are made already.
      { studyDay: "2026-10-09", due: 5, reviews: 2 },
      { studyDay: "2026-10-10", due: 1, reviews: 4 },
      { studyDay: "2026-10-11", due: 0, reviews: 0 },
      { studyDay: "2026-10-12", due: 4, reviews: 4 },
    ]);
  });

  it("gives today the whole cap when the schedule was computed on an earlier day, and none when today's is used up", () => {
    const earlier = schedule({ dueByDay: { "2026-10-09": 3 }, studyDay: "2026-10-08", reviewedOnDay: 9 });
    expect(forecastOf(earlier, { today: "2026-10-09", days: 1, maxReviewsPerDay: 5 })).toEqual([{ studyDay: "2026-10-09", due: 3, reviews: 3 }]);
    const spent = schedule({ dueByDay: { "2026-10-09": 3 }, reviewedOnDay: 9 });
    expect(forecastOf(spent, { today: "2026-10-09", days: 1, maxReviewsPerDay: 5 })).toEqual([{ studyDay: "2026-10-09", due: 3, reviews: 0 }]);
  });
});

describe("scheduledStates", () => {
  it("keeps the states of the cards in use, in the directions the deck studies", () => {
    const cards = [card("a"), card("b"), card("retired", true)];
    const back = state("a", { direction: "back-to-front" });
    const states = [state("a"), back, state("retired"), state("gone")];
    expect(scheduledStates(cards, "front-to-back", states)).toEqual([state("a")]);
    expect(scheduledStates(cards, "bidirectional", states)).toEqual([state("a"), back]);
  });
});

describe("the histograms", () => {
  it("spread the intervals over days, a week, a month and more", () => {
    const bins = intervalHistogram([0, 1, 3, 4, 21, 400].map((intervalDays) => state("a", { intervalDays })));
    expect(bins[0]).toEqual({ from: 1, to: 2, count: 2 });
    expect(bins[1]).toEqual({ from: 2, to: 4, count: 1 });
    expect(bins[2]).toEqual({ from: 4, to: 8, count: 1 });
    expect(bins[4]).toEqual({ from: 15, to: 31, count: 1 });
    expect(bins.at(-1)).toEqual({ from: 366, count: 1 });
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(6);
  });

  it("spread the eases in steps of 0.2, 2.5 itself from 2.5 on", () => {
    const bins = easeHistogram([1.3, 1.49, 2.5, 2.5000000001, 2.4999999999, 3.1].map((easeFactor) => state("a", { easeFactor })));
    expect(bins[0]).toEqual({ from: 1.3, to: 1.5, count: 2 });
    expect(bins.find((bin) => bin.from === 2.5)).toEqual({ from: 2.5, to: 2.7, count: 3 });
    expect(bins.at(-1)).toEqual({ from: 2.7, count: 1 });
  });
});

describe("leechesOf", () => {
  const index = {
    lapses: new Map([
      ["https://pod.example/d.ttl#b", 4],
      ["https://pod.example/d.ttl#a", 4],
      ["https://pod.example/d.ttl#c", 7],
      ["https://pod.example/d.ttl#d", 3],
    ]),
    since: "2026-01",
  };

  it("lists the cards forgotten four times or more, the most forgotten first", () => {
    expect(leechesOf(index)).toEqual([
      { cardUrl: "https://pod.example/d.ttl#c", lapses: 7 },
      { cardUrl: "https://pod.example/d.ttl#a", lapses: 4 },
      { cardUrl: "https://pod.example/d.ttl#b", lapses: 4 },
    ]);
  });

  it("takes another least", () => {
    expect(leechesOf(index, { minLapses: 5 })).toEqual([{ cardUrl: "https://pod.example/d.ttl#c", lapses: 7 }]);
  });
});
