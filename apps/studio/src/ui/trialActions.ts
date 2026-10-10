import type { Trial } from "@solid-memo/application/trial";
import type { Course } from "@solid-memo/application/useCases";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";

/**
 * What the trial's controls do (docs/studio.md, The trial), with the
 * trial's use cases alone: as a learner would, many answers at once.
 */

/** The options as they come: none is shuffled, the answers being the controls'. */
const inOrder = () => 0;

/**
 * Answer every question of the chapter, its steps' then its review's,
 * right, or wrong (its first wrong option), at `now`. A chapter answered
 * right is completed, as its final review would complete it.
 */
export async function answerChapter(trial: Trial, course: Course, chapter: CourseChapter, correct: boolean, now: Date): Promise<void> {
  const { useCases, instance } = trial;
  const ids = [...new Set([...chapter.steps.flatMap((step) => step.questionIds), ...chapter.reviewQuestionIds])];
  for (const id of ids) {
    const card = course.cards[id]!;
    // A question the course asks has wrong options (trialProblems).
    const choice = choicesOf(card, inOrder).find((option) => option.correct === correct)!;
    await useCases.answerCourseQuestion(
      instance.url,
      course.deck,
      card,
      { correct, ...(choice.distractorId === undefined ? {} : { distractorId: choice.distractorId }) },
      now,
    );
  }
  if (correct) await useCases.completeChapter(course.deck, chapter.url);
}

/**
 * Open the chapter as a learner who completed every chapter before it,
 * and none after: the course restarted, then each one before it
 * completed. The answers given stay.
 */
export async function jumpToChapter(trial: Trial, course: Course, chapter: CourseChapter): Promise<void> {
  const { useCases } = trial;
  let deck = await useCases.setCompletedChapters(course.deck, { kind: "restart" });
  for (const before of course.outline.chapters.slice(0, course.outline.chapters.indexOf(chapter))) {
    deck = await useCases.completeChapter(deck, before.url);
  }
}

/** Answer every prompt of a deck's study queue at `now`, right (5, Easy) or wrong (1). */
export async function answerQueue(trial: Trial, correct: boolean, now: Date): Promise<void> {
  const { useCases, instance, deck } = trial;
  const queue = await useCases.getStudyQueue(instance.url, deck, now);
  for (const prompt of [...queue.due, ...queue.newPrompts]) {
    await useCases.recordReview(instance.url, deck, prompt, correct ? 5 : 1, now);
  }
}
