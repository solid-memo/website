// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { answerIdOf, isRecalled, monthOfStudyDay, shiftStudyDay } from "./answer";

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

  it("remember the card from grade 3 up", () => {
    expect(isRecalled({ grade: 3 })).toBe(true);
    expect(isRecalled({ grade: 2 })).toBe(false);
  });
});
