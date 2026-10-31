// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  monthSummaryFromRecord,
  monthSummaryToRecord,
  receiptFromRecord,
  receiptToRecord,
  scheduleFromRecord,
  scheduleToRecord,
} from "./digestRecord";
import type { DocumentReceipt, StoredMonthSummary, StoredSchedule } from "./studyDigest";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

describe("the digest's records", () => {
  it("keeps a receipt as it is, with or without what it may say", () => {
    const full: DocumentReceipt = {
      document: "https://pod.example/d.ttl",
      version: '"v1"',
      conformedTo: "rules",
      latestFormat: true,
    };
    const bare: DocumentReceipt = { document: "https://pod.example/d.ttl", version: '"v1"' };
    for (const receipt of [full, bare])
      expect(receiptFromRecord(receiptToRecord(receipt))).toEqual(receipt);
    expect(receiptFromRecord({ ...receiptToRecord(bare), latestFormat: false })).toEqual(bare);
  });

  it('writes a schedule\'s prompts due by day as "YYYY-MM-DD count", in day order, leaving out empty days', () => {
    const stored: StoredSchedule = {
      deck: "https://pod.example/catalog.ttl#deck-1",
      cardsVersion: '"c"',
      reviewsVersion: "absent",
      schedule: {
        direction: "back-to-front",
        dayBoundaryHour: 4,
        scheduler: "fsrs6",
        dueByDay: { "2026-10-03": 1, "2026-09-30": 12, "2026-10-01": 0 },
        unreviewed: 5,
        studyDay: "2026-10-01",
        reviewedOnDay: 2,
        introducedOnDay: 1,
      },
    };
    const record = scheduleToRecord(stored);
    expect(record.dueOnDay).toEqual(["2026-09-30 12", "2026-10-03 1"]);
    expect(record.direction).toBe(`${SM}backToFront`);
    expect(record.scheduler).toBe(`${SM}fsrs6`);
    const { "2026-10-01": _empty, ...dueByDay } = stored.schedule.dueByDay;
    expect(scheduleFromRecord(record)).toEqual({
      ...stored,
      schedule: { ...stored.schedule, dueByDay },
    });
  });

  it('writes a month summary\'s days as "YYYY-MM-DD answers introduced reviews lapses" and its times as "seconds count"', () => {
    const stored: StoredMonthSummary = {
      document: "https://pod.example/history/2026-09.ttl",
      version: '"m"',
      summary: {
        days: [
          { studyDay: "2026-09-02", answers: 3, introduced: 1, reviews: 2, lapses: 0 },
          { studyDay: "2026-09-10", answers: 9, introduced: 0, reviews: 8, lapses: 2 },
        ],
        young: { reviews: 7, recalled: 6 },
        recallSeconds: { 12: 1, 3: 4, 60: 2 },
      },
    };
    const record = monthSummaryToRecord(stored);
    expect(record.days).toEqual(["2026-09-02 3 1 2 0", "2026-09-10 9 0 8 2"]);
    expect(record.recallSeconds).toEqual(["3 4", "12 1", "60 2"]);
    // A pod gives the values in any order.
    expect(monthSummaryFromRecord({ ...record, days: [...record.days].reverse() })).toEqual(stored);
    // A value not as the shape has it leaves the summary out, to be made again.
    expect(monthSummaryFromRecord({ ...record, days: ["2026-09-02 3 1 2"] })).toBeNull();
    expect(monthSummaryFromRecord({ ...record, recallSeconds: ["61 1"] })).toBeNull();
  });

  it("leaves out a month summary whose days are not days of its month, each once", () => {
    const record = monthSummaryToRecord({
      document: "https://pod.example/history/2026-09.ttl",
      version: '"m"',
      summary: {
        days: [{ studyDay: "2026-09-02", answers: 3, introduced: 1, reviews: 2, lapses: 0 }],
        young: { reviews: 0, recalled: 0 },
        recallSeconds: {},
      },
    });
    const read = (change: Partial<typeof record>) =>
      monthSummaryFromRecord({ ...record, ...change });
    // A day either side of the month is one of its answers given near midnight.
    const days = ["2026-08-31 1 0 0 0", "2026-09-30 1 0 0 0", "2026-10-01 1 0 0 0"];
    expect(read({ days })?.summary.days.map((day) => day.studyDay)).toEqual([
      "2026-08-31",
      "2026-09-30",
      "2026-10-01",
    ]);
    for (const day of ["2026-10-02", "2026-08-30", "2026-09-31", "2026-09-60", "2027-09-02"])
      expect(read({ days: [`${day} 1 0 0 0`] })).toBeNull();
    expect(read({ days: ["2026-09-02 1 0 0 0", "2026-09-02 2 0 0 0"] })).toBeNull();
    // Only the answer log's month documents are summarized.
    expect(read({ document: "https://pod.example/history/notes.ttl" })).toBeNull();
    for (const document of [
      "https://pod.example/evil/2026-09.ttl",
      "https://pod.example/2026-09.ttl",
      "https://pod.example/notes?at=/history/2026-09.ttl",
      "https://pod.example/history/2026-09.ttl?at=1",
      "https://pod.example/notes#/history/2026-09.ttl",
      "https://pod.example/history/2026-09.ttl#it",
    ])
      expect(read({ document })).toBeNull();
    // More days than a month has, each of them sound, are not read one by one.
    const many = Array.from({ length: 34 }, () => "2026-09-02 1 0 0 0");
    expect(read({ days: many })).toBeNull();
  });

  it("leaves out a month summary with a count past what a number holds exactly", () => {
    const record = monthSummaryToRecord({
      document: "https://pod.example/history/2026-09.ttl",
      version: '"m"',
      summary: { days: [], young: { reviews: 1, recalled: 1 }, recallSeconds: {} },
    });
    const read = (change: Partial<typeof record>) =>
      monthSummaryFromRecord({ ...record, ...change });
    const digits = (count: number) => "9".repeat(count);
    expect(read({ days: [`2026-09-02 ${digits(15)} ${digits(15)} 0 0`] })).not.toBeNull();
    expect(read({ days: [`2026-09-02 ${digits(16)} 0 0 0`] })).toBeNull();
    expect(read({ days: ["2026-09-02 1 0 0 ".concat(digits(400))] })).toBeNull();
    expect(read({ recallSeconds: [`3 ${digits(16)}`] })).toBeNull();
    for (const count of [Number.POSITIVE_INFINITY, -1, 2 ** 53, 0.5])
      expect(read({ youngReviews: count })).toBeNull();
    expect(read({ youngRecalled: -1 })).toBeNull();
  });
});
