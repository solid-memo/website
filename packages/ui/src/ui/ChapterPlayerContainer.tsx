// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseUseCases } from "@solid-memo/application/courses";
import type { StudyUseCases } from "@solid-memo/application/study";
import type { Course } from "@solid-memo/application/courses";
import { choicesOf, type Choice, type CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard } from "@solid-memo/domain/library";
import { ChapterPlayerScreen, type StepPhase } from "./ChapterPlayerScreen";
import { useClock } from "./courseLinks";
import type { CheckedAnswer } from "./CourseQuestion";
import { useI18n } from "./i18n";
import { useKeepSchedule } from "./keepSchedule";
import { queryKeys } from "./queryKeys";

/**
 * Answers a course question of `card`, then refreshes what the answer
 * changed: the course's progress, and, once a card is graded, the deck's
 * cards and counts. Shared by a chapter's steps and its final review.
 * The answer is given at the screen's time (useClock), and keeps how
 * long choosing took (`recallMillis`).
 */
export function useCourseAnswer(
  useCases: CourseUseCases & StudyUseCases,
  instance: Instance,
  course: Course,
  onAnswered: (answer: CheckedAnswer) => void,
) {
  const queryClient = useQueryClient();
  const deck = course.deck;
  const noteGraded = useKeepSchedule(useCases, instance.url, deck);
  const now = useClock();
  return useMutation({
    mutationFn: ({
      card,
      choice,
      recallMillis,
    }: {
      card: LibraryCard;
      choice: Choice;
      recallMillis: number;
    }) =>
      useCases.answerCourseQuestion(
        instance.url,
        deck,
        card,
        {
          correct: choice.correct,
          ...(choice.distractorId === undefined ? {} : { distractorId: choice.distractorId }),
        },
        now(),
        { recallMillis },
      ),
    onSuccess: ({ effect }, { choice }) => {
      onAnswered({ choice, effect });
      void queryClient.invalidateQueries({ queryKey: queryKeys.course(deck.url) });
      if (effect === "none") return;
      noteGraded();
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards(deck.cardsDocumentUrl) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyQueue(deck.url) });
    },
  });
}

/** Where a chapter is at: the step, its phase, the chunk of its theory and the question. */
export interface ChapterPlace {
  step: number;
  phase: StepPhase;
  chunk: number;
  question: number;
}

/**
 * The place after the question `at` shows: the step's next question, the
 * next step's theory at its first chunk, or null after the chapter's
 * last question.
 */
export function nextPlace(chapter: CourseChapter, at: ChapterPlace): ChapterPlace | null {
  if (at.question + 1 < chapter.steps[at.step]!.questionIds.length)
    return { ...at, question: at.question + 1 };
  if (at.step + 1 < chapter.steps.length)
    return { step: at.step + 1, phase: "read", chunk: 0, question: 0 };
  return null;
}

/**
 * The place `at` as far as the chapter goes now, as a course read afresh
 * may have fewer steps or questions than when the learner got there:
 * past the last step, that step's theory; past a step's last question,
 * that question. The chapter has a step: one without opens at its final
 * review (resolveRoute).
 */
export function placeWithin(chapter: CourseChapter, at: ChapterPlace): ChapterPlace {
  const lastStep = chapter.steps.length - 1;
  if (at.step > lastStep) return { step: lastStep, phase: "read", chunk: 0, question: 0 };
  const lastQuestion = chapter.steps[at.step]!.questionIds.length - 1;
  return at.question > lastQuestion ? { ...at, question: lastQuestion } : at;
}

/**
 * The answer checked, while it's to one of the options shown: a course
 * read afresh may have put another card in the question's place.
 */
export function answerTo(checked: CheckedAnswer | null, choices: readonly Choice[]) {
  return checked !== null && choices.includes(checked.choice) ? checked : null;
}

/**
 * Owns one chapter of a course, taken a step at a time. It opens at the
 * step the learner's progress says to resume at (the first not done; the
 * first, for a chapter whose steps are all done), then goes on step by
 * step and question by question as the learner does, whatever the
 * progress says meanwhile. Every step, the one opened at included,
 * starts with its theory, at its first chunk; its questions follow,
 * without it. Each
 * question's options are shuffled once, as it comes up.
 */
export function ChapterPlayerContainer({
  useCases,
  instance,
  course,
  chapter,
  onReview,
  random = Math.random,
}: {
  useCases: CourseUseCases & StudyUseCases;
  instance: Instance;
  course: Course;
  chapter: CourseChapter;
  /** Called after the chapter's last question: on to its final review. */
  onReview: () => void;
  /** Uniform [0, 1) source the options are shuffled by. */
  random?: () => number;
}) {
  const { t, errorText } = useI18n();
  const [place, setAt] = useState<ChapterPlace>(() => {
    const resume = course.progress.chapters.find(
      (entry) => entry.url === chapter.url,
    )!.resumeStepId;
    return {
      step: Math.max(
        chapter.steps.findIndex((step) => step.id === resume),
        0,
      ),
      phase: "read",
      chunk: 0,
      question: 0,
    };
  });
  const at = placeWithin(chapter, place);
  const [checked, setAnswer] = useState<CheckedAnswer | null>(null);
  const step = chapter.steps[at.step]!;
  const card = course.cards.get(step.questionIds[at.question]!)!;
  const choices = useMemo(() => choicesOf(card, random), [at.step, at.question, card.id]);
  const answer = answerTo(checked, choices);
  const answerMutation = useCourseAnswer(useCases, instance, course, setAnswer);

  function next() {
    answerMutation.reset();
    setAnswer(null);
    const following = nextPlace(chapter, at);
    if (following === null) onReview();
    else setAt(following);
  }

  return (
    <ChapterPlayerScreen
      chapter={chapter}
      stepIndex={at.step}
      phase={at.phase}
      questionIndex={at.question}
      chunkIndex={at.chunk}
      card={card}
      choices={choices}
      answer={answer}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      onAnswerPhase={() => setAt({ ...at, phase: "answer" })}
      onChunk={(chunk) => setAt({ ...at, chunk })}
      onCheck={(choice, recallMillis) => answerMutation.mutate({ card, choice, recallMillis })}
      lastLabel={t("chapterPlayer.toReview")}
      onNext={next}
    />
  );
}
