import type { Session } from "../session.ts";
import { courseProblems, readinessProblems } from "./courseRules.ts";
import type { ReleaseProblem } from "./problems.ts";
import { DCTERMS_NS, type ReleaseModel } from "./releaseModel.ts";

/**
 * Test-playing a draft in the Studio (docs/studio.md, The trial): the
 * draft is played in a pod of its own, kept in memory for the trial
 * alone, at an origin of its own. `.invalid` is reserved and never
 * resolves, so a trial URL that reached the network by mistake would
 * fail rather than go anywhere.
 */

/** Where a trial's pod lives: every trial URL starts with it. */
export const TRIAL_ORIGIN = "https://trial.solid-memo.invalid/";

/** The trial's learner, in a profile document of the trial's pod. */
export const TRIAL_WEBID = `${TRIAL_ORIGIN}profile/card#me`;

/** The trial's learner's session: no login. */
export const TRIAL_SESSION: Session = { webId: TRIAL_WEBID, guest: true };

/** The instance a trial is played in. */
export const TRIAL_INSTANCE_URL = `${TRIAL_ORIGIN}solid-memo/`;

/**
 * What keeps a draft from being played: the errors of its course's rules
 * (courseProblems), and of what a release needs (readinessProblems) the
 * player needs too, its title and each chapter's and step's fields. What
 * a release says of itself besides its title (its publisher, version,
 * series, distribution and theme) is the listing's, which the trial does
 * not show. None for a draft that can be played.
 */
export function trialProblems(model: ReleaseModel): ReleaseProblem[] {
  const outline = new Set([...model.chapters, ...model.steps].map((subject) => subject.iri));
  const needed = (problem: ReleaseProblem) =>
    outline.has(problem.subject) || (problem.subject === model.url && problem.field === `${DCTERMS_NS}title`);
  return [...courseProblems(model), ...readinessProblems(model).filter(needed)];
}
