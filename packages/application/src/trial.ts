import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "@solid-memo/domain/preferences";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { TRIAL_INSTANCE_URL, TRIAL_SESSION } from "@solid-memo/domain/release/trial";
import type { GuestPod } from "./ports";
import type { UseCases } from "./useCases";

/**
 * Test-playing a draft (docs/studio.md, The trial): the draft is played
 * as a learner plays a release, with the same use cases, but over a pod
 * of its own, kept in memory, so nothing the learner does in it reaches
 * the user's pod.
 */

/**
 * A new trial's pod, for one draft: the use cases over it (whose
 * library is the draft alone), and the pod, to start. Each is a pod of
 * its own, empty.
 */
export interface TrialSandbox {
  useCases: UseCases;
  pod: GuestPod;
}

/** A trial under way: its use cases, and the instance and deck the draft is played in. */
export interface Trial {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
}

/** A trial opened, or the problems that keep the draft from being played (trialProblems). */
export type TrialOpening = { ok: true; trial: Trial } | { ok: false; problems: ReleaseProblem[] };

/**
 * Start a trial of the draft in the sandbox, a draft that can be played
 * (trialProblems): its pod started, an instance made in it as a guest's
 * is (its meta document and its catalogue), its preferences new ones but
 * for the answer scale and the hour the day rolls over, which are the
 * user's (`prefs`), then the draft started as a course, or imported as a
 * deck, as the library's releases are.
 */
export async function startTrial(sandbox: TrialSandbox, draft: ReleaseDraft, prefs: StudyPreferences): Promise<Trial> {
  const { useCases, pod } = sandbox;
  await pod.start();
  const instance = await useCases.createInstance(TRIAL_SESSION, { containerUrl: TRIAL_INSTANCE_URL, name: "Trial", registrationTarget: "private" });
  await useCases.savePreferences(instance.url, { ...DEFAULT_PREFERENCES, answerScale: prefs.answerScale, dayBoundaryHour: prefs.dayBoundaryHour });
  const offered = draftLibraryDeck(draft);
  const deck = draft.course ? await useCases.startCourse(instance.url, offered) : await useCases.importLibraryDeck(instance.url, offered);
  return { useCases, instance, deck };
}
