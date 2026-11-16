// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { testWorkers } from "../vitest.shared.ts";

/** A laptop's WSL: many CPUs, little memory. */
const LAPTOP = { cpus: 24, memoryGb: 15 };

describe("testWorkers", () => {
  it("leaves CI to Vitest's default", () => {
    expect(testWorkers({ ci: "true", concurrency: undefined, ...LAPTOP })).toBeUndefined();
    expect(testWorkers({ ci: "1", concurrency: "4", cpus: 4, memoryGb: 16 })).toBeUndefined();
  });

  it("takes an empty CI as none", () => {
    expect(testWorkers({ ci: "", concurrency: "4", ...LAPTOP })).toBe(4);
  });

  it("holds each run to one worker when Turbo runs its ten tasks at once on little memory", () => {
    expect(testWorkers({ ci: undefined, concurrency: undefined, ...LAPTOP })).toBe(1);
  });

  it("gives each run more workers when Turbo runs fewer tasks", () => {
    expect(testWorkers({ ci: undefined, concurrency: "4", ...LAPTOP })).toBe(4);
    expect(testWorkers({ ci: undefined, concurrency: "1", ...LAPTOP })).toBe(21);
  });

  it("reads a percentage as a share of the CPUs", () => {
    // 25% of 24 CPUs: 6 tasks.
    expect(testWorkers({ ci: undefined, concurrency: "25%", ...LAPTOP })).toBe(2);
    // 1% of 24 CPUs: one task at least.
    expect(testWorkers({ ci: undefined, concurrency: "1%", ...LAPTOP })).toBe(21);
  });

  it("takes Turbo's default for a concurrency it can't read", () => {
    for (const concurrency of ["", " ", "0", "four", "4.5", "-2", "4x"]) {
      expect(testWorkers({ ci: undefined, concurrency, ...LAPTOP })).toBe(1);
    }
    expect(testWorkers({ ci: undefined, concurrency: " 4 ", ...LAPTOP })).toBe(4);
  });

  it("gives no more workers than Vitest's default, a CPU but one", () => {
    expect(testWorkers({ ci: undefined, concurrency: "1", cpus: 8, memoryGb: 64 })).toBe(7);
    expect(testWorkers({ ci: undefined, concurrency: "1", cpus: 1, memoryGb: 64 })).toBe(1);
  });

  it("gives one worker at least, however little memory there is", () => {
    expect(testWorkers({ ci: undefined, concurrency: "10", cpus: 24, memoryGb: 4 })).toBe(1);
  });
});
