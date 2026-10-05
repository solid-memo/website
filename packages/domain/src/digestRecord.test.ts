import { describe, expect, it } from "vitest";
import { receiptFromRecord, receiptToRecord, scheduleFromRecord, scheduleToRecord } from "./digestRecord";
import type { DocumentReceipt, StoredSchedule } from "./studyDigest";

const SM = "https://pod.solid-memo.com/vocab/v1#";

describe("the digest's records", () => {
  it("keeps a receipt as it is, with or without what it may say", () => {
    const full: DocumentReceipt = { document: "https://pod.example/d.ttl", version: '"v1"', conformedTo: "rules", latestFormat: true };
    const bare: DocumentReceipt = { document: "https://pod.example/d.ttl", version: '"v1"' };
    for (const receipt of [full, bare]) expect(receiptFromRecord(receiptToRecord(receipt))).toEqual(receipt);
    expect(receiptFromRecord({ ...receiptToRecord(bare), latestFormat: false })).toEqual(bare);
  });

  it("writes a schedule's prompts due by day as \"YYYY-MM-DD count\", in day order, leaving out empty days", () => {
    const stored: StoredSchedule = {
      deck: "https://pod.example/catalog.ttl#deck-1",
      cardsVersion: '"c"',
      reviewsVersion: "absent",
      schedule: {
        direction: "back-to-front",
        dayBoundaryHour: 4,
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
    const { "2026-10-01": _empty, ...dueByDay } = stored.schedule.dueByDay;
    expect(scheduleFromRecord(record)).toEqual({ ...stored, schedule: { ...stored.schedule, dueByDay } });
  });
});
