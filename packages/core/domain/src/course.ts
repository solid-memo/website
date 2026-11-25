// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ChapterV1, StepV1 } from "@solid-memo/vocab/types.generated";
import type { Answer } from "./answer";
import { chainIndexOf } from "./answerChain";
import type { FsrsRating } from "./fsrs";
import { activeCards, type CardContent } from "./deck";
import { sameText, type LangText } from "./langText";
import { derivedOnce, derivedOnceOf } from "./frozen";
import type { DueState, ReviewQuality } from "./review";
import { shuffle, studyDayOf } from "./scheduling";
import { quizAccuracyOf, type Quiz } from "./statistics";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Courses (see docs/courses.md): a library release that is also a
 * schema:Course has chapters, each a sequence of steps; a step is a short
 * piece of theory checked by one or more multiple-choice questions, and a
 * chapter ends with a final review over all of them. The questions are
 * the release's cards, the wrong options their distractors. The outline
 * stays in the release; the learner's pod holds an ordinary deck that a
 * card joins when its question is first answered, and the chapters
 * completed (Deck.completedChapters). Everything here is pure: the
 * shuffles take an injected random source.
 */

/** A course's outline: its chapters in order, as its release states them. */
export interface CourseOutline {
  /** URL of the release the outline was read from. */
  releaseUrl: string;
  /** The chapters in use, by position; retired ones left out. */
  chapters: CourseChapter[];
}

export interface CourseChapter {
  /** Fragment id in the release ("ch-linked-data"). */
  id: string;
  /**
   * The chapter's subject in this release: what completing it names in
   * `sm:completedChapter`. A completion is matched by the fragment id
   * (`id`), which stays the same from release to release.
   */
  url: string;
  position: number;
  title: LangText;
  description?: LangText;
  /**
   * How the description is written (`sm:textFormat`, vocabulary 1.15): a
   * concept IRI of the TextFormats scheme; absent means plain text. The
   * title is always plain.
   */
  textFormat?: string;
  /** The steps in use, by position; retired ones left out. */
  steps: CourseStep[];
  /** Cards (fragment ids) asked only in the chapter's final review, in the order of their ids. */
  reviewQuestionIds: string[];
}

export interface CourseStep {
  /** Fragment id in the release. */
  id: string;
  url: string;
  position: number;
  /** The theory, in every language it is stated in (one of them English). */
  theory: LangText;
  /** How the theory is written (`sm:textFormat`, vocabulary 1.15), as a chapter's description is. */
  textFormat?: string;
  /**
   * The cards (fragment ids) whose questions check the theory, in the
   * order of their ids: RDF keeps no order among a step's sm:checkedBy,
   * so a release orders them by naming them ("q-iri-1", "q-iri-2").
   */
  questionIds: string[];
}

/**
 * The outline of a release, from its chapter and step subjects (their
 * URLs and latest records): chapters and steps ordered by position (then
 * by id, for a tie no release should have), a retired one
 * (`owl:deprecated`) left out, and each step under the chapter it is part
 * of. A step of a chapter that is retired or missing is left out with it.
 * A step's questions and a chapter's review questions are ordered by id.
 */
export function courseOutlineFromRecords(
  releaseUrl: string,
  chapters: readonly { url: string; data: ChapterV1 }[],
  steps: readonly { url: string; data: StepV1 }[],
): CourseOutline {
  const inUse = <T extends { data: { deprecated?: boolean } }>(items: readonly T[]) =>
    items.filter((item) => item.data.deprecated !== true);
  // Each step put under its chapter in one pass, not a pass over every
  // step per chapter: a release may have thousands of each.
  const stepsOf = new Map<string, CourseStep[]>();
  for (const step of inUse(steps)) {
    const entry: CourseStep = {
      id: fragmentIdOf(step.url),
      url: step.url,
      position: step.data.position,
      theory: step.data.theory,
      ...(step.data.textFormat === undefined ? {} : { textFormat: step.data.textFormat }),
      questionIds: idsOf(step.data.checkedBy),
    };
    const under = stepsOf.get(step.data.chapter);
    if (under === undefined) stepsOf.set(step.data.chapter, [entry]);
    else under.push(entry);
  }
  return {
    releaseUrl,
    chapters: byPosition(
      inUse(chapters).map(
        ({ url, data }): CourseChapter => ({
          id: fragmentIdOf(url),
          url,
          position: data.position,
          title: data.title,
          ...(data.description === undefined ? {} : { description: data.description }),
          ...(data.textFormat === undefined ? {} : { textFormat: data.textFormat }),
          steps: byPosition([...(stepsOf.get(url) ?? [])]),
          reviewQuestionIds: idsOf(data.reviewQuestion),
        }),
      ),
    ),
  };
}

/**
 * The outline asking only cards of its release (`cardIds`, by fragment
 * id): a question that names no such card is left out, and a step left
 * with none goes with it, as a step is checked by at least one; so does
 * a chapter left with no step and no review question, as it would have
 * no final review to pass. The player, the progress and the statistics
 * then go by the same questions. A release the Studio checked names no
 * other (courseRules); one from elsewhere may name anything,
 * `constructor` too.
 */
export function outlineOfCards(
  outline: CourseOutline,
  cardIds: ReadonlySet<string>,
): CourseOutline {
  const cards = (ids: readonly string[]) => ids.filter((id) => cardIds.has(id));
  return {
    ...outline,
    chapters: outline.chapters
      .map((chapter) => ({
        ...chapter,
        steps: chapter.steps
          .map((step) => ({ ...step, questionIds: cards(step.questionIds) }))
          .filter((step) => step.questionIds.length > 0),
        reviewQuestionIds: cards(chapter.reviewQuestionIds),
      }))
      .filter((chapter) => chapter.steps.length > 0 || chapter.reviewQuestionIds.length > 0),
  };
}

/** Subjects' fragment ids, in order. */
function idsOf(urls: readonly string[]): string[] {
  return urls.map(fragmentIdOf).sort();
}

function byPosition<T extends { id: string; position: number }>(items: T[]): T[] {
  return items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/**
 * Whether two releases' outlines show the learner the same course: the
 * same chapters in the same order, each with the same title, description
 * and review questions, and the same steps in the same order, each with
 * the same theory and questions, the text formats too. Where each is
 * (its URL, in its own release) and the positions that order them are
 * not compared.
 */
export function sameOutline(a: CourseOutline, b: CourseOutline): boolean {
  const sameIds = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  const sameStep = (x: CourseStep, y: CourseStep) =>
    x.id === y.id &&
    sameText(x.theory, y.theory) &&
    x.textFormat === y.textFormat &&
    sameIds(x.questionIds, y.questionIds);
  const sameChapter = (x: CourseChapter, y: CourseChapter) =>
    x.id === y.id &&
    sameText(x.title, y.title) &&
    sameText(x.description, y.description) &&
    x.textFormat === y.textFormat &&
    sameIds(x.reviewQuestionIds, y.reviewQuestionIds) &&
    x.steps.length === y.steps.length &&
    x.steps.every((step, i) => sameStep(step, y.steps[i]!));
  return (
    a.chapters.length === b.chapters.length &&
    a.chapters.every((chapter, i) => sameChapter(chapter, b.chapters[i]!))
  );
}

/**
 * Where a chapter stands: locked until every chapter before it is
 * completed, then open until the learner completes it (its final review
 * passed), then done.
 */
export type ChapterState = "locked" | "open" | "done";

export interface ChapterProgress {
  /** The chapter's subject. */
  url: string;
  state: ChapterState;
  /** The steps done, by id, in the chapter's order: each of their questions answered. */
  doneStepIds: string[];
  /**
   * The step to resume at: the first that is not done. Absent when every
   * step is done: the final review is next, or the chapter is done.
   */
  resumeStepId?: string;
}

/** Where a learner stands in one chapter, without the steps done (courseStandingOf). */
export type ChapterStanding = Omit<ChapterProgress, "doneStepIds">;

export interface CourseProgress {
  /** Each chapter's progress, in the outline's order. */
  chapters: ChapterProgress[];
  /** The chapter to continue with: the first that is open. Absent when every chapter is done. */
  currentChapterUrl?: string;
  /** Whether every chapter is completed. */
  done: boolean;
}

/**
 * What is worked out of an outline alone (outlineIndexOf): the cards it
 * asks and where, and where its chapters are.
 */
interface OutlineIndex {
  /** Each card the outline asks (fragment id), in its order, with the first chapter (its position) to ask it. */
  chapterOf: ReadonlyMap<string, number>;
  /** Each card's place in that order. */
  order: ReadonlyMap<string, number>;
  /** The chapters' positions in the outline, by fragment id. */
  chaptersOf: ReadonlyMap<string, readonly number[]>;
}

const indexes = new WeakMap<CourseOutline, OutlineIndex>();

/**
 * The outline's index, worked out once for a frozen outline (derivedOnce),
 * as the library reads one: the course decks that name one release share
 * its outline, and each then adds only the work of its own answered
 * cards and completed chapters, not another pass over every chapter.
 */
function outlineIndexOf(outline: CourseOutline): OutlineIndex {
  return derivedOnce(indexes, outline, ({ chapters }) => {
    const chapterOf = new Map<string, number>();
    const chaptersOf = new Map<string, number[]>();
    chapters.forEach((chapter, at) => {
      for (const step of chapter.steps)
        for (const id of step.questionIds) if (!chapterOf.has(id)) chapterOf.set(id, at);
      for (const id of chapter.reviewQuestionIds) if (!chapterOf.has(id)) chapterOf.set(id, at);
      const same = chaptersOf.get(chapter.id);
      if (same === undefined) chaptersOf.set(chapter.id, [at]);
      else same.push(at);
    });
    const order = new Map([...chapterOf.keys()].map((id, at) => [id, at]));
    return { chapterOf, order, chaptersOf };
  });
}

/** What is worked out of one chapter alone (chapterIndexOf): which steps ask each card. */
interface ChapterIndex {
  /** Each card the chapter's steps ask (fragment id), with the steps (their positions) that ask it. */
  stepsOf: ReadonlyMap<string, readonly number[]>;
  /** How many cards each step asks, by position. */
  sizes: readonly number[];
  /** The steps that ask none (their positions): done of any cards answered. */
  empty: readonly number[];
  /**
   * Each card the chapter's steps ask (fragment id), in the order of the
   * first step to ask it, with that step (its position): the first of
   * them not answered is where the learner resumes (resumeOf).
   */
  firsts: readonly (readonly [string, number])[];
}

const chapterIndexes = new WeakMap<CourseChapter, ChapterIndex>();

/**
 * The chapter's index, worked out once for a frozen chapter (derivedOnce),
 * as the library reads one: a chapter may have any number of steps, and
 * where a learner stands in it then costs only their own answered cards,
 * not another pass over its steps.
 */
function chapterIndexOf(chapter: CourseChapter): ChapterIndex {
  return derivedOnce(chapterIndexes, chapter, ({ steps }) => {
    const stepsOf = new Map<string, number[]>();
    const sizes: number[] = [];
    const empty: number[] = [];
    const firsts: [string, number][] = [];
    steps.forEach((step, at) => {
      const asked = new Set(step.questionIds);
      sizes.push(asked.size);
      if (asked.size === 0) empty.push(at);
      for (const id of asked) {
        const same = stepsOf.get(id);
        if (same === undefined) {
          stepsOf.set(id, [at]);
          firsts.push([id, at]);
        } else same.push(at);
      }
    });
    return { stepsOf, sizes, empty, firsts };
  });
}

/**
 * The cards of `answered` the outline asks, each once, in the outline's
 * order: a pass over the fewer of the two, so a course deck's cost goes
 * by its own answered cards, not the whole outline.
 */
export function answeredOfOutline(outline: CourseOutline, answered: ReadonlySet<string>): string[] {
  const { order } = outlineIndexOf(outline);
  if (order.size <= answered.size) return [...order.keys()].filter((id) => answered.has(id));
  return [...answered].filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!);
}

/** The outline's chapters (their positions) that `completedChapterUrls` name, by fragment id in any release. */
function completedOf(
  outline: CourseOutline,
  completedChapterUrls: readonly string[],
): ReadonlySet<number> {
  const { chaptersOf } = outlineIndexOf(outline);
  const completed = new Set<number>();
  for (const url of completedChapterUrls)
    for (const at of chaptersOf.get(fragmentIdOf(url)) ?? []) completed.add(at);
  return completed;
}

/** The first chapter (its position) not completed: the one open, or the outline's length when every one is done. */
function openOf(completed: ReadonlySet<number>): number {
  let at = 0;
  while (completed.has(at)) at += 1;
  return at;
}

/**
 * The step (its position) to resume a chapter at, of the cards answered:
 * the first step to ask the first of the chapter's cards not answered
 * (ChapterIndex.firsts), as every step before it asks only cards
 * answered, or asks none; none when every card is answered. It looks up
 * at most one card more than the chapter's cards answered, however many
 * steps ask each.
 */
function resumeOf(index: ChapterIndex, answered: ReadonlySet<string>): number | undefined {
  for (const [id, at] of index.firsts) if (!answered.has(id)) return at;
  return undefined;
}

/**
 * Where a learner stands in one chapter, of the cards answered: the
 * answered cards each step asks are counted (a pass over the fewer of
 * the answered cards and the chapter's), a step done once it has as
 * many as it asks, and the step to resume at found as resumeOf has it.
 * The course's own page (courseProgress) shows the steps done; the
 * strip needs only where to resume (chapterStandingOf).
 */
function chapterProgressOf(
  chapter: CourseChapter,
  state: ChapterState,
  answered: ReadonlySet<string>,
): ChapterProgress {
  const index = chapterIndexOf(chapter);
  const { stepsOf, sizes, empty } = index;
  const hits = new Map<number, number>();
  const count = (id: string) => {
    for (const at of stepsOf.get(id) ?? []) hits.set(at, (hits.get(at) ?? 0) + 1);
  };
  if (answered.size <= stepsOf.size) for (const id of answered) count(id);
  else for (const id of stepsOf.keys()) if (answered.has(id)) count(id);
  const done = new Set(empty);
  for (const [at, answers] of hits) if (answers === sizes[at]) done.add(at);
  const { steps } = chapter;
  return {
    ...chapterStandingOf(chapter, state, resumeOf(index, answered)),
    doneStepIds: [...done].sort((a, b) => a - b).map((at) => steps[at]!.id),
  };
}

/** Where a learner stands in one chapter, without the steps done: its state and the step to resume at (resumeOf). */
function chapterStandingOf(
  chapter: CourseChapter,
  state: ChapterState,
  resume: number | undefined,
): ChapterStanding {
  return {
    url: chapter.url,
    state,
    ...(resume === undefined ? {} : { resumeStepId: chapter.steps[resume]!.id }),
  };
}

/** Where a chapter at `at` stands, of the chapters completed and the one open. */
function stateOf(completed: ReadonlySet<number>, open: number, at: number): ChapterState {
  return completed.has(at) ? "done" : at === open ? "open" : "locked";
}

/**
 * The learner's progress through a course, derived from the pod: the
 * cards answered (`answeredCardIds`, those with review state) and the
 * chapters completed (`completedChapterUrls`, the deck's
 * `sm:completedChapter`). A chapter is completed when one of those names
 * its fragment id in any release, so a deck upgraded to a newer release
 * keeps its place in the course (ids are never reused). A step is done
 * when every card it is checked by has been answered; a chapter unlocks
 * once each chapter before it in the outline (retired ones are not in it)
 * is completed. A completed chapter stays done whatever came before it.
 */
export function courseProgress(
  outline: CourseOutline,
  answeredCardIds: Iterable<string>,
  completedChapterUrls: readonly string[],
): CourseProgress {
  const answered = new Set(answeredCardIds);
  const completed = completedOf(outline, completedChapterUrls);
  const open = openOf(completed);
  const chapters = outline.chapters.map((chapter, at) =>
    chapterProgressOf(chapter, stateOf(completed, open, at), answered),
  );
  const current = outline.chapters[open];
  return {
    chapters,
    ...(current === undefined ? {} : { currentChapterUrl: current.url }),
    done: current === undefined,
  };
}

const answeredSets = new WeakMap<readonly string[], ReadonlySet<string>>();

/**
 * The cards answered of a list of them, as a set to look them up in,
 * made once for a frozen list (derivedOnce): the course decks that name
 * one release and one reviews document share that list, as read
 * (courses.ts answeredQuestions), whichever chapter each has open.
 */
function answeredSetOf(answeredCardIds: readonly string[]): ReadonlySet<string> {
  return derivedOnce(answeredSets, answeredCardIds, (ids) => new Set(ids));
}

const resumes = new WeakMap<
  CourseChapter,
  WeakMap<readonly string[], Map<string, number | undefined>>
>();

/**
 * The step (its position) to resume a chapter at, of the cards answered
 * (resumeOf). The cards answered are made a set once for a frozen list
 * (answeredSetOf), so a deck of its own chapter open looks up at most
 * one card more than that chapter's cards answered, and the step is
 * worked out once for a frozen chapter and a frozen list (derivedOnceOf),
 * so the decks that also share the chapter open look it up once in all.
 */
function resumeIn(chapter: CourseChapter, answeredCardIds: readonly string[]): number | undefined {
  return derivedOnceOf(resumes, chapter, answeredCardIds, "", () =>
    resumeOf(chapterIndexOf(chapter), answeredSetOf(answeredCardIds)),
  );
}

/** Where a course not yet finished stands (courseStandingOf). */
export interface CourseStanding {
  /** The chapter to go on with: the one open. */
  current: CourseChapter;
  /** Where the learner stands in that chapter: its state and the step to resume at. */
  progress: ChapterStanding;
  /** Chapters completed. */
  done: number;
}

/**
 * Where a course stands, as courseProgress has it, of the chapter open
 * alone and without its steps done: none once every chapter is done. It
 * costs the chapters completed and the cards of the chapter open up to
 * the first not answered, not the steps of the chapter open, so many
 * course decks of one long outline, or of one long chapter, each cost
 * little. Of one frozen list of cards answered, which the decks that
 * name one release and one reviews document share, the set to look them
 * up in is made once, whichever chapter each deck has open; the decks
 * that share the chapter open too find the step once (resumeIn).
 */
export function courseStandingOf(
  outline: CourseOutline,
  answeredCardIds: readonly string[],
  completedChapterUrls: readonly string[],
): CourseStanding | undefined {
  const completed = completedOf(outline, completedChapterUrls);
  const open = openOf(completed);
  const current = outline.chapters[open];
  if (current === undefined) return undefined;
  return {
    current,
    progress: chapterStandingOf(current, "open", resumeIn(current, answeredCardIds)),
    done: completed.size,
  };
}

/**
 * How many chapters' results a course's statistics give at most
 * (CourseResults.chapters): as many as a screen draws of a list, the
 * ui's LIST_LIMIT (bounded.ts), which this package cannot import: the
 * ui's tests check that the two windows agree (CourseStatistics.test.tsx).
 */
const RESULTS_LIMIT = 50;

/** How many chapters before the one open the results give too: the ui's LIST_LEAD (bounded.ts). */
const RESULTS_LEAD = 5;

/** How a course has gone, as the statistics show it (courseProgressOf). */
export interface CourseResults {
  /** The chapters completed, of the outline's. */
  done: number;
  /** How many chapters the outline has. */
  count: number;
  /** Where `chapters` start in the outline: how many chapters come before them. */
  start: number;
  /**
   * At most RESULTS_LIMIT chapters' results, in the outline's order: a
   * window around the chapter open (with the RESULTS_LEAD before it),
   * or near the outline's end its last; the first when none is open.
   */
  chapters: ChapterResults[];
}

export interface ChapterResults {
  /** The chapter's subject. */
  url: string;
  title: LangText;
  state: ChapterState;
  /** The graded course answers to its questions (statistics.ts quizAccuracyOf). */
  quiz: Quiz;
}

/**
 * How a course has gone: where its chapters stand, from the chapters
 * completed (as courseProgress says, by fragment id in any release), and
 * the graded course answers to their questions, their steps' and their
 * final reviews', of the course deck's `answers` (any of the log's,
 * recall ones too: they tell a course answer that repeats one the same
 * day). A question is its first chapter's, by its card's fragment id;
 * answers to a card no chapter in use asks are left out. The outline's
 * questions are looked up in its index (outlineIndexOf), and the results
 * are of a window of its chapters (CourseResults.chapters), so a course
 * deck costs its own answers and completed chapters, not the outline's.
 */
export function courseProgressOf(
  outline: CourseOutline,
  completedChapterUrls: readonly string[],
  answers: readonly Answer[],
): CourseResults {
  const { chapterOf } = outlineIndexOf(outline);
  const byChapter = new Map<number, Answer[]>();
  for (const answer of answers) {
    const at = chapterOf.get(fragmentIdOf(answer.cardUrl));
    if (at === undefined) continue;
    const same = byChapter.get(at);
    if (same === undefined) byChapter.set(at, [answer]);
    else same.push(answer);
  }
  const index = chainIndexOf(answers);
  // Where a chapter stands depends on the chapters completed alone, not on the cards answered.
  const completed = completedOf(outline, completedChapterUrls);
  const open = openOf(completed);
  const count = outline.chapters.length;
  const start =
    open < count ? Math.max(0, Math.min(open - RESULTS_LEAD, count - RESULTS_LIMIT)) : 0;
  return {
    done: completed.size,
    count,
    start,
    chapters: outline.chapters.slice(start, start + RESULTS_LIMIT).map((chapter, n) => ({
      url: chapter.url,
      title: chapter.title,
      state: stateOf(completed, open, start + n),
      quiz: quizAccuracyOf(byChapter.get(start + n) ?? [], index),
    })),
  };
}

/**
 * A change of the chapters a learner completed, as the Studio makes one
 * (UseCases.setCompletedChapters): a chapter marked not done, in any
 * release (by its fragment id), or the course restarted, no chapter
 * completed. Answers and review states are left as they are.
 */
export type CompletedChaptersEdit = { kind: "notDone"; chapterUrl: string } | { kind: "restart" };

/** The completed chapters (their URLs) once `edit` is made of them. */
export function editCompletedChapters(
  completed: readonly string[],
  edit: CompletedChaptersEdit,
): string[] {
  if (edit.kind === "restart") return [];
  const id = fragmentIdOf(edit.chapterUrl);
  return completed.filter((url) => fragmentIdOf(url) !== id);
}

/** One option of a multiple-choice question. */
export interface Choice {
  /** Stable within the question, for the UI to key and pick by: "back" for the right one, "distractor:<id>" for a wrong one. */
  key: string;
  /** Its text, in every language it is in (untagged under ""). */
  text: LangText;
  /** Whether it is the card's back: the right answer. */
  correct: boolean;
  /** A wrong option's distractor id: what an answer choosing it records. */
  distractorId?: string;
  /** Why a wrong option is wrong, when the distractor says. */
  note?: LangText;
}

/**
 * How many wrong options a question offers at most. A release can give a
 * card any number of distractors, and every option offered is drawn;
 * this is well above the three a course of the library gives each.
 */
const MAX_OFFERED_DISTRACTORS = 5;

/**
 * The options a card is asked with: its back and each of its distractors
 * in use (a retired one is never offered), shuffled by `random`. Of more
 * than MAX_OFFERED_DISTRACTORS in use, as many are picked by `random`.
 */
export function choicesOf(card: CardContent, random: () => number): Choice[] {
  const inUse = activeCards(card.distractors ?? []);
  const offered =
    inUse.length > MAX_OFFERED_DISTRACTORS
      ? shuffle(inUse, random).slice(0, MAX_OFFERED_DISTRACTORS)
      : inUse;
  return shuffle(
    [
      { key: "back", text: card.back, correct: true },
      ...offered.map(
        (distractor): Choice => ({
          key: `distractor:${distractor.id}`,
          text: distractor.text,
          correct: false,
          distractorId: distractor.id,
          ...(distractor.note === undefined ? {} : { note: distractor.note }),
        }),
      ),
    ],
    random,
  );
}

/**
 * A chapter's final review: every card its steps are checked by and
 * every review question it names, each once, shuffled by `random`.
 */
export function finalReviewQueue(chapter: CourseChapter, random: () => number): string[] {
  return shuffle(
    [
      ...new Set([
        ...chapter.steps.flatMap((step) => step.questionIds),
        ...chapter.reviewQuestionIds,
      ]),
    ],
    random,
  );
}

/**
 * The SM-2 grade of a multiple-choice answer: 3, the lowest passing
 * grade, when right; 1 when wrong. With ratingOfChoice, the one place
 * answers chosen among options become grades.
 */
export function gradeOfChoice(correct: boolean): ReviewQuality {
  return correct ? 3 : 1;
}

/**
 * The FSRS-6 rating of a multiple-choice answer: Good when right, Again
 * when wrong. Its SM-2 grade stays gradeOfChoice's, and the answer log
 * records that grade, so a right one (3, which ratingOfGrade reads as
 * Hard) is read back as Good by its mode.
 */
export function ratingOfChoice(correct: boolean): FsrsRating {
  return correct ? 3 : 1;
}

/**
 * What answering a course question does to its card's schedule:
 * - "introduce": the card has no review state (it is not in the deck, or
 *   its introduction was reset): it joins the deck, graded by the choice.
 * - "review": it is graded by the choice like any review.
 * - "none": nothing is written; the answer is practice.
 */
export type CourseAnswerEffect =
  | { kind: "introduce"; grade: ReviewQuality }
  | { kind: "review"; grade: ReviewQuality }
  | { kind: "none" };

/**
 * The effect of answering a card's question in a course, `now`, given
 * what sets its front→back due day (null or undefined: no state; under
 * FSRS-6 the due day is the FSRS-6 state's, effectiveStates in fsrs.ts):
 * - no state: introduce it, graded gradeOfChoice(correct);
 * - graded earlier this study day (as in a final review the day its steps
 *   were taken): a right answer changes nothing (the day's grade stands,
 *   so the card is not pushed further out on the strength of an answer
 *   it was just shown), a wrong one is a lapse, grade 1;
 * - due this study day or earlier, and not yet graded today: a review,
 *   graded gradeOfChoice(correct);
 * - due on a later study day: nothing, the answer is practice (revisiting
 *   a step or retaking a chapter), as grading a card before it is due
 *   would cut its interval short.
 */
export function courseAnswerEffect(
  state: DueState | null | undefined,
  correct: boolean,
  now: Date,
  dayBoundaryHour: number,
): CourseAnswerEffect {
  if (state === null || state === undefined)
    return { kind: "introduce", grade: gradeOfChoice(correct) };
  const today = studyDayOf(now, dayBoundaryHour);
  if (studyDayOf(new Date(state.lastReviewedAt), dayBoundaryHour) === today) {
    return correct ? { kind: "none" } : { kind: "review", grade: gradeOfChoice(false) };
  }
  return state.due <= today ? { kind: "review", grade: gradeOfChoice(correct) } : { kind: "none" };
}
