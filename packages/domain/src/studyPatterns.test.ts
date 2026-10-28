// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { growth } from "./testing/growth";
import type { Answer } from "./answer";
import { chainIndexOf } from "./answerChain";
import type { DayActivity } from "./statistics";
import {
  calendarStartOf,
  daysStudiedOf,
  firstTrySuccessOf,
  gradeGroupOf,
  gradeGroupsOf,
  intakeVsLoadOf,
  periodToDateOf,
  retentionByDirection,
  weekdayOf,
  weekdayRhythmOf,
} from "./studyPatterns";

const DECK = "https://pod.example/i/catalog.ttl#deck-1";
let n = 0;
function answer(
  studyDay: string,
  grade: Answer["grade"],
  prior?: number,
  card = "se",
  extra: Partial<Answer> = {},
): Answer {
  n += 1;
  return {
    id: `answer-${String(n).padStart(4, "0")}`,
    deckUrl: DECK,
    cardUrl: `https://pod.example/i/decks/deck-1.ttl#${card}`,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:${String(n % 60).padStart(2, "0")}:00.000Z`,
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

/** A study day's activity: `answers` answers, of them `introduced` new and `reviews` reviews, `lapses` forgotten. */
function day(
  studyDay: string,
  answers: number,
  introduced = 0,
  reviews = 0,
  lapses = 0,
): DayActivity {
  return { studyDay, answers, introduced, reviews, lapses, repeats: 0 };
}

describe("gradeGroupOf", () => {
  it("puts grades 0 to 2 under Again, 3 Hard, 4 Good and 5 Easy", () => {
    expect(([0, 1, 2, 3, 4, 5] as const).map(gradeGroupOf)).toEqual([
      "again",
      "again",
      "again",
      "hard",
      "good",
      "easy",
    ]);
  });
});

describe("gradeGroupsOf", () => {
  it("counts the buttons of first answers and young and mature reviews, repeats and course answers left out", () => {
    expect(
      indexed(
        [
          answer("2026-10-01", 1, undefined, "a"),
          // Back in the session after Again: a repeat, not counted.
          answer("2026-10-01", 4, 1, "a"),
          answer("2026-10-01", 5, undefined, "b"),
          answer("2026-10-02", 3, 1, "a"),
          answer("2026-10-02", 2, 30, "b"),
          answer("2026-10-02", 3, undefined, "c", { mode: "multiple-choice" }),
          answer("2026-10-03", 4, 21, "c"),
        ],
        gradeGroupsOf,
      ),
    ).toEqual({
      introductions: { again: 1, hard: 0, good: 0, easy: 1 },
      young: { again: 0, hard: 1, good: 0, easy: 0 },
      mature: { again: 1, hard: 0, good: 1, easy: 0 },
    });
  });
});

describe("firstTrySuccessOf", () => {
  it("counts each prompt's first introduction, recalled and graded, and whether it was remembered", () => {
    expect(
      indexed(
        [
          answer("2026-10-01", 4, undefined, "a"),
          answer("2026-10-01", 2, undefined, "b"),
          // Forgotten in the Studio and introduced again: not a first try.
          answer("2026-10-05", 1, undefined, "a"),
          answer("2026-10-01", 3, undefined, "c", { mode: "multiple-choice" }),
          answer("2026-10-02", 4, 1, "d"),
        ],
        firstTrySuccessOf,
      ),
    ).toEqual({ introduced: 2, recalled: 1 });
  });

  it("leaves out a prompt introduced again after reviews, seen before the answers read", () => {
    expect(
      indexed(
        [answer("2026-10-01", 4, 30, "a"), answer("2026-10-05", 1, undefined, "a")],
        firstTrySuccessOf,
      ),
    ).toEqual({ introduced: 0, recalled: 0 });
  });

  it("has none without a first answer", () => {
    expect(indexed([answer("2026-10-02", 4, 1)], firstTrySuccessOf)).toEqual({
      introduced: 0,
      recalled: 0,
    });
  });
});

describe("weekdayOf", () => {
  it("counts from Monday", () => {
    expect(weekdayOf("2026-10-12")).toBe(0);
    expect(weekdayOf("2026-10-18")).toBe(6);
  });
});

describe("calendarStartOf", () => {
  it("is the Monday of the calendar's first week, 51 weeks before this one", () => {
    expect(calendarStartOf("2026-10-12")).toBe("2025-10-20");
    expect(calendarStartOf("2026-10-18")).toBe("2025-10-20");
  });
});

describe("periodToDateOf", () => {
  const days = [
    day("2026-10-05", 10, 2, 8, 1),
    day("2026-10-06", 4, 4),
    day("2026-10-08", 6, 1, 5),
    day("2026-10-12", 3, 1, 2, 1),
    day("2026-10-13", 5, 0, 5),
  ];

  it("sums this week from Monday to today, beside last week's same days", () => {
    expect(periodToDateOf(days, "2026-10-13", "week")).toEqual({
      current: { answers: 8, studyDays: 2, introduced: 1, recall: { reviews: 7, recalled: 6 } },
      previous: { answers: 14, studyDays: 2, introduced: 6, recall: { reviews: 8, recalled: 7 } },
    });
  });

  it("sums this month to today, beside last month's same dates", () => {
    expect(
      periodToDateOf(
        [day("2026-09-01", 2), day("2026-09-06", 3), day("2026-09-07", 4), ...days],
        "2026-10-06",
        "month",
      ),
    ).toEqual({
      current: { answers: 14, studyDays: 2, introduced: 6, recall: { reviews: 8, recalled: 7 } },
      previous: { answers: 5, studyDays: 2, introduced: 0, recall: { reviews: 0, recalled: 0 } },
    });
  });

  it("ends last month on its last day when it was shorter", () => {
    const { previous } = periodToDateOf(
      [day("2026-02-28", 2), day("2026-03-01", 7)],
      "2026-03-31",
      "month",
    );
    expect(previous.answers).toBe(2);
    expect(periodToDateOf([day("2026-01-31", 1)], "2026-01-31", "month").previous.answers).toBe(0);
  });
});

describe("daysStudiedOf", () => {
  it("counts the study days of the last 30, today included", () => {
    expect(
      daysStudiedOf(
        [day("2026-09-12", 1), day("2026-09-13", 1), day("2026-10-12", 1), day("2026-10-13", 1)],
        "2026-10-12",
      ),
    ).toBe(2);
  });
});

describe("weekdayRhythmOf", () => {
  it("gives each weekday its answers, and how many of it there were and were studied, from the first study day", () => {
    // From Wednesday 2026-09-30 to Tuesday 2026-10-13: two of each weekday.
    const rhythm = weekdayRhythmOf(
      [day("2026-09-30", 4), day("2026-10-07", 6), day("2026-10-12", 3), day("2026-10-20", 9)],
      "2026-10-13",
    );
    expect(rhythm).toHaveLength(7);
    expect(rhythm[0]).toEqual({ weekday: 0, answers: 3, days: 2, studied: 1 });
    expect(rhythm[2]).toEqual({ weekday: 2, answers: 10, days: 2, studied: 2 });
    expect(rhythm.map((weekday) => weekday.days)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("counts only the weekdays since the first study day", () => {
    const rhythm = weekdayRhythmOf([day("2026-10-12", 3)], "2026-10-13");
    expect(rhythm.map((weekday) => weekday.days)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it("has every weekday, with nothing, before any study day", () => {
    expect(weekdayRhythmOf([], "2026-10-13")).toEqual(
      Array.from({ length: 7 }, (_, weekday) => ({ weekday, answers: 0, days: 0, studied: 0 })),
    );
  });
});

describe("retentionByDirection", () => {
  it("gives each direction with a review its recall, front to back first", () => {
    expect(
      indexed(
        [
          answer("2026-10-02", 1, 1, "a", { direction: "back-to-front" }),
          answer("2026-10-02", 4, 1, "a"),
          answer("2026-10-02", 4, undefined, "b"),
        ],
        retentionByDirection,
      ),
    ).toEqual([
      { direction: "front-to-back", recall: { reviews: 1, recalled: 1 } },
      { direction: "back-to-front", recall: { reviews: 1, recalled: 0 } },
    ]);
  });

  it("has none without a review", () => {
    expect(indexed([answer("2026-10-02", 4)], retentionByDirection)).toEqual([]);
  });
});

describe("intakeVsLoadOf", () => {
  it("gives each of the last weeks from Monday its new cards and reviews, weeks without study none", () => {
    expect(
      intakeVsLoadOf(
        [day("2026-09-30", 5, 5), day("2026-10-05", 6, 2, 4), day("2026-10-13", 3, 0, 3)],
        "2026-10-13",
        4,
      ),
    ).toEqual([
      { week: "2026-09-21", introduced: 0, reviews: 0 },
      { week: "2026-09-28", introduced: 5, reviews: 0 },
      { week: "2026-10-05", introduced: 2, reviews: 4 },
      { week: "2026-10-12", introduced: 0, reviews: 3 },
    ]);
  });

  it("shows twelve weeks by default, and none of the days before them or after this week", () => {
    const loads = intakeVsLoadOf(
      [day("2026-01-05", 1, 1), day("2026-10-12", 2, 2), day("2026-10-20", 4, 4)],
      "2026-10-13",
    );
    expect(loads).toHaveLength(12);
    expect(loads[0]!.week).toBe("2026-07-27");
    expect(loads.reduce((sum, load) => sum + load.introduced, 0)).toBe(2);
  });
});

describe("the figures of a large log", () => {
  it("take each answer once", () => {
    // 100 answers a day over 2,000 cards, a year of them.
    const answers = Array.from({ length: 365 * 100 }, (_, i): Answer => {
      const dayIndex = Math.floor(i / 100);
      const card = (dayIndex * 7 + i) % 2_000;
      return {
        id: `answer-${i}`,
        deckUrl: DECK,
        cardUrl: `https://pod.example/i/decks/deck-1.ttl#c-${card}`,
        direction: i % 3 === 0 ? "back-to-front" : "front-to-back",
        grade: (i % 6) as Answer["grade"],
        answeredAt: new Date(Date.UTC(2025, 0, 1 + dayIndex, 0, 0, i % 100)).toISOString(),
        studyDay: new Date(Date.UTC(2025, 0, 1 + dayIndex)).toISOString().slice(0, 10),
        ...(i < 2_000 || i % 50 === 0 ? {} : { priorIntervalDays: i % 40 }),
        nextIntervalDays: 1,
      };
    });
    const figures = (some: Answer[]) => {
      const index = chainIndexOf(some);
      return [
        gradeGroupsOf(some, index),
        firstTrySuccessOf(some, index),
        retentionByDirection(some, index),
      ];
    };
    // Eight times the answers take about as long as an eighth of them eight
    // times over; work per answer that grew with the answers would take
    // eight times as long.
    const ratio = growth(
      (count) => {
        const some = answers.slice(0, count);
        return () => figures(some);
      },
      answers.length / 16,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
