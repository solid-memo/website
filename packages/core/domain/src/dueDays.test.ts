// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { dueBefore, dueOn, dueThrough } from "./dueDays";

const dueByDay = Object.freeze({ "2026-11-20": 3, "2026-11-18": 1, "2026-11-19": 2 });

describe("the sums of a schedule's due days", () => {
  it("counts the prompts due on a day, before it and by it", () => {
    expect(dueOn(dueByDay, "2026-11-19")).toBe(2);
    expect(dueOn(dueByDay, "2026-11-21")).toBe(0);
    expect(dueBefore(dueByDay, "2026-11-18")).toBe(0);
    expect(dueBefore(dueByDay, "2026-11-19")).toBe(1);
    expect(dueBefore(dueByDay, "2026-11-30")).toBe(6);
    expect(dueThrough(dueByDay, "2026-11-19")).toBe(3);
    expect(dueThrough(dueByDay, "2026-11-17")).toBe(0);
  });

  it("takes no day from the prototype, and sums a schedule not frozen afresh", () => {
    const open: Record<string, number> = { "2026-11-18": 1 };
    expect(dueOn(open, "constructor")).toBe(0);
    expect(dueThrough(open, "2026-11-18")).toBe(1);
    open["2026-11-17"] = 4;
    expect(dueThrough(open, "2026-11-18")).toBe(5);
  });
});
