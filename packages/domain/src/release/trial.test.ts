import { describe, expect, it } from "vitest";
import { courseDraft, deckDraft, DRAFT, of, playableCourseDraft } from "../testing/releaseDraft";
import { draftReleaseModel } from "./draftModel";
import { TRIAL_INSTANCE_URL, TRIAL_ORIGIN, TRIAL_SESSION, trialProblems } from "./trial";

describe("trial", () => {
  it("plays in a pod of its own, at an origin that never resolves", () => {
    expect(TRIAL_ORIGIN.endsWith(".invalid/")).toBe(true);
    expect(TRIAL_SESSION.webId.startsWith(TRIAL_ORIGIN)).toBe(true);
    expect(TRIAL_INSTANCE_URL.startsWith(TRIAL_ORIGIN)).toBe(true);
  });
});

describe("trialProblems", () => {
  it("finds none in a course that can be played, nor in a deck, whatever their listing lacks", () => {
    const course = playableCourseDraft();
    expect(trialProblems(draftReleaseModel({ ...course, root: { ...course.root, version: undefined, distribution: [] } }))).toEqual([]);
    expect(trialProblems(draftReleaseModel(deckDraft()))).toEqual([]);
  });

  it("finds the course's errors, and what its title, chapters and steps lack", () => {
    const draft = courseDraft();
    const problems = trialProblems(
      draftReleaseModel({
        ...draft,
        root: { ...draft.root, title: { sv: "Solid" } },
        steps: draft.steps.map((step, at) => (at === 0 ? { ...step, data: { ...step.data, theory: {} } } : step)),
      }),
    );
    expect(problems.map((problem) => [problem.code, problem.subject])).toEqual([
      ["fewDistractors", of("q-a-2a")],
      ["fewDistractors", of("q-a-r01")],
      ["chapterWithoutStep", of("ch-b")],
      ["missingLanguage", DRAFT],
      ["required", of("ch-a-1")],
    ]);
  });
});
