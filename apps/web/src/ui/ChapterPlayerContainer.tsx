import { useMemo, useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Course, UseCases } from "@solid-memo/application/useCases";
import { choicesOf, type Choice, type CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard } from "@solid-memo/domain/library";
import { ChapterPlayerScreen, type StepPhase } from "./ChapterPlayerScreen";
import { courseKey } from "./CourseContainer";
import type { CheckedAnswer } from "./CourseQuestion";
import { useI18n } from "./i18n";
import { useKeepSchedule } from "./keepSchedule";

/**
 * Answers a course question of `card`, then refreshes what the answer
 * changed: the course's progress, and, once a card is graded, the deck's
 * cards and counts. Shared by a chapter's steps and its final review.
 */
export function useCourseAnswer(useCases: UseCases, instance: Instance, course: Course, onAnswered: (answer: CheckedAnswer) => void) {
  const queryClient = useQueryClient();
  const deck = course.deck;
  const noteGraded = useKeepSchedule(useCases, instance.url, deck);
  return useMutation({
    mutationFn: ({ card, choice }: { card: LibraryCard; choice: Choice }) =>
      useCases.answerCourseQuestion(
        instance.url,
        deck,
        card,
        {
          correct: choice.correct,
          ...(choice.distractorId === undefined ? {} : { distractorId: choice.distractorId }),
        },
        new Date(),
      ),
    onSuccess: ({ effect }, { choice }) => {
      onAnswered({ choice, effect });
      void queryClient.invalidateQueries({ queryKey: courseKey(deck.url) });
      if (effect === "none") return;
      noteGraded();
      void queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] });
      void queryClient.invalidateQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });
}

/**
 * Owns one chapter of a course, taken a step at a time. It opens at the
 * step the learner's progress says to resume at (the first not done; the
 * first, for a chapter whose steps are all done), then goes on step by
 * step and question by question as the learner does, whatever the
 * progress says meanwhile. Every step, the one opened at included,
 * starts with its theory; its questions follow, without it. Each
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
  useCases: UseCases;
  instance: Instance;
  course: Course;
  chapter: CourseChapter;
  /** Called after the chapter's last question: on to its final review. */
  onReview: () => void;
  /** Uniform [0, 1) source the options are shuffled by. */
  random?: () => number;
}) {
  const { errorText } = useI18n();
  const [at, setAt] = useState<{ step: number; phase: StepPhase; question: number }>(() => {
    const resume = course.progress.chapters.find((entry) => entry.url === chapter.url)!.resumeStepId;
    return { step: Math.max(chapter.steps.findIndex((step) => step.id === resume), 0), phase: "read", question: 0 };
  });
  const [answer, setAnswer] = useState<CheckedAnswer | null>(null);
  const step = chapter.steps[at.step]!;
  const card = course.cards[step.questionIds[at.question]!]!;
  const choices = useMemo(() => choicesOf(card, random), [at.step, at.question]);
  const answerMutation = useCourseAnswer(useCases, instance, course, setAnswer);

  function next() {
    answerMutation.reset();
    setAnswer(null);
    if (at.question + 1 < step.questionIds.length) {
      setAt({ ...at, question: at.question + 1 });
    } else if (at.step + 1 < chapter.steps.length) {
      setAt({ step: at.step + 1, phase: "read", question: 0 });
    } else {
      onReview();
    }
  }

  return (
    <ChapterPlayerScreen
      chapter={chapter}
      stepIndex={at.step}
      phase={at.phase}
      questionIndex={at.question}
      card={card}
      choices={choices}
      answer={answer}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      onAnswerPhase={() => setAt({ ...at, phase: "answer" })}
      onCheck={(choice) => answerMutation.mutate({ card, choice })}
      onNext={next}
    />
  );
}
