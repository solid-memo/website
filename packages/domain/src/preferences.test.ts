// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, effectiveAnswerScale } from "./preferences";

describe("effectiveAnswerScale", () => {
  it("is the stored scale under SM-2", () => {
    expect(effectiveAnswerScale(DEFAULT_PREFERENCES)).toBe("sm2");
    expect(effectiveAnswerScale({ ...DEFAULT_PREFERENCES, answerScale: "minimal" })).toBe(
      "minimal",
    );
  });

  it("is always the four buttons under FSRS-6", () => {
    expect(effectiveAnswerScale({ ...DEFAULT_PREFERENCES, scheduler: "fsrs6" })).toBe("minimal");
  });
});
