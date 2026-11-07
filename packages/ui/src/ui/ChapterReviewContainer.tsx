// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseUseCases } from "@solid-memo/application/courses";
import type { StudyUseCases } from "@solid-memo/application/study";
import type { Course } from "@solid-memo/application/courses";
import { choicesOf, finalReviewQueue, type CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import { answerTo, useCourseAnswer } from "./ChapterPlayerContainer";
import { ChapterReviewScreen, type Completion } from "./ChapterReviewScreen";
import type { CheckedAnswer } from "./CourseQuestion";
import { useCourseLinks } from "./courseLinks";
import { useI18n } from "./i18n";
import { queryKeys } from "./queryKeys";

/**
 * Owns one final review of a chapter: it starts when the learner says
 * so, past the word before it; its queue is drawn once, as the screen
 * opens (finalReviewQueue), and walked in order; a question answered
 * wrongly is put back at its end. After the last question is answered
 * right, the chapter is completed (UseCases.completeChapter), and the
 * course is read afresh before `onCompleted`, so the course's page the
 * learner is taken to shows it done and the next chapter open. A learner
 * who leaves the review while that is saved stays where they went: the
 * course is still read afresh, but `onCompleted` is not called. Back to
 * the course's page links where the course links say. The course may be
 * read afresh meanwhile (each answer does so), and a queued question it
 * no longer has is passed over: the chapter is completed once none is
 * left.
 */
export function ChapterReviewContainer({
  useCases,
  instance,
  course,
  chapter,
  onCompleted,
  random = Math.random,
}: {
  useCases: CourseUseCases & StudyUseCases;
  instance: Instance;
  course: Course;
  chapter: CourseChapter;
  /** The chapter is completed; `finishedCourse` when that completed the course too. */
  onCompleted: (finishedCourse: boolean) => void;
  /** Uniform [0, 1) source the queue and options are shuffled by. */
  random?: () => number;
}) {
  const { errorText } = useI18n();
  const links = useCourseLinks();
  const queryClient = useQueryClient();
  const deck = course.deck;
  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState(() => finalReviewQueue(chapter, random));
  const [position, setPosition] = useState(0);
  const [checked, setAnswer] = useState<CheckedAnswer | null>(null);
  const held = (ids: readonly string[]) => ids.filter((id) => course.cards.has(id));
  const at = queue.findIndex((id, index) => index >= position && course.cards.has(id));
  const cardId = queue[at];
  const card = cardId === undefined ? null : course.cards.get(cardId)!;
  const choices = useMemo(() => (card === null ? [] : choicesOf(card, random)), [position, cardId]);
  const answer = answerTo(checked, choices);
  const answerMutation = useCourseAnswer(useCases, instance, course, (answered) => {
    setAnswer(answered);
    // Wrong, it comes back once the rest have been asked.
    if (!answered.choice.correct && answerTo(answered, choices) !== null)
      setQueue((current) => [...current, cardId!]);
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
        queryClient.invalidateQueries({ queryKey: queryKeys.course(deck.url) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(instance.url) }),
      ]),
  });
  // Passed to mutate, not to useMutation, so that it is dropped once the
  // review is unmounted.
  const complete = () =>
    completeMutation.mutate(undefined, {
      onSuccess: (finishedCourse) => onCompleted(finishedCourse),
    });

  // None left, whether the last was answered right or is gone from the course.
  useEffect(() => {
    if (started && card === null) complete();
  }, [started, card === null]);

  function next() {
    answerMutation.reset();
    setAnswer(null);
    setPosition(at + 1);
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
      courseHref={links.courseHref(instance.url, deck.url)}
      position={held(queue.slice(0, at)).length + 1}
      total={held(queue).length}
      card={card}
      choices={choices}
      answer={answer}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      completion={completion}
      onStart={() => setStarted(true)}
      onCheck={(choice, recallMillis) =>
        answerMutation.mutate({ card: card!, choice, recallMillis })
      }
      onNext={next}
      onRetry={complete}
    />
  );
}
