import type { ChapterV1, StepV1 } from "@solid-memo/vocab/types.generated";
import type { CardContent } from "./deck";
import type { LangText } from "./langText";
import type { ReviewQuality, ReviewState } from "./review";
import { shuffle, studyDayOf } from "./scheduling";
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
  return {
    releaseUrl,
    chapters: byPosition(
      inUse(chapters).map(({ url, data }): CourseChapter => ({
        id: fragmentIdOf(url),
        url,
        position: data.position,
        title: data.title,
        ...(data.description === undefined ? {} : { description: data.description }),
        steps: byPosition(
          inUse(steps)
            .filter((step) => step.data.chapter === url)
            .map((step): CourseStep => ({
              id: fragmentIdOf(step.url),
              url: step.url,
              position: step.data.position,
              theory: step.data.theory,
              questionIds: idsOf(step.data.checkedBy),
            })),
        ),
        reviewQuestionIds: idsOf(data.reviewQuestion),
      })),
    ),
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

export interface CourseProgress {
  /** Each chapter's progress, in the outline's order. */
  chapters: ChapterProgress[];
  /** The chapter to continue with: the first that is open. Absent when every chapter is done. */
  currentChapterUrl?: string;
  /** Whether every chapter is completed. */
  done: boolean;
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
  const completed = new Set(completedChapterUrls.map(fragmentIdOf));
  let unlocked = true;
  const chapters = outline.chapters.map((chapter): ChapterProgress => {
    const done = completed.has(chapter.id);
    const state: ChapterState = done ? "done" : unlocked ? "open" : "locked";
    unlocked &&= done;
    const doneStepIds = chapter.steps
      .filter((step) => step.questionIds.every((id) => answered.has(id)))
      .map((step) => step.id);
    const resume = chapter.steps.find((step) => !doneStepIds.includes(step.id));
    return { url: chapter.url, state, doneStepIds, ...(resume === undefined ? {} : { resumeStepId: resume.id }) };
  });
  const current = chapters.find((chapter) => chapter.state === "open");
  return {
    chapters,
    ...(current === undefined ? {} : { currentChapterUrl: current.url }),
    done: chapters.every((chapter) => chapter.state === "done"),
  };
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

/** The options a card is asked with: its back and each of its distractors, shuffled by `random`. */
export function choicesOf(card: CardContent, random: () => number): Choice[] {
  return shuffle(
    [
      { key: "back", text: card.back, correct: true },
      ...(card.distractors ?? []).map(
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
  return shuffle([...new Set([...chapter.steps.flatMap((step) => step.questionIds), ...chapter.reviewQuestionIds])], random);
}

/**
 * The SM-2 grade of a multiple-choice answer: 3, the lowest passing
 * grade, when right; 1 when wrong. The one place answers chosen among
 * options become grades, so a scheduler other than SM-2 (FSRS) replaces
 * this map alone.
 */
export function gradeOfChoice(correct: boolean): ReviewQuality {
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
 * The effect of answering a card's question in a course, `now`, given its
 * front→back review state (null or undefined: none):
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
  state: ReviewState | null | undefined,
  correct: boolean,
  now: Date,
  dayBoundaryHour: number,
): CourseAnswerEffect {
  if (state === null || state === undefined) return { kind: "introduce", grade: gradeOfChoice(correct) };
  const today = studyDayOf(now, dayBoundaryHour);
  if (studyDayOf(new Date(state.lastReviewedAt), dayBoundaryHour) === today) {
    return correct ? { kind: "none" } : { kind: "review", grade: gradeOfChoice(false) };
  }
  return state.due <= today ? { kind: "review", grade: gradeOfChoice(correct) } : { kind: "none" };
}
