import { SM } from "@solid-memo/vocab/vocab.generated";
import { problem, type ReleaseProblem } from "./problems.ts";
import {
  languagesOf,
  SCHEMA_NS,
  type ReleaseCard,
  type ReleaseDistractor,
  type ReleaseModel,
  type ReleaseSubject,
} from "./releaseModel.ts";

/** The fewest distractors a card a course asks has in use. */
export const LEAST_DISTRACTORS = 2;

const IS_PART_OF = `${SCHEMA_NS}isPartOf`;
const POSITION = `${SCHEMA_NS}position`;

/**
 * What the shapes cannot say about a course (docs/deck-library.md,
 * Course rules): a release with chapters or steps is a schema:Course,
 * with at least one chapter, studied front to back; its chapters are
 * part of it and its steps part of its chapters, each at its own
 * position; what a step in use checks and a chapter in use reviews is a
 * card of the release in use, asked once, with text on its back and at
 * least two distractors that have text in each of its back's languages
 * (retired ones not counted); and a chapter in use has a step in use.
 * Every card's distractors, in a course or not, are distractors of the
 * release, each named by that card alone. Retired chapters and steps
 * keep what they named.
 */
export function courseProblems(model: ReleaseModel): ReleaseProblem[] {
  const { url, chapters, steps } = model;
  const problems: ReleaseProblem[] = [];
  const inUse = (subject: ReleaseSubject) => !subject.retired;
  const cards = new Map(model.cards.map((card) => [card.iri, card]));
  const distractors = new Map(model.distractors.filter((d) => d.typed).map((d) => [d.iri, d]));
  const chapterIris = chapters.map((chapter) => chapter.iri);

  const course = model.types.includes(`${SCHEMA_NS}Course`);
  if (!course && chapters.length + steps.length > 0) problems.push(problem(url, { code: "outlineWithoutCourse", params: {} }));
  if (course && chapters.length === 0) problems.push(problem(url, { code: "courseWithoutChapter", params: {} }));
  const direction = model.studyDirection;
  if (course && (direction.length !== 1 || direction[0].value !== SM.frontToBack)) {
    problems.push(problem(url, { code: "courseDirection", params: { stated: direction } }, { field: SM.studyDirection }));
  }

  for (const chapter of chapters) {
    const parts = chapter.isPartOf;
    if (parts.some((part) => part !== url)) {
      problems.push(problem(chapter.iri, { code: "chapterPartOf", params: { parts } }, { field: IS_PART_OF, related: parts }));
    }
  }
  for (const step of steps) {
    for (const part of step.isPartOf.filter((part) => !chapterIris.includes(part))) {
      problems.push(problem(step.iri, { code: "stepPartOf", params: { part } }, { field: IS_PART_OF, related: [part] }));
    }
  }

  // The cards the steps and chapters in use ask, each with the steps that check it and the chapters that review it.
  const asked = new Map<string, { card: ReleaseCard; checkedBy: string[]; reviewedBy: string[] }>();
  const ask = (asker: string, named: readonly string[], field: string) => {
    for (const card of named) {
      const found = cards.get(card);
      if (found === undefined) {
        problems.push(problem(asker, { code: "askedNotACard", params: { card } }, { field, related: [card] }));
      } else if (found.retired) {
        problems.push(problem(asker, { code: "askedRetired", params: { card } }, { field, related: [card] }));
      } else {
        const entry = asked.get(card) ?? { card: found, checkedBy: [], reviewedBy: [] };
        entry[field === SM.checkedBy ? "checkedBy" : "reviewedBy"].push(asker);
        asked.set(card, entry);
      }
    }
  };
  for (const step of steps.filter(inUse)) ask(step.iri, step.checkedBy, SM.checkedBy);
  for (const chapter of chapters.filter(inUse)) ask(chapter.iri, chapter.reviewQuestions, SM.reviewQuestion);
  for (const { subject, object } of model.distractorLinks.filter((link) => !distractors.has(link.object.value))) {
    problems.push(problem(subject, { code: "notADistractor", params: { distractor: object.value } }, { field: SM.distractor, related: [object.value] }));
  }
  // A card's distractors are its own: a copy writes and removes them with it, so one two cards share would go with either.
  const namers = new Map<string, Set<string>>();
  for (const { subject, object } of model.distractorLinks) {
    namers.set(object.value, (namers.get(object.value) ?? new Set()).add(subject));
  }
  for (const [distractor, by] of namers) {
    if (by.size > 1) {
      const named = [...by];
      problems.push(problem(distractor, { code: "distractorShared", params: { cards: named } }, { related: named }));
    }
  }

  for (const [iri, { card, checkedBy, reviewedBy }] of asked) {
    if (checkedBy.length > 1) {
      problems.push(problem(iri, { code: "checkedTwice", params: { steps: checkedBy } }, { related: checkedBy }));
    }
    if (checkedBy.length > 0 && reviewedBy.length > 0) {
      problems.push(
        problem(iri, { code: "checkedAndReviewed", params: { steps: checkedBy, chapters: reviewedBy } }, { related: [...checkedBy, ...reviewedBy] }),
      );
    }
    const back = languagesOf(card.back);
    if (back.length === 0) problems.push(problem(iri, { code: "noBack", params: {} }, { field: SM.back }));
    const options = card.distractors
      .filter((d) => d.kind === "iri")
      .map((d) => distractors.get(d.value))
      .filter((d): d is ReleaseDistractor => d !== undefined && inUse(d));
    if (options.length < LEAST_DISTRACTORS) {
      problems.push(problem(iri, { code: "fewDistractors", params: { count: options.length, least: LEAST_DISTRACTORS } }, { field: SM.distractor }));
    }
    for (const option of options) {
      const text = new Set(languagesOf(option.text));
      const missing = back.filter((language) => !text.has(language));
      if (missing.length > 0) {
        problems.push(
          problem(option.iri, { code: "distractorLanguages", params: { card: iri, missing } }, { field: SM.distractorText, related: [iri] }),
        );
      }
    }
  }

  // Members of the same list that share a schema:position.
  const clashes = (members: readonly { iri: string; positions: readonly string[] }[]) => {
    const at = new Map<string, string[]>();
    for (const member of members) {
      for (const position of member.positions) at.set(position, [...(at.get(position) ?? []), member.iri]);
    }
    return [...at].filter(([, sharing]) => sharing.length > 1);
  };
  for (const [position, sharing] of clashes(chapters.filter(inUse))) {
    problems.push(problem(url, { code: "chapterPositions", params: { chapters: sharing, position } }, { field: POSITION, related: sharing }));
  }
  for (const chapter of chapters) {
    const ofChapter = steps.filter((step) => inUse(step) && step.isPartOf.includes(chapter.iri));
    for (const [position, sharing] of clashes(ofChapter)) {
      problems.push(
        problem(chapter.iri, { code: "stepPositions", params: { steps: sharing, chapter: chapter.iri, position } }, { field: POSITION, related: sharing }),
      );
    }
    if (inUse(chapter) && ofChapter.length === 0) problems.push(problem(chapter.iri, { code: "chapterWithoutStep", params: {} }));
  }
  return problems;
}
