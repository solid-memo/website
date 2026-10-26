// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  effectiveAnswerScale,
  invitesToFsrs,
  keptPalette,
  NEW_INSTANCE_PREFERENCES,
  shownPalette,
  skipsConnectedScreen,
} from "./preferences";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
/** A palette this version does not know: one of the user's own. */
const OWN_PALETTE = "https://pod.example/solid-memo/a/palettes.ttl#mine";

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

describe("skipsConnectedScreen", () => {
  it("shows the screen to a learner with no instances, where nothing can say to skip it", () => {
    expect(skipsConnectedScreen([])).toBe(false);
  });

  it("shows it while one instance says to", () => {
    expect(skipsConnectedScreen([false])).toBe(false);
    expect(skipsConnectedScreen([true, false])).toBe(false);
  });

  it("skips it when every instance says so", () => {
    expect(skipsConnectedScreen([true])).toBe(true);
    expect(skipsConnectedScreen([true, true])).toBe(true);
  });
});

describe("the palette of preferences", () => {
  it("is the one they hold, Standard by default", () => {
    expect(shownPalette(DEFAULT_PREFERENCES)).toBe("standard");
    expect(shownPalette({ palette: `${SM}highContrastPalette` })).toBe("high-contrast");
  });

  it("shows one this version does not know as Standard", () => {
    expect(shownPalette({ palette: OWN_PALETTE })).toBe("standard");
  });

  it("keeps the one held while it shows as the one shown, so an unknown one outlives a save", () => {
    expect(keptPalette({ palette: OWN_PALETTE }, "standard")).toBe(OWN_PALETTE);
    expect(keptPalette({ palette: `${SM}parchmentPalette` }, "parchment")).toBe(
      `${SM}parchmentPalette`,
    );
  });

  it("replaces one of the user's own with the built-in palette chosen", () => {
    const isOwn = (iri: string) => iri === OWN_PALETTE;
    expect(keptPalette({ palette: OWN_PALETTE }, "standard", isOwn)).toBe(`${SM}standardPalette`);
    expect(keptPalette({ palette: `${SM}parchmentPalette` }, "parchment", isOwn)).toBe(
      `${SM}parchmentPalette`,
    );
  });

  it("takes the concept of another palette shown", () => {
    expect(keptPalette({ palette: OWN_PALETTE }, "color-vision")).toBe(`${SM}colorVisionPalette`);
    expect(keptPalette(DEFAULT_PREFERENCES, "high-contrast")).toBe(`${SM}highContrastPalette`);
  });
});
