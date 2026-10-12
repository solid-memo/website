// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { growth } from "./testing/growth";
import type { Answer } from "./answer";
import { chainIndexOf } from "./answerChain";
import {
  dailyActivity,
  introducedOverTime,
  monthlyRetention,
  quizAccuracyOf,
  retentionOf,
  shiftStudyDay,
  statisticsOf,
  streaksOf,
  todayOf,
} from "./statistics";

const DECK = "https://pod.example/i/catalog.ttl#deck-";
let n = 0;
function answer(
  studyDay: string,
  grade: Answer["grade"],
  prior?: number,
  deck = "1",
  card = "se",
  extra: Partial<Answer> = {},
): Answer {
  n += 1;
  return {
    // Padded, so that answers given at the same time keep the order they were made in.
    id: `answer-${String(n).padStart(4, "0")}`,
    deckUrl: `${DECK}${deck}`,
    cardUrl: `https://pod.example/i/decks/deck-${deck}.ttl#${card}`,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(prior === undefined ? {} : { priorIntervalDays: prior }),
    nextIntervalDays: 1,
    ...extra,
  };
}

/** The figure `of` the answers given, their chains indexed. */
function indexed<T>(
  answers: Answer[],
  of: (answers: Answer[], index: ReturnType<typeof chainIndexOf>) => T,
): T {
  return of(answers, chainIndexOf(answers));
}

describe("dailyActivity", () => {
  it("counts each study day's answers, introductions, forgotten cards, reviews, lapses and repeats, oldest first", () => {
    expect(
      indexed(
        [answer("2026-10-03", 4), answer("2026-10-01", 1, 3), answer("2026-10-03", 2, 1)],
        dailyActivity,
      ),
    ).toEqual([
      {
        studyDay: "2026-10-01",
        answers: 1,
        introduced: 0,
        forgotten: 1,
        reviews: 1,
        lapses: 1,
        repeats: 0,
      },
      {
        studyDay: "2026-10-03",
        answers: 2,
        introduced: 1,
        forgotten: 1,
        reviews: 0,
        lapses: 0,
        repeats: 1,
      },
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
    const days = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-10-01",
      "2026-10-02",
    ];
    expect(streaksOf(days, "2026-10-02")).toEqual({ current: 2, longest: 4 });
    expect(streaksOf(days, "2026-10-03")).toEqual({ current: 2, longest: 4 });
    expect(streaksOf(days, "2026-10-04")).toEqual({ current: 0, longest: 4 });
    expect(streaksOf([], "2026-10-04")).toEqual({ current: 0, longest: 0 });
  });
});

describe("retentionOf", () => {
  it("counts reviews, not first answers, young and mature apart", () => {
    expect(
      indexed(
        [
          answer("2026-10-01", 4, undefined, "1", "a"),
          answer("2026-10-01", 4, 1, "1", "b"),
          answer("2026-10-01", 1, 20, "1", "c"),
          answer("2026-10-01", 5, 21, "1", "d"),
        ],
        retentionOf,
      ),
    ).toEqual({
      young: { reviews: 2, recalled: 1 },
      mature: { reviews: 1, recalled: 1 },
    });
  });

  it("leaves out a card put back in the session the same day, and course answers", () => {
    expect(
      indexed(
        [
          // Failed when introduced, then passed when it came back: no review yet.
          answer("2026-10-01", 1, undefined, "1", "a"),
          answer("2026-10-01", 4, 1, "1", "a"),
          // Forgotten in review, then passed when it came back: one review, forgotten.
          answer("2026-10-02", 1, 6, "1", "b"),
          answer("2026-10-02", 4, 1, "1", "b"),
          // Answered among a course's options.
          answer("2026-10-02", 3, 6, "1", "c", { mode: "multiple-choice" }),
        ],
        retentionOf,
      ),
    ).toEqual({
      young: { reviews: 1, recalled: 0 },
      mature: { reviews: 0, recalled: 0 },
    });
  });
});

describe("quizAccuracyOf", () => {
  it("counts the course answers right of each question's first answer a day", () => {
    const course = { mode: "multiple-choice" } as const;
    expect(
      indexed(
        [
          answer("2026-10-01", 3, undefined, "1", "a", course),
          answer("2026-10-01", 1, undefined, "1", "b", course),
          // Answered wrongly again in the chapter's review: a repeat.
          answer("2026-10-01", 1, 1, "1", "b", course),
          answer("2026-10-02", 1, 1, "1", "a", course),
          // Recalled and graded: not a course answer.
          answer("2026-10-02", 4, 1, "1", "c"),
        ],
        quizAccuracyOf,
      ),
    ).toEqual({ answers: 3, right: 1 });
  });
});

describe("introducedOverTime", () => {
  it("adds up the prompts introduced, day by day", () => {
    const days = indexed(
      [
        answer("2026-10-01", 4),
        answer("2026-10-01", 4),
        answer("2026-10-02", 4, 1),
        answer("2026-10-05", 3),
      ],
      dailyActivity,
    );
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
    expect(
      indexed(
        [
          answer("2026-10-02", 1, 3),
          answer("2026-08-30", 4),
          answer("2026-10-01", 5, 30),
          answer("2026-10-03", 4, 2),
        ],
        monthlyRetention,
      ),
    ).toEqual([
      {
        month: "2026-08",
        retention: { young: { reviews: 0, recalled: 0 }, mature: { reviews: 0, recalled: 0 } },
      },
      {
        month: "2026-10",
        retention: { young: { reviews: 2, recalled: 1 }, mature: { reviews: 1, recalled: 1 } },
      },
    ]);
  });
});

describe("statisticsOf", () => {
  it("counts a card once, though an upgrade of its deck moved it into a new document", () => {
    const before = answer("2026-10-01", 4, undefined, "1", "se");
    const after = {
      ...answer("2026-10-02", 4, 1, "1", "se"),
      cardUrl: "https://pod.example/i/decks/deck-1-u1.ttl#se",
    };
    expect(statisticsOf([before, after], "2026-10-02").totals.cards).toBe(1);
  });

  it("totals the answers, study days and cards, with each deck's share, most answers first", () => {
    const answers = [
      answer("2026-10-02", 4, 1, "1", "se"),
      answer("2026-10-01", 4, undefined, "1", "se"),
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
    expect(statistics.quiz).toEqual({ answers: 0, right: 0 });
    expect(statistics.decks.map((deck) => [deck.deckUrl, deck.answers, deck.lastStudyDay])).toEqual(
      [
        [`${DECK}1`, 2, "2026-10-02"],
        [`${DECK}2`, 1, "2026-10-02"],
        [`${DECK}3`, 1, "2026-10-02"],
      ],
    );
  });

  it("gives each deck its recall, introductions, lapses and course answers", () => {
    const statistics = statisticsOf(
      [
        answer("2026-10-01", 4, undefined, "1", "a"),
        answer("2026-10-01", 4, undefined, "1", "b"),
        answer("2026-10-03", 1, 6, "1", "a"),
        answer("2026-10-03", 4, 1, "1", "a"),
        answer("2026-10-03", 4, 30, "1", "b"),
        answer("2026-10-03", 3, undefined, "2", "c", { mode: "multiple-choice" }),
        answer("2026-10-03", 1, undefined, "2", "d", { mode: "multiple-choice" }),
      ],
      "2026-10-03",
    );
    expect(statistics.decks).toEqual([
      {
        deckUrl: `${DECK}1`,
        answers: 5,
        lastStudyDay: "2026-10-03",
        retention: { young: { reviews: 1, recalled: 0 }, mature: { reviews: 1, recalled: 1 } },
        introduced: 2,
        lapses: 1,
        quiz: { answers: 0, right: 0 },
      },
      {
        deckUrl: `${DECK}2`,
        answers: 2,
        lastStudyDay: "2026-10-03",
        retention: { young: { reviews: 0, recalled: 0 }, mature: { reviews: 0, recalled: 0 } },
        introduced: 2,
        lapses: 0,
        quiz: { answers: 2, right: 1 },
      },
    ]);
    expect(statistics.quiz).toEqual({ answers: 2, right: 1 });
  });

  it("works through a large log in one pass", { timeout: 30_000 }, () => {
    // A year of 200 answers a day, over 2,000 cards in four decks.
    const answers = (count: number) =>
      Array.from({ length: count }, (_, i): Answer => {
        const day = Math.floor(i / 200);
        const studyDay = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10);
        const card = (day * 7 + i) % 2_000;
        return {
          id: `answer-${i}`,
          deckUrl: `${DECK}${card % 4}`,
          cardUrl: `https://pod.example/i/decks/deck-${card % 4}.ttl#c-${card}`,
          direction: "front-to-back",
          grade: (i % 6) as Answer["grade"],
          answeredAt: new Date(Date.UTC(2025, 0, 1 + day, 0, 0, i % 200)).toISOString(),
          studyDay,
          ...(i < 2_000 ? {} : { priorIntervalDays: i % 40 }),
          nextIntervalDays: 1,
        };
      });
    const year = answers(365 * 200);
    expect(statisticsOf(year, "2025-12-31").totals.cards).toBe(2_000);
    // Four times the answers take about four times as long; work per answer
    // that grew with the answers would take sixteen.
    const ratio = growth(
      (count) => {
        const some = year.slice(0, count);
        return () => statisticsOf(some, "2025-12-31");
      },
      year.length / 8,
      4,
    );
    expect(ratio).toBeLessThan(10);
  });
});

describe("todayOf", () => {
  it("sums up today's study, in every deck, with the streak it extends", () => {
    const statistics = statisticsOf(
      [
        answer("2026-10-02", 4, undefined, "1", "a"),
        answer("2026-10-03", 4, undefined, "1", "b"),
        answer("2026-10-03", 1, 3, "1", "a"),
        // Back in the session after it was forgotten: not a review again.
        answer("2026-10-03", 4, 1, "1", "a"),
        answer("2026-10-03", 5, 3, "2", "c"),
        answer("2026-10-03", 3, 3, "2", "e", { mode: "multiple-choice" }),
        answer("2026-09-20", 5, 3, "3", "d"),
      ],
      "2026-10-03",
    );
    expect(todayOf(statistics)).toEqual({
      answers: 5,
      introduced: 1,
      recall: { reviews: 2, recalled: 1 },
      streak: 2,
      longestStreak: 2,
    });
  });

  it("is null while nothing is studied today", () => {
    expect(todayOf(statisticsOf([answer("2026-10-02", 4)], "2026-10-03"))).toBeNull();
  });
});
