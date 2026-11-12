// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBudget } from "./readBudget";

const later = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("readBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives what a read gives within the budget, and holds no timer between reads", async () => {
    const budget = readBudget(1_000);
    const read = budget.spend("spent", () => later(400, "read"));
    await vi.advanceTimersByTimeAsync(400);
    await expect(read).resolves.toBe("read");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("runs its clock only while one of its reads is under way, however long the time between them", async () => {
    const budget = readBudget(1_000);
    const first = budget.spend("spent", () => later(600, "first"));
    await vi.advanceTimersByTimeAsync(600);
    await expect(first).resolves.toBe("first");
    // Long after, the 400 left still cover a read of 300, and two of 300 at once.
    await vi.advanceTimersByTimeAsync(100_000);
    const both = Promise.all([
      budget.spend("spent", () => later(300, "second")),
      budget.spend("spent", () => later(300, "third")),
    ]);
    await vi.advanceTimersByTimeAsync(300);
    await expect(both).resolves.toEqual(["second", "third"]);
    // The 100 left run out within the next read: it is given up on, and none is started after.
    const given = budget.spend("spent", () => later(300, "fourth"));
    await vi.advanceTimersByTimeAsync(100);
    await expect(given).resolves.toBe("spent");
    const started = vi.fn(async () => "fifth");
    await expect(budget.spend("spent", started)).resolves.toBe("spent");
    expect(started).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails as its read does within the budget", async () => {
    const budget = readBudget(1_000);
    await expect(
      budget.spend("spent", async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(vi.getTimerCount()).toBe(0);
  });
});
