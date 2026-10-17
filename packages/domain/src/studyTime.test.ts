// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import {
  answersByHour,
  ANSWER_CAP_MS,
  estimateStudyTime,
  expectedTimeToday,
  firstTimedOf,
  hasStudyTime,
  recordedTimeOf,
  SESSION_GAP_MS,
} from "./studyTime";
import { growth } from "./testing/growth";

let n = 0;
/** A recalled answer given `seconds` after 10:00 UTC on `studyDay`. */
function answer(studyDay: string, seconds: number, extra: Partial<Answer> = {}): Answer {
  n += 1;
  return {
    id: `answer-${n}`,
    deckUrl: "https://pod.example/i/catalog.ttl#deck-1",
    cardUrl: `https://pod.example/i/decks/deck-1.ttl#c${n}`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: new Date(Date.parse(`${studyDay}T10:00:00.000Z`) + seconds * 1000).toISOString(),
    studyDay,
    nextIntervalDays: 1,
    ...extra,
  };
}

describe("estimateStudyTime", () => {
  it("counts the pauses within a session, capped, and gives a session's first answer its median", () => {
    // Given out of order: the answers are taken by the time they were given.
    const time = estimateStudyTime([
      answer("2026-10-01", 30),
      answer("2026-10-01", 0),
      answer("2026-10-01", 10),
      // Two minutes away counts as one.
      answer("2026-10-01", 150),
    ]);
    // Pauses of 10, 20 and 60 s: the first answer takes their median, 20 s.
    expect(time).toEqual({
      answers: 4,
      sessions: 1,
      ms: 110_000,
      medianAnswerMs: 20_000,
      days: [{ studyDay: "2026-10-01", answers: 4, sessions: 1, ms: 110_000 }],
      recorded: null,
    });
    expect(ANSWER_CAP_MS).toBe(60_000);
  });

  it("begins a session after a long pause, gives an answer alone the median of all, and counts each on its day", () => {
    const gap = SESSION_GAP_MS / 1000;
    const time = estimateStudyTime([
      answer("2026-10-01", 0),
      answer("2026-10-01", 10),
      answer("2026-10-01", 30),
      answer("2026-10-01", 30 + gap),
      // Late at night, past the day's boundary: the session counts on the day it began.
      answer("2026-10-02", 30 + 2 * gap, { studyDay: "2026-10-01" }),
      answer("2026-10-02", 30 + 2 * gap + 8, { studyDay: "2026-10-02" }),
    ]);
    // Pauses of 10, 20 and 8 s: a median of 10 s.
    expect(time.medianAnswerMs).toBe(10_000);
    expect(time.sessions).toBe(3);
    expect(time.days).toEqual([
      // 15 s first (its session's median), 10, 20; then 10 alone.
      { studyDay: "2026-10-01", answers: 5, sessions: 3, ms: 63_000 },
      { studyDay: "2026-10-02", answers: 1, sessions: 0, ms: 8_000 },
    ]);
    expect(time.ms).toBe(71_000);
  });

  it("leaves course answers out, and counts no time while every session is one answer", () => {
    const gap = SESSION_GAP_MS / 1000;
    expect(
      estimateStudyTime([
        answer("2026-10-01", 0),
        answer("2026-10-01", 5, { mode: "multiple-choice", grade: 3 }),
        answer("2026-10-01", gap),
      ]),
    ).toEqual({
      answers: 2,
      sessions: 2,
      ms: 0,
      medianAnswerMs: null,
      days: [{ studyDay: "2026-10-01", answers: 2, sessions: 2, ms: 0 }],
      recorded: null,
    });
    expect(estimateStudyTime([])).toEqual({
      answers: 0,
      sessions: 0,
      ms: 0,
      medianAnswerMs: null,
      days: [],
      recorded: null,
    });
  });

  it("counts the times recorded from the first answer with one, in courses too, and estimates the answers before", () => {
    const gap = SESSION_GAP_MS / 1000;
    const before = [answer("2026-10-01", 0), answer("2026-10-01", 10), answer("2026-10-01", 30)];
    const recorded = [
      // A long time to recall: the time recorded counts, not the pause, capped, before it.
      answer("2026-10-02", 0, { recallMillis: 90_000, gradeMillis: 2_000 }),
      answer("2026-10-02", 100, { recallMillis: 4_000, gradeMillis: 1_000 }),
      answer("2026-10-02", 110, { mode: "multiple-choice", grade: 3, recallMillis: 6_000 }),
      // Unknown: given by a tab that did not record times, or graded after ten minutes away.
      answer("2026-10-02", 120),
      answer("2026-10-02", 130, { recallMillis: 5_000 }),
      // In a session of its own.
      answer("2026-10-02", 130 + gap, { recallMillis: 7_000, gradeMillis: 1_000 }),
    ];
    const time = estimateStudyTime([...recorded, ...before]);
    // Before: pauses of 10 and 20 s, the first answer their median, 15 s.
    expect(time).toEqual({
      answers: 7,
      sessions: 3,
      ms: 45_000 + 92_000 + 5_000 + 6_000 + 8_000,
      // Of the recalled answers recorded: 92, 5 and 8 s.
      medianAnswerMs: 8_000,
      days: [
        { studyDay: "2026-10-01", answers: 3, sessions: 1, ms: 45_000 },
        { studyDay: "2026-10-02", answers: 4, sessions: 2, ms: 111_000 },
      ],
      recorded: { since: "2026-10-02", answers: 4, ms: 111_000, unknown: 2 },
    });
    expect(hasStudyTime(time)).toBe(true);
  });

  it("goes by the recorded times from the answer it is given on, and keeps the estimate's median without a recalled one recorded", () => {
    const course = answer("2026-10-02", 0, { mode: "multiple-choice", recallMillis: 6_000 });
    // Recorded from an answer not among these on: none is estimated, one without a time is unknown.
    const time = estimateStudyTime(
      [answer("2026-10-02", 5), course],
      answer("2026-09-01", 0, { recallMillis: 1 }),
    );
    expect(time).toMatchObject({
      answers: 1,
      ms: 6_000,
      medianAnswerMs: null,
      recorded: { since: "2026-09-01", answers: 1, ms: 6_000, unknown: 1 },
    });
    expect(hasStudyTime(time)).toBe(true);
    expect(
      estimateStudyTime([answer("2026-10-01", 0), answer("2026-10-01", 10), course]).medianAnswerMs,
    ).toBe(10_000);
    expect(hasStudyTime(estimateStudyTime([answer("2026-10-01", 0)]))).toBe(false);
    expect(
      hasStudyTime(estimateStudyTime([answer("2026-10-01", 0), answer("2026-10-01", 9)])),
    ).toBe(true);
  });

  it("grows about linearly with the answers", () => {
    const answers = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        answer(`2026-0${1 + Math.floor(i / 20_000)}-1${i % 9}`, i * 7 + (i % 50 === 0 ? 600 : 0)),
      );
    const ratio = growth(
      (count) => {
        const some = answers(count);
        return () => estimateStudyTime(some);
      },
      2_500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("recordedTimeOf and firstTimedOf", () => {
  it("time recalling and grading, a course answer recalling alone", () => {
    expect(recordedTimeOf(answer("2026-10-01", 0, { recallMillis: 3, gradeMillis: 2 }))).toBe(5);
    expect(recordedTimeOf(answer("2026-10-01", 0, { recallMillis: 3 }))).toBeUndefined();
    expect(recordedTimeOf(answer("2026-10-01", 0, { gradeMillis: 2 }))).toBeUndefined();
    expect(
      recordedTimeOf(answer("2026-10-01", 0, { mode: "multiple-choice", recallMillis: 3 })),
    ).toBe(3);
  });

  it("find the answer given first with a recorded time", () => {
    const first = answer("2026-10-01", 5, { recallMillis: 3 });
    expect(
      firstTimedOf([
        answer("2026-10-01", 9, { recallMillis: 3 }),
        answer("2026-10-01", 0),
        first,
        answer("2026-10-02", 0, { recallMillis: 3 }),
      ]),
    ).toBe(first);
    expect(firstTimedOf([answer("2026-10-01", 0)])).toBeUndefined();
  });
});

describe("expectedTimeToday", () => {
  it("times what is left and the reviews expected back, at the median answer", () => {
    expect(
      expectedTimeToday({
        reviews: 10,
        newCards: 5,
        young: { reviews: 4, recalled: 3 },
        medianAnswerMs: 8_000,
      }),
    ).toBe((10 + 5 + 2.5) * 8_000);
    // Before any young review, none is expected back.
    expect(
      expectedTimeToday({
        reviews: 10,
        newCards: 0,
        young: { reviews: 0, recalled: 0 },
        medianAnswerMs: 6_000,
      }),
    ).toBe(60_000);
  });

  it("is unknown without a median", () => {
    expect(
      expectedTimeToday({
        reviews: 3,
        newCards: 1,
        young: { reviews: 0, recalled: 0 },
        medianAnswerMs: null,
      }),
    ).toBeNull();
  });
});

describe("answersByHour", () => {
  it("counts the answers of each hour of the day where they are read", () => {
    // Given at 09:30 and 23:59 in this device's time zone, whatever it is.
    const at = (hour: number, minute: number) =>
      answer("2026-10-01", 0, { answeredAt: new Date(2026, 9, 1, hour, minute).toISOString() });
    const hours = answersByHour([at(9, 30), at(9, 5), at(23, 59)]);
    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(2);
    expect(hours[23]).toBe(1);
    expect(hours.reduce((sum, count) => sum + count, 0)).toBe(3);
  });
});
