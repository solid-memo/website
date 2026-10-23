// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { GuestPod } from "./ports";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { InstanceUseCases } from "./instances";
import type { StudyUseCases } from "./study";
import type { MistakeReportUseCases } from "./mistakeReports";
import type { LibraryUseCases } from "./library";
import type { CourseUseCases } from "./courses";
import type { PreferenceUseCases } from "./preferences";
import type { PreferenceStore } from "./preferenceStore";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "@solid-memo/domain/preferences";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { TRIAL_INSTANCE_URL, TRIAL_SESSION, trialProblems } from "@solid-memo/domain/release/trial";

/**
 * Test-playing a draft (docs/studio.md, The trial): the draft is played
 * as a learner plays a release, with the same use cases, but over a pod
 * of its own, kept in memory, so nothing the learner does in it reaches
 * the user's pod.
 */

/**
 * The use cases a trial is played with: its instance made, its
 * preferences set, the draft started as a course or imported as a deck,
 * then studied as a learner studies a release, a mistake in it reported
 * nowhere (createTrialUseCases, in the composition root).
 */
export type TrialUseCases = InstanceUseCases &
  PreferenceUseCases &
  CourseUseCases &
  LibraryUseCases &
  StudyUseCases &
  MistakeReportUseCases;

/**
 * A new trial's pod, for one draft: the use cases over it (whose
 * library is the draft alone), and the pod, to start. Each is a pod of
 * its own, empty.
 */
export interface TrialSandbox {
  useCases: TrialUseCases;
  pod: GuestPod;
}

/** A trial under way: its use cases, and the instance and deck the draft is played in. */
export interface Trial {
  useCases: TrialUseCases;
  instance: Instance;
  deck: Deck;
}

/** A trial opened, or the problems that keep the draft from being played (trialProblems). */
export type TrialOpening = { ok: true; trial: Trial } | { ok: false; problems: ReleaseProblem[] };

/**
 * Start a trial of the draft in the sandbox, a draft that can be played
 * (trialProblems): its pod started, an instance made in it as a guest's
 * is (its meta document and its catalog), its preferences new ones but
 * for the answer scale, the hour the day rolls over, the scheduler and
 * the retention it aims at, which are the user's (`prefs`), then the draft started as a course, or imported as a
 * deck, as the library's releases are.
 */
export async function startTrial(
  sandbox: TrialSandbox,
  draft: ReleaseDraft,
  prefs: StudyPreferences,
): Promise<Trial> {
  const { useCases, pod } = sandbox;
  await pod.start();
  const instance = await useCases.createInstance(TRIAL_SESSION, {
    containerUrl: TRIAL_INSTANCE_URL,
    name: "Trial",
    registrationTarget: "private",
  });
  // Through switchScheduler, as only it sets the scheduler: the sandbox has no deck to switch yet.
  await useCases.switchScheduler(instance.url, {
    ...DEFAULT_PREFERENCES,
    answerScale: prefs.answerScale,
    dayBoundaryHour: prefs.dayBoundaryHour,
    scheduler: prefs.scheduler,
    desiredRetention: prefs.desiredRetention,
  });
  const offered = draftLibraryDeck(draft);
  const deck = draft.course
    ? await useCases.startCourse(instance.url, offered)
    : await useCases.importLibraryDeck(instance.url, offered);
  return { useCases, instance, deck };
}

export interface TrialOpeningUseCases {
  /**
   * Test-play the draft (docs/studio.md, The trial), for the user of the
   * instance at `instanceUrl`: in a new sandbox of its own (trial.ts),
   * kept in memory, as a learner with the instance's answer scale and
   * study day. The trial, with the use cases to play it with; or, for a
   * draft that cannot be played, the problems that keep it from it
   * (trialProblems), with nothing made.
   */
  openTrial(draft: ReleaseDraft, instanceUrl: string): Promise<TrialOpening>;
}

/**
 * Test-playing a draft (docs/studio.md, The trial), each trial in a new
 * sandbox of its own, as a learner with the user's answer scale, study
 * day and scheduler.
 */
export function createTrialOpeningUseCases({
  trialSandbox,
  preferenceStore,
}: {
  trialSandbox: (draft: ReleaseDraft) => TrialSandbox;
  preferenceStore: Pick<PreferenceStore, "get">;
}): TrialOpeningUseCases {
  return {
    async openTrial(draft, instanceUrl) {
      const problems = trialProblems(draftReleaseModel(draft));
      if (problems.length > 0) return { ok: false, problems };
      const prefs = await preferenceStore.get(instanceUrl);
      return { ok: true, trial: await startTrial(trialSandbox(draft), draft, prefs) };
    },
  };
}
