// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MAX_RESPONSE_MILLIS, type Answer } from "./answer";
import { answerFromRecord, answerToRecord } from "./answerRecord";
import { MAX_INTERVAL_DAYS } from "./sm2";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const first: Answer = {
  id: "answer-1",
  deckUrl: "https://pod.example/i/catalog.ttl#deck-1",
  cardUrl: "https://pod.example/i/decks/deck-1.ttl#se",
  direction: "front-to-back",
  grade: 4,
  answeredAt: "2026-10-03T08:15:30.123Z",
  studyDay: "2026-10-03",
  nextIntervalDays: 1,
};

describe("answer records", () => {
  it("name the direction by its concept and leave out the prior interval of a first answer", () => {
    expect(answerToRecord(first)).toEqual({
      deck: first.deckUrl,
      card: first.cardUrl,
      direction: `${SM}frontToBack`,
      grade: 4,
      answeredAt: first.answeredAt,
      studyDay: "2026-10-03",
      nextIntervalDays: 1,
    });
  });

  it("read back what was written, the id from the subject", () => {
    const review: Answer = {
      ...first,
      direction: "back-to-front",
      priorIntervalDays: 6,
      nextIntervalDays: 15,
    };
    expect(answerFromRecord("answer-1", answerToRecord(review))).toEqual(review);
    expect(answerFromRecord("answer-1", answerToRecord(first))).toEqual(first);
  });

  it("name how a course answer was given by its concept, and the wrong option chosen; both read back", () => {
    const chosen: Answer = {
      ...first,
      grade: 1,
      mode: "multiple-choice",
      chosenDistractor: "https://pod.example/i/decks/deck-1.ttl#se-d1",
    };
    expect(answerToRecord(chosen)).toMatchObject({
      mode: `${SM}multipleChoice`,
      chosenDistractor: chosen.chosenDistractor,
    });
    expect(answerFromRecord("answer-1", answerToRecord(chosen))).toEqual(chosen);
    const recalled: Answer = { ...first, mode: "recall" };
    expect(answerToRecord(recalled)).toMatchObject({ mode: `${SM}recall` });
    expect(answerFromRecord("answer-1", answerToRecord(recalled))).toEqual(recalled);
  });

  it("carry the response times, the day the prompt was due and the device's offset from UTC, each read back", () => {
    const timed: Answer = {
      ...first,
      priorIntervalDays: 6,
      nextIntervalDays: 15,
      recallMillis: 2_400,
      gradeMillis: 900,
      priorDue: "2026-10-01",
      utcOffsetMinutes: -300,
    };
    expect(answerToRecord(timed)).toMatchObject({
      recallMillis: 2_400,
      gradeMillis: 900,
      priorDue: "2026-10-01",
      utcOffsetMinutes: -300,
    });
    expect(answerFromRecord("answer-1", answerToRecord(timed))).toEqual(timed);
    // Each is optional: a course answer is timed but not graded by the learner.
    const { gradeMillis: _grade, priorDue: _due, ...chosen } = timed;
    expect(answerToRecord(chosen)).not.toHaveProperty("gradeMillis");
    expect(answerFromRecord("answer-1", answerToRecord(chosen))).toEqual(chosen);
  });

  it("read the numbers bounded: an answer out of its shape is none, an interval beyond the cap kept, a time or offset out of range left out", () => {
    const record = answerToRecord({ ...first, priorIntervalDays: 6 });
    for (const grade of [-1, 6, 2.5, Infinity])
      expect(answerFromRecord("answer-1", { ...record, grade })).toBeNull();
    const digits = Number("9".repeat(400));
    for (const days of [-1, 1.5, 2 ** 53, digits, Infinity, -Infinity]) {
      expect(answerFromRecord("answer-1", { ...record, nextIntervalDays: days })).toBeNull();
      expect(answerFromRecord("answer-1", { ...record, priorIntervalDays: days })).toBeNull();
    }
    for (const days of [MAX_INTERVAL_DAYS + 1, 40_000, Number.MAX_SAFE_INTEGER]) {
      const old = { ...first, priorIntervalDays: days, nextIntervalDays: days };
      expect(answerFromRecord("answer-1", answerToRecord(old))).toEqual(old);
    }
    const edges = {
      ...first,
      grade: 0,
      priorIntervalDays: MAX_INTERVAL_DAYS,
      nextIntervalDays: 0,
      recallMillis: 0,
      gradeMillis: MAX_RESPONSE_MILLIS,
      utcOffsetMinutes: -840,
    } as const;
    expect(answerFromRecord("answer-1", answerToRecord(edges))).toEqual(edges);
    expect(answerFromRecord("answer-1", { ...record, utcOffsetMinutes: 840 })).toMatchObject({
      utcOffsetMinutes: 840,
    });
    const { recallMillis: _r, gradeMillis: _g, utcOffsetMinutes: _u, ...untimed } = edges;
    for (const millis of [-1, MAX_RESPONSE_MILLIS + 1, 0.5, Infinity, -Infinity])
      for (const minutes of [-841, 841, 0.5, Infinity])
        expect(
          answerFromRecord("answer-1", {
            ...answerToRecord(edges),
            recallMillis: millis,
            gradeMillis: millis,
            utcOffsetMinutes: minutes,
          }),
        ).toEqual(untimed);
  });
});
