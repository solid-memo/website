// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { monthOfStudyDay, shiftStudyDay, type Answer } from "./answer";
import type { Card, DeckDirection, StudyDirection } from "./deck";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "./preferences";
import type { ReviewState } from "./review";
import { buildStudyQueue } from "./scheduling";
import { statisticsOf, todayOf, welcomeBackOf } from "./statistics";
import { calendarStartOf } from "./studyPatterns";
import {
  emptyDigest,
  monthSummaryOf,
  scheduleOf,
  studyCountsOf,
  todayFiguresOf,
  withMonthSummaries,
  withReceipt,
  withSchedule,
  type DeckSchedule,
  type MonthSummary,
} from "./studyDigest";

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
  due: string,
  lastReviewedAt: Date,
  firstReviewedAt: Date = lastReviewedAt,
  direction: StudyDirection = "front-to-back",
): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: firstReviewedAt.toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
  };
}

const lastWeek = new Date(2026, 8, 14, 12, 0);
const yesterday = new Date(2026, 8, 20, 12, 0);
const now = new Date(2026, 8, 21, 12, 0);
const tomorrow = new Date(2026, 8, 22, 12, 0);
const later = new Date(2026, 8, 25, 12, 0);

/** A deck with something of everything: due, overdue, future, new, retired, both ways, studied today. */
const cards = [
  card("a"),
  card("b"),
  card("c"),
  card("d"),
  card("e"),
  card("f"),
  card("retired", true),
];
const reviews = [
  review("a", "2026-09-19", lastWeek),
  review("b", "2026-09-21", yesterday),
  review("c", "2026-09-23", now, lastWeek),
  review("d", "2026-09-22", now, now),
  review("a", "2026-09-21", yesterday, yesterday, "back-to-front"),
  review("retired", "2026-09-20", now),
  review("gone", "2026-09-20", lastWeek),
];

function queueCounts(input: { direction: DeckDirection; prefs: StudyPreferences; at: Date }) {
  const queue = buildStudyQueue({
    cards,
    direction: input.direction,
    reviews,
    prefs: input.prefs,
    now: input.at,
    random: () => 0,
  });
  return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
}

describe("a deck schedule", () => {
  const directions: DeckDirection[] = ["front-to-back", "back-to-front", "bidirectional"];
  const caps: StudyPreferences[] = [
    DEFAULT_PREFERENCES,
    { ...DEFAULT_PREFERENCES, newCardsPerDay: 1, maxReviewsPerDay: 2 },
    { ...DEFAULT_PREFERENCES, newCardsPerDay: 0, maxReviewsPerDay: 0 },
  ];

  it.each(directions)(
    "counts what buildStudyQueue counts, on the day it was computed and later (%s)",
    (direction) => {
      const schedule = scheduleOf({
        cards,
        direction,
        reviews,
        scheduler: "sm2",
        dayBoundaryHour: 4,
        now,
      });
      for (const prefs of caps) {
        for (const at of [now, tomorrow, later]) {
          // Later days: nothing was reviewed since (else the reviews document, and so the schedule, would be new).
          expect(studyCountsOf(schedule, { direction, prefs, now: at })).toEqual(
            queueCounts({ direction, prefs, at }),
          );
        }
      }
    },
  );

  it("holds the prompts due by day, the new ones and the day's work", () => {
    expect(
      scheduleOf({
        cards,
        direction: "bidirectional",
        reviews,
        scheduler: "fsrs6",
        dayBoundaryHour: 4,
        now,
      }),
    ).toEqual<DeckSchedule>({
      direction: "bidirectional",
      dayBoundaryHour: 4,
      scheduler: "fsrs6",
      dueByDay: { "2026-09-19": 1, "2026-09-21": 2, "2026-09-23": 1, "2026-09-22": 1 },
      unreviewed: 7,
      studyDay: "2026-09-21",
      reviewedOnDay: 3,
      introducedOnDay: 2,
    });
  });

  it("cannot say for another direction, day boundary or scheduler, or a day before it was computed", () => {
    const schedule = scheduleOf({
      cards,
      direction: "front-to-back",
      reviews,
      scheduler: "sm2",
      dayBoundaryHour: 4,
      now,
    });
    const prefs = DEFAULT_PREFERENCES;
    expect(studyCountsOf(schedule, { direction: "bidirectional", prefs, now })).toBeNull();
    expect(
      studyCountsOf(schedule, {
        direction: "front-to-back",
        prefs: { ...prefs, dayBoundaryHour: 5 },
        now,
      }),
    ).toBeNull();
    // Switching back from FSRS-6 writes no review: the stored due days are its.
    expect(
      studyCountsOf(schedule, {
        direction: "front-to-back",
        prefs: { ...prefs, scheduler: "fsrs6" },
        now,
      }),
    ).toBeNull();
    expect(
      studyCountsOf(schedule, { direction: "front-to-back", prefs, now: yesterday }),
    ).toBeNull();
  });
});

describe("an instance digest", () => {
  const doc = "https://pod.example/i/decks/d.ttl";

  it("adds to what it knew of a document at the same version, and forgets another version", () => {
    let digest = withReceipt(emptyDigest(), doc, '"v1"', { latestFormat: true });
    digest = withReceipt(digest, doc, '"v1"', { conformedTo: "rules" });
    expect(digest.receipts[doc]).toEqual({
      document: doc,
      version: '"v1"',
      latestFormat: true,
      conformedTo: "rules",
    });
    digest = withReceipt(digest, doc, '"v2"', { conformedTo: "rules" });
    expect(digest.receipts[doc]).toEqual({ document: doc, version: '"v2"', conformedTo: "rules" });
  });

  it("keeps a schedule by its deck", () => {
    const schedule = scheduleOf({
      cards: [],
      direction: "front-to-back",
      reviews: [],
      scheduler: "sm2",
      dayBoundaryHour: 4,
      now,
    });
    const stored = {
      deck: "https://pod.example/i/catalog.ttl#deck-1",
      cardsVersion: '"c"',
      reviewsVersion: "absent",
      schedule,
    };
    expect(withSchedule(emptyDigest(), stored).schedules).toEqual({ [stored.deck]: stored });
  });
});

let answers = 0;
function answer(studyDay: string, extra: Partial<Answer> = {}): Answer {
  answers += 1;
  return {
    id: `answer-${String(answers).padStart(5, "0")}`,
    deckUrl: "https://pod.example/i/catalog.ttl#deck-1",
    cardUrl: "https://pod.example/i/decks/deck-1.ttl#c1",
    direction: "front-to-back",
    grade: 4,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
    ...extra,
  };
}

/** The summaries of the answers given, one a month, as the digest keeps them. */
function summariesOf(given: readonly Answer[]): MonthSummary[] {
  const months = new Map<string, Answer[]>();
  for (const one of given) {
    const month = monthOfStudyDay(one.studyDay);
    const answers = months.get(month);
    if (answers === undefined) months.set(month, [one]);
    else answers.push(one);
  }
  return [...months.values()].map(monthSummaryOf);
}

/**
 * A year of study up to `today`, made the same each run: new cards,
 * reviews young and mature, lapses, repeats the same day, course answers,
 * days skipped, times recorded and not, and streaks across month ends.
 */
function yearOfStudy(today: string): Answer[] {
  const given: Answer[] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let back = 364; back >= 0; back--) {
    const studyDay = shiftStudyDay(today, -back);
    if (next() < 0.2) continue;
    const count = 1 + Math.floor(next() * 12);
    for (let i = 0; i < count; i++) {
      const card = `c${Math.floor(next() * 40)}`;
      const roll = next();
      const timed = back < 200 && next() < 0.9;
      given.push(
        answer(studyDay, {
          cardUrl: `https://pod.example/i/decks/deck-1.ttl#${card}`,
          answeredAt: `${studyDay}T${String(8 + i).padStart(2, "0")}:00:00.000Z`,
          grade: next() < 0.2 ? 1 : 4,
          ...(roll < 0.25 ? {} : { priorIntervalDays: Math.floor(next() * 60) }),
          ...(roll > 0.9 ? { mode: "multiple-choice" as const } : {}),
          ...(timed
            ? {
                recallMillis: Math.floor(next() * 9000),
                ...(next() < 0.95 ? { gradeMillis: Math.floor(next() * 3000) } : {}),
              }
            : {}),
        }),
      );
    }
  }
  return given;
}

describe("a month summary", () => {
  it("counts each study day, young recall and recall times by the second, capped", () => {
    const summary = monthSummaryOf([
      answer("2026-10-02", { recallMillis: 4200, gradeMillis: 900 }),
      answer("2026-10-02", { grade: 1, recallMillis: 70_000, gradeMillis: 1000 }),
      answer("2026-10-01", { priorIntervalDays: 3, recallMillis: 5999, gradeMillis: 0 }),
      answer("2026-10-01", {
        cardUrl: "https://pod.example/i/decks/deck-1.ttl#c2",
        priorIntervalDays: 40,
        mode: "multiple-choice",
        recallMillis: 2000,
      }),
      answer("2026-10-01", {
        cardUrl: "https://pod.example/i/decks/deck-1.ttl#c3",
        priorIntervalDays: 2,
        grade: 2,
        recallMillis: 3000,
      }),
    ]);
    expect(summary).toEqual({
      days: [
        { studyDay: "2026-10-01", answers: 3, introduced: 0, reviews: 2, lapses: 1 },
        // The day's second answer to c1 repeats its first: no review.
        { studyDay: "2026-10-02", answers: 2, introduced: 1, reviews: 0, lapses: 0 },
      ],
      young: { reviews: 2, recalled: 1 },
      // A course answer's time is not a recall's, and one without its grading time is unknown.
      recallSeconds: { 5: 2, 60: 1 },
    });
  });
});

describe("the today strip's figures", () => {
  it("are the year's statistics', the median off by half a second at most", () => {
    // The last day of a long month: the twelve months begin before the activity calendar's 52 weeks.
    for (const today of ["2026-10-23", "2026-11-01", "2026-03-02", "2026-03-31"]) {
      const given = yearOfStudy(today);
      // As getStatistics reads "12m": the range from the first of the month eleven months back,
      // with the calendar's weeks for the figures up to today.
      const [year, month] = today.split("-").map(Number);
      const first = new Date(Date.UTC(year!, month! - 12, 1)).toISOString().slice(0, 10);
      const from = first < calendarStartOf(today) ? first : calendarStartOf(today);
      const statistics = statisticsOf(
        given.filter((one) => one.studyDay >= from),
        today,
        first,
      );
      const figures = todayFiguresOf(
        summariesOf(given.filter((one) => one.studyDay >= `${from.slice(0, 7)}-01`)),
        today,
        first,
      );
      expect(todayOf(figures)).toEqual(todayOf(statistics));
      expect(figures.days).toEqual(statistics.recentDays.map(({ repeats: _, ...day }) => day));
      expect(figures.streaks).toEqual(statistics.streaks);
      expect(figures.week).toEqual(statistics.week);
      expect(figures.young).toEqual(statistics.retention.young);
      expect(
        Math.abs(figures.medianAnswerMs! - statistics.studyTime.medianAnswerMs!),
      ).toBeLessThanOrEqual(500);
    }
  });

  it("welcome a learner back as statisticsOf does before the day's first answer", () => {
    const given = [
      answer("2026-09-29"),
      answer("2026-09-30"),
      answer("2026-10-01"),
      answer("2026-10-02"),
    ];
    const figures = todayFiguresOf(summariesOf(given), "2026-10-03", "2025-11-01");
    expect(todayOf(figures)).toBeNull();
    expect(welcomeBackOf(figures)).toEqual(welcomeBackOf(statisticsOf(given, "2026-10-03")));
    expect(welcomeBackOf(figures)).toMatchObject({ streak: 4, longestStreak: 4 });
  });

  it("take each recall time as the middle of its second, and one of the cap or more as the cap", () => {
    const timed = (recallMillis: number) => answer("2026-10-01", { recallMillis, gradeMillis: 0 });
    // statisticsOf's medians: 4100 ms; (4100 + 6900) / 2 = 5500 ms; 61 000 ms.
    expect(
      todayFiguresOf([monthSummaryOf([timed(4100)])], "2026-10-01", "2025-11-01").medianAnswerMs,
    ).toBe(4500);
    expect(
      todayFiguresOf(
        [monthSummaryOf([timed(4100)]), monthSummaryOf([timed(6900)])],
        "2026-10-01",
        "2025-11-01",
      ).medianAnswerMs,
    ).toBe(5500);
    expect(
      todayFiguresOf(
        [monthSummaryOf([timed(61_000), timed(90_000), timed(1000)])],
        "2026-10-01",
        "2025-11-01",
      ).medianAnswerMs,
    ).toBe(60_000);
  });

  it("leave out of recall and the median the months before the range, which only the calendar's weeks take in", () => {
    const before = monthSummaryOf([
      answer("2025-10-29", {
        priorIntervalDays: 3,
        grade: 1,
        recallMillis: 30_000,
        gradeMillis: 0,
      }),
    ]);
    const figures = todayFiguresOf([before], "2026-10-01", "2025-11-01");
    expect(figures.days.map((day) => day.studyDay)).toEqual(["2025-10-29"]);
    expect(figures.young).toEqual({ reviews: 0, recalled: 0 });
    expect(figures.medianAnswerMs).toBeNull();
    // And of the days, those before the calendar's first too.
    expect(todayFiguresOf([before], "2026-11-01", "2025-12-01").days).toEqual([]);
  });

  it("keep a summary to its shape, whatever answers it is made of", () => {
    expect(
      monthSummaryOf([
        answer("2026-10-01", { recallMillis: -5000, gradeMillis: 0 }),
        answer("2026-10-1", { cardUrl: "https://pod.example/i/decks/deck-1.ttl#c2" }),
      ]),
    ).toEqual({
      days: [{ studyDay: "2026-10-01", answers: 1, introduced: 1, reviews: 0, lapses: 0 }],
      young: { reviews: 0, recalled: 0 },
      recallSeconds: { 0: 1 },
    });
  });

  it("take nothing of a month without a study day, as of a document left empty", () => {
    const timed = answer("2026-10-01", { recallMillis: 4100, gradeMillis: 0 });
    const figures = todayFiguresOf(
      [
        { days: [], young: { reviews: 3, recalled: 1 }, recallSeconds: { 20: 5 } },
        monthSummaryOf([timed]),
      ],
      "2026-10-01",
      "2025-11-01",
    );
    expect(figures.young).toEqual({ reviews: 0, recalled: 0 });
    expect(figures.medianAnswerMs).toBe(4500);
  });

  it("know no median while no recall time was recorded, nor any figure without a month", () => {
    expect(
      todayFiguresOf(summariesOf([answer("2026-10-01")]), "2026-10-01", "2025-11-01")
        .medianAnswerMs,
    ).toBe(null);
    expect(todayFiguresOf([], "2026-10-01", "2025-11-01")).toEqual({
      today: "2026-10-01",
      days: [],
      streaks: { current: 0, longest: 0 },
      week: statisticsOf([], "2026-10-01").week,
      young: { reviews: 0, recalled: 0 },
      medianAnswerMs: null,
    });
  });

  it("are kept in the digest by month document, those no longer looked back over dropped", () => {
    const stored = {
      document: "https://pod.example/i/history/2026-09.ttl",
      version: '"v1"',
      summary: monthSummaryOf([answer("2026-09-01")]),
    };
    const digest = withMonthSummaries(
      { ...emptyDigest(), months: { "https://pod.example/i/history/2025-09.ttl": stored } },
      { [stored.document]: stored },
    );
    expect(digest.months).toEqual({ [stored.document]: stored });
  });
});
