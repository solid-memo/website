import { useMemo, useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Course, UseCases } from "@solid-memo/application/useCases";
import { choicesOf, finalReviewQueue, type CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import { useCourseAnswer } from "./ChapterPlayerContainer";
import { ChapterReviewScreen, type Completion } from "./ChapterReviewScreen";
import { courseKey } from "./CourseContainer";
import type { CheckedAnswer } from "./CourseQuestion";
import { useI18n } from "./i18n";
import { courseHref } from "./router";

/**
 * Owns one final review of a chapter: it starts when the learner says
 * so, past the word before it; its queue is drawn once, as the screen
 * opens (finalReviewQueue), and walked in order; a question answered
 * wrongly is put back at its end. After the last question is answered
 * right, the chapter is completed (UseCases.completeChapter), and the
 * course is read afresh before `onCompleted`, so the course's page the
 * learner is taken to shows it done and the next chapter open. A learner
 * who leaves the review while that is saved stays where they went: the
 * course is still read afresh, but `onCompleted` is not called.
 */
export function ChapterReviewContainer({
  useCases,
  instance,
  course,
  chapter,
  onCompleted,
  random = Math.random,
}: {
  useCases: UseCases;
  instance: Instance;
  course: Course;
  chapter: CourseChapter;
  /** The chapter is completed; `finishedCourse` when that completed the course too. */
  onCompleted: (finishedCourse: boolean) => void;
  /** Uniform [0, 1) source the queue and options are shuffled by. */
  random?: () => number;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const deck = course.deck;
  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState(() => finalReviewQueue(chapter, random));
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState<CheckedAnswer | null>(null);
  const cardId = queue[position];
  const card = cardId === undefined ? null : course.cards[cardId]!;
  const choices = useMemo(() => (card === null ? [] : choicesOf(card, random)), [position]);
  const answerMutation = useCourseAnswer(useCases, instance, course, (checked) => {
    setAnswer(checked);
    // Wrong, it comes back once the rest have been asked.
    if (!checked.choice.correct) setQueue((current) => [...current, cardId!]);
  });

  // Read before the course is read afresh: whether this chapter is the
  // last one left, so that completing it completes the course.
  const finishesCourse =
    !course.progress.done &&
    course.progress.chapters.every((entry) => entry.url === chapter.url || entry.state === "done");
  const completeMutation = useMutation({
    mutationFn: async () => {
      await useCases.completeChapter(deck, chapter.url);
      return finishesCourse;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: courseKey(deck.url) }),
        queryClient.invalidateQueries({ queryKey: ["decks", instance.url] }),
      ]),
  });
  // Passed to mutate, not to useMutation, so that it is dropped once the
  // review is unmounted.
  const complete = () => completeMutation.mutate(undefined, { onSuccess: (finishedCourse) => onCompleted(finishedCourse) });

  function next() {
    answerMutation.reset();
    setAnswer(null);
    setPosition(position + 1);
    if (position + 1 === queue.length) complete();
  }

  const completion: Completion | null =
    card !== null
      ? null
      : completeMutation.isError
        ? { state: "failed", error: errorText(completeMutation.error) }
        : { state: "saving" };

  return (
    <ChapterReviewScreen
      chapterTitle={chapter.title}
      started={started}
      courseHref={courseHref(instance.url, deck.url)}
      position={position + 1}
      total={queue.length}
      card={card}
      choices={choices}
      answer={answer}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      completion={completion}
      onStart={() => setStarted(true)}
      onCheck={(choice) => answerMutation.mutate({ card: card!, choice })}
      onNext={next}
      onRetry={complete}
    />
  );
}
