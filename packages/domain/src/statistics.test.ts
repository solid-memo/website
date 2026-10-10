import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import {
  dailyActivity,
  introducedOverTime,
  monthlyRetention,
  retentionOf,
  shiftStudyDay,
  statisticsOf,
  streaksOf,
  todayOf,
} from "./statistics";

const DECK = "https://pod.example/i/catalog.ttl#deck-";
let n = 0;
function answer(studyDay: string, grade: Answer["grade"], prior?: number, deck = "1", card = "se"): Answer {
  n += 1;
  return {
    id: `answer-${n}`,
    deckUrl: `${DECK}${deck}`,
    cardUrl: `https://pod.example/i/decks/deck-${deck}.ttl#${card}`,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(prior === undefined ? {} : { priorIntervalDays: prior }),
    nextIntervalDays: 1,
  };
}

describe("dailyActivity", () => {
  it("counts each study day's answers, introductions and forgotten cards, oldest first", () => {
    expect(dailyActivity([answer("2026-10-03", 4), answer("2026-10-01", 1, 3), answer("2026-10-03", 2, 1)])).toEqual([
      { studyDay: "2026-10-01", answers: 1, introduced: 0, forgotten: 1 },
      { studyDay: "2026-10-03", answers: 2, introduced: 1, forgotten: 1 },
    ]);
  });
});

describe("shiftStudyDay", () => {
  it("counts calendar days across months and years", () => {
    expect(shiftStudyDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftStudyDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftStudyDay("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("streaksOf", () => {
  it("counts the run up to today, or up to yesterday while today is not studied yet, and the longest", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-01", "2026-10-02"];
    expect(streaksOf(days, "2026-10-02")).toEqual({ current: 2, longest: 4 });
    expect(streaksOf(days, "2026-10-03")).toEqual({ current: 2, longest: 4 });
    expect(streaksOf(days, "2026-10-04")).toEqual({ current: 0, longest: 4 });
    expect(streaksOf([], "2026-10-04")).toEqual({ current: 0, longest: 0 });
  });
});

describe("retentionOf", () => {
  it("counts reviews, not first answers, young and mature apart", () => {
    expect(retentionOf([answer("2026-10-01", 4), answer("2026-10-01", 4, 1), answer("2026-10-01", 1, 20), answer("2026-10-01", 5, 21)])).toEqual({
      young: { reviews: 2, recalled: 1 },
      mature: { reviews: 1, recalled: 1 },
    });
  });
});

describe("introducedOverTime", () => {
  it("adds up the prompts introduced, day by day", () => {
    const days = dailyActivity([answer("2026-10-01", 4), answer("2026-10-01", 4), answer("2026-10-02", 4, 1), answer("2026-10-05", 3)]);
    expect(introducedOverTime(days)).toEqual([
      { studyDay: "2026-10-01", introduced: 2 },
      { studyDay: "2026-10-02", introduced: 2 },
      { studyDay: "2026-10-05", introduced: 3 },
    ]);
    expect(introducedOverTime([])).toEqual([]);
  });
});

describe("monthlyRetention", () => {
  it("counts each month's reviews apart, oldest first, a month of first answers only with none", () => {
    expect(monthlyRetention([answer("2026-10-02", 1, 3), answer("2026-08-30", 4), answer("2026-10-01", 5, 30), answer("2026-10-03", 4, 2)])).toEqual([
      { month: "2026-08", retention: { young: { reviews: 0, recalled: 0 }, mature: { reviews: 0, recalled: 0 } } },
      { month: "2026-10", retention: { young: { reviews: 2, recalled: 1 }, mature: { reviews: 1, recalled: 1 } } },
    ]);
  });
});

describe("statisticsOf", () => {
  it("counts a card once, though an upgrade of its deck moved it into a new document", () => {
    const before = answer("2026-10-01", 4, undefined, "1", "se");
    const after = { ...answer("2026-10-02", 4, 1, "1", "se"), cardUrl: "https://pod.example/i/decks/deck-1-u1.ttl#se" };
    expect(statisticsOf([before, after], "2026-10-02").totals.cards).toBe(1);
  });

  it("totals the answers, study days and cards, with each deck's share, most answers first", () => {
    const answers = [
      answer("2026-10-01", 4, undefined, "1", "se"),
      answer("2026-10-02", 4, 1, "1", "se"),
      answer("2026-10-02", 3, undefined, "2", "no"),
      answer("2026-10-02", 3, undefined, "3", "fi"),
    ];
    const statistics = statisticsOf(answers, "2026-10-02");
    expect(statistics.today).toBe("2026-10-02");
    expect(statistics.totals).toEqual({ answers: 4, studyDays: 2, cards: 3 });
    expect(statistics.streaks).toEqual({ current: 2, longest: 2 });
    expect(statistics.days.map((day) => day.studyDay)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(statistics.retention.young).toEqual({ reviews: 1, recalled: 1 });
    expect(statistics.months).toEqual([{ month: "2026-10", retention: statistics.retention }]);
    expect(statistics.decks.map((deck) => [deck.deckUrl, deck.answers, deck.lastStudyDay])).toEqual([
      [`${DECK}1`, 2, "2026-10-02"],
      [`${DECK}2`, 1, "2026-10-02"],
      [`${DECK}3`, 1, "2026-10-02"],
    ]);
  });
});

describe("todayOf", () => {
  it("sums up today's study, in every deck, with the streak it extends", () => {
    const statistics = statisticsOf(
      [
        answer("2026-10-02", 4, undefined, "1", "a"),
        answer("2026-10-03", 4, undefined, "1", "b"),
        answer("2026-10-03", 1, 3, "1", "a"),
        answer("2026-10-03", 5, 3, "2", "c"),
        answer("2026-09-20", 5, 3, "3", "d"),
      ],
      "2026-10-03",
    );
    expect(todayOf(statistics)).toEqual({ answers: 3, introduced: 1, recalled: 2, streak: 2, longestStreak: 2 });
  });

  it("is null while nothing is studied today", () => {
    expect(todayOf(statisticsOf([answer("2026-10-02", 4)], "2026-10-03"))).toBeNull();
  });
});
