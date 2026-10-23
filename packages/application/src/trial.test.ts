// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import {
  courseDraft,
  deckDraft,
  DRAFT,
  playableCourseDraft,
} from "@solid-memo/domain/testing/releaseDraft";
import type { TrialUseCases } from "./trial";
import { TRIAL_INSTANCE_URL, TRIAL_SESSION } from "@solid-memo/domain/release/trial";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { instance, deck, makeDeps } from "./testing/fakePorts";

describe("openTrial", () => {
  const trialInstance: Instance = { url: TRIAL_INSTANCE_URL, name: "Trial" };
  function sandbox() {
    const trialUseCases = {
      createInstance: vi.fn(async () => trialInstance),
      switchScheduler: vi.fn(async () => undefined),
      startCourse: vi.fn(async () => deck),
      importLibraryDeck: vi.fn(async () => deck),
    };
    const pod = { exists: vi.fn(), start: vi.fn(async () => undefined), discard: vi.fn() };
    return { useCases: trialUseCases as unknown as TrialUseCases, pod, trialUseCases };
  }
  function withSandbox() {
    const deps = makeDeps();
    const made = sandbox();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: {
        ...DEFAULT_PREFERENCES,
        answerScale: "minimal",
        dayBoundaryHour: 2,
        newCardsPerDay: 1,
        scheduler: "fsrs6",
        desiredRetention: 0.85,
      },
      formatVersion: 5,
    });
    const trialSandbox = vi.fn(() => made);
    return { deps, made, trialSandbox, useCases: createUseCases({ ...deps, trialSandbox }) };
  }

  it("starts a course draft in a sandbox of its own, as a learner with the user's answer scale, study day and scheduler", async () => {
    const { made, trialSandbox, useCases } = withSandbox();
    const draft = playableCourseDraft();
    const opened = await useCases.openTrial(draft, instance.url);
    expect(opened).toEqual({
      ok: true,
      trial: { useCases: made.useCases, instance: trialInstance, deck },
    });
    expect(trialSandbox).toHaveBeenCalledWith(draft);
    expect(made.pod.start).toHaveBeenCalled();
    expect(made.trialUseCases.createInstance).toHaveBeenCalledWith(TRIAL_SESSION, {
      containerUrl: TRIAL_INSTANCE_URL,
      name: "Trial",
      registrationTarget: "private",
    });
    expect(made.trialUseCases.switchScheduler).toHaveBeenCalledWith(TRIAL_INSTANCE_URL, {
      ...DEFAULT_PREFERENCES,
      answerScale: "minimal",
      dayBoundaryHour: 2,
      scheduler: "fsrs6",
      desiredRetention: 0.85,
    });
    expect(made.trialUseCases.startCourse).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT, isCourse: true }),
    );
    expect(made.trialUseCases.importLibraryDeck).not.toHaveBeenCalled();
  });

  it("imports a deck draft as a library deck", async () => {
    const { made, useCases } = withSandbox();
    await useCases.openTrial(deckDraft(), instance.url);
    expect(made.trialUseCases.importLibraryDeck).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT }),
    );
    expect(made.trialUseCases.startCourse).not.toHaveBeenCalled();
  });

  it("refuses a draft that cannot be played, with what keeps it from it, making nothing", async () => {
    const { trialSandbox, useCases } = withSandbox();
    const opened = await useCases.openTrial(courseDraft(), instance.url);
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.problems.map((problem) => problem.code)).toEqual([
      "fewDistractors",
      "fewDistractors",
      "chapterWithoutStep",
    ]);
    expect(trialSandbox).not.toHaveBeenCalled();
  });
});
