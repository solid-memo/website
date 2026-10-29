// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  answerIdOf,
  isOfStudyMonth,
  isRecalled,
  MAX_RESPONSE_MILLIS,
  monthOfStudyDay,
  recordedResponseTimes,
  shiftStudyDay,
  utcOffsetMinutesAt,
} from "./answer";

describe("answers", () => {
  it("are named by their time and a random part", () => {
    expect(answerIdOf("2026-10-03T08:15:30.123Z", "k3f9qa")).toBe(
      "answer-20261003T081530123Z-k3f9qa",
    );
  });

  it("belong to the month of their study day", () => {
    expect(monthOfStudyDay("2026-10-31")).toBe("2026-10");
  });

  it("shift their study day by calendar days, across months and years", () => {
    expect(shiftStudyDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftStudyDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftStudyDay("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("shift their study day only within 0100-01-04 to 9999-12-31, so the days sort as text", () => {
    expect(shiftStudyDay("9999-12-31", 1)).toBe("9999-12-31");
    expect(shiftStudyDay("9999-12-30", 7)).toBe("9999-12-31");
    expect(shiftStudyDay("0100-01-04", -1)).toBe("0100-01-04");
    expect(shiftStudyDay("0100-01-05", -1)).toBe("0100-01-04");
    // The years 0 to 99 are years of their own, not 1900 to 1999.
    expect(shiftStudyDay("0050-06-01", 0)).toBe("0100-01-04");
    expect(shiftStudyDay("0099-12-31", 1)).toBe("0100-01-04");
  });

  it("are of the answer log's month of their study day, or a month a day away", () => {
    expect(isOfStudyMonth("2026-10-15", "2026-10")).toBe(true);
    expect(isOfStudyMonth("2026-09-30", "2026-10")).toBe(true);
    expect(isOfStudyMonth("2026-11-01", "2026-10")).toBe(true);
    expect(isOfStudyMonth("2026-09-29", "2026-10")).toBe(false);
    expect(isOfStudyMonth("2026-11-02", "2026-10")).toBe(false);
    expect(isOfStudyMonth("9999-12-31", "2026-10")).toBe(false);
    expect(isOfStudyMonth("9000-01-01", "2026-10")).toBe(false);
  });

  it("are of no month when their study day is outside the range shifting a day keeps in order", () => {
    // A day after the month's end would otherwise pass for one of the next month.
    expect(isOfStudyMonth("0099-12-31", "0100-01")).toBe(false);
    expect(isOfStudyMonth("0100-01-03", "0100-01")).toBe(false);
    expect(isOfStudyMonth("0100-01-04", "0100-01")).toBe(true);
    expect(isOfStudyMonth("9999-12-31", "9999-12")).toBe(true);
  });

  it("remember the card from grade 3 up", () => {
    expect(isRecalled({ grade: 3 })).toBe(true);
    expect(isRecalled({ grade: 2 })).toBe(false);
  });

  it("record their response times in whole milliseconds, up to ten minutes", () => {
    expect(recordedResponseTimes({ recallMillis: 1234.6, gradeMillis: 0 })).toEqual({
      recallMillis: 1235,
      gradeMillis: 0,
    });
    expect(recordedResponseTimes({ recallMillis: MAX_RESPONSE_MILLIS })).toEqual({
      recallMillis: MAX_RESPONSE_MILLIS,
    });
    expect(
      recordedResponseTimes({ recallMillis: MAX_RESPONSE_MILLIS + 1, gradeMillis: 900 }),
    ).toEqual({ gradeMillis: 900 });
    expect(recordedResponseTimes({ recallMillis: -1, gradeMillis: Number.NaN })).toEqual({});
    expect(recordedResponseTimes({})).toEqual({});
  });

  it("record the device's offset from UTC, east positive, never -0", () => {
    expect(Object.is(utcOffsetMinutesAt({ getTimezoneOffset: () => 0 } as Date), 0)).toBe(true);
    expect(utcOffsetMinutesAt({ getTimezoneOffset: () => -120 } as Date)).toBe(120);
  });
});
