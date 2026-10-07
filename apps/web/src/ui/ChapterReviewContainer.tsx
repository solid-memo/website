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
import { routeToHash } from "./router";

/**
 * Owns one final review of a chapter: its queue is drawn once, as the
 * review starts (finalReviewQueue), and walked in order; a question
 * answered wrongly is put back at its end. After the last question is
 * answered right, the chapter is completed (UseCases.completeChapter),
 * and the course is read afresh before the end is shown, so the next
 * chapter it links to is open by then.
 */
export function ChapterReviewContainer({
  useCases,
  instance,
  course,
  chapter,
  random = Math.random,
}: {
  useCases: UseCases;
  instance: Instance;
  course: Course;
  chapter: CourseChapter;
  /** Uniform [0, 1) source the queue and options are shuffled by. */
  random?: () => number;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const deck = course.deck;
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

  const completeMutation = useMutation({
    mutationFn: () => useCases.completeChapter(deck, chapter.url),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: courseKey(deck.url) }),
        queryClient.invalidateQueries({ queryKey: ["decks", instance.url] }),
      ]);
    },
  });

  function next() {
    answerMutation.reset();
    setAnswer(null);
    setPosition(position + 1);
    if (position + 1 === queue.length) completeMutation.mutate();
  }

  const index = course.outline.chapters.findIndex((entry) => entry.url === chapter.url);
  const following = course.outline.chapters[index + 1];
  const completion: Completion | null =
    card !== null
      ? null
      : completeMutation.isSuccess
        ? {
            state: "done",
            ...(following === undefined
              ? {}
              : {
                  nextChapter: {
                    title: following.title,
                    href: routeToHash({
                      screen: "courseChapter",
                      instanceUrl: instance.url,
                      deckUrl: deck.url,
                      chapterUrl: following.url,
                    }),
                  },
                }),
          }
        : completeMutation.isError
          ? { state: "failed", error: errorText(completeMutation.error) }
          : { state: "saving" };

  return (
    <ChapterReviewScreen
      chapterTitle={chapter.title}
      position={position + 1}
      total={queue.length}
      card={card}
      choices={choices}
      answer={answer}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      completion={completion}
      onCheck={(choice) => answerMutation.mutate({ card: card!, choice })}
      onNext={next}
      onRetry={() => completeMutation.mutate()}
    />
  );
}
