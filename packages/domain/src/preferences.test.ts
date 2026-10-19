// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  effectiveAnswerScale,
  invitesToFsrs,
  NEW_INSTANCE_PREFERENCES,
} from "./preferences";

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

describe("the scheduler of an instance", () => {
  it("is SM-2 when none is stored, as it always was, and FSRS-6 for a new instance", () => {
    expect(DEFAULT_PREFERENCES.scheduler).toBe("sm2");
    expect(NEW_INSTANCE_PREFERENCES).toEqual({ ...DEFAULT_PREFERENCES, scheduler: "fsrs6" });
  });
});

describe("invitesToFsrs", () => {
  it("invites a learner on SM-2 who has not answered Not now", () => {
    expect(invitesToFsrs(DEFAULT_PREFERENCES)).toBe(true);
    expect(invitesToFsrs({ ...DEFAULT_PREFERENCES, schedulerInvitationDismissed: true })).toBe(
      false,
    );
  });

  it("invites nobody on FSRS-6", () => {
    expect(invitesToFsrs(NEW_INSTANCE_PREFERENCES)).toBe(false);
  });
});
