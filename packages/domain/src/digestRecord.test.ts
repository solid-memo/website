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
});
