import { problem, type ReleaseProblem } from "./problems.ts";
import { publishedIds, versionOf, type ReleaseKind, type ReleaseModel } from "./releaseModel.ts";

/**
 * A release against the version before it (docs/deck-library.md): it
 * drops none of the cards, chapters, steps and distractors that one has
 * (one the deck no longer uses is retired, owl:deprecated true, so the
 * copies that have it keep it and its review history, and the learners
 * that follow a course their place in it), gives none of their ids to
 * another kind of subject, and its version is that one's plus one.
 */

const KINDS: readonly ReleaseKind[] = ["card", "chapter", "step", "distractor"];
const OUTLINE: readonly ReleaseKind[] = ["chapter", "step", "distractor"];

export function continuityProblems(before: ReleaseModel, after: ReleaseModel): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const previous = before.url;
  const dropped = (kinds: readonly ReleaseKind[]) => {
    const now = new Set(kinds.flatMap((kind) => publishedIds(after, kind)));
    return kinds.flatMap((kind) => publishedIds(before, kind)).filter((id) => !now.has(id));
  };
  const cards = dropped(["card"]);
  if (cards.length > 0) problems.push(problem(after.url, { code: "cardsDropped", params: { ids: cards, previous } }, { related: [previous] }));
  const outline = dropped(OUTLINE);
  if (outline.length > 0) {
    problems.push(problem(after.url, { code: "outlineDropped", params: { ids: outline, previous } }, { related: [previous] }));
  }

  const kindsNow = new Map<string, ReleaseKind[]>();
  for (const kind of KINDS) for (const id of publishedIds(after, kind)) kindsNow.set(id, [...(kindsNow.get(id) ?? []), kind]);
  for (const was of KINDS) {
    for (const id of publishedIds(before, was)) {
      const now = kindsNow.get(id) ?? [];
      if (now.length > 0 && !now.includes(was)) {
        problems.push(problem(after.url, { code: "idReused", params: { id, was, now: now[0], previous } }, { related: [previous] }));
      }
    }
  }

  const version = versionOf(after);
  const previousVersion = versionOf(before);
  if (version !== undefined && previousVersion !== undefined && version !== previousVersion + 1) {
    problems.push(problem(after.url, { code: "versionNotNext", params: { version, previousVersion, previous } }, { related: [previous] }));
  }
  return problems;
}
