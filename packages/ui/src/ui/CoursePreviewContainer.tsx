// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { LibraryCourse } from "@solid-memo/application/library";
import type { UseCases } from "@solid-memo/application/useCases";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { nextPlace, type ChapterPlace } from "./ChapterPlayerContainer";
import { ChapterPlayerScreen } from "./ChapterPlayerScreen";
import { CoursePreviewScreen } from "./CoursePreviewScreen";
import type { CheckedAnswer } from "./CourseQuestion";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { queryKeys } from "./queryKeys";

/**
 * Fetches a library course's outline and cards (getLibraryCourse) and
 * shows its preview: the chapters, or the one `chapterId` names, played
 * as a course plays it (PreviewChapter). A chapter with no step, which
 * only a release the Studio didn't check has, is left out; a `chapterId`
 * naming no chapter left shows the chapters.
 */
export function CoursePreviewContainer({
  useCases,
  deck,
  deckHref,
  chapterId,
  chapterHref,
  onChapter,
  onExit,
  random = Math.random,
}: {
  useCases: UseCases;
  deck: LibraryDeck;
  /** URL of the course's page. */
  deckHref: string;
  /** The fragment id of the chapter opened; none to list the chapters. */
  chapterId?: string;
  /** URL of a chapter's preview, by its fragment id, or of the chapters for none. */
  chapterHref: (chapterId?: string) => string;
  /** Opens a chapter's preview, by its fragment id, or the chapters for none. */
  onChapter: (chapterId?: string) => void;
  onExit: () => void;
  /** Uniform [0, 1) source the options are shuffled by. */
  random?: () => number;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const courseQuery = useQuery({
    queryKey: queryKeys.libraryCourse(deck.url),
    queryFn: () => useCases.getLibraryCourse(deck),
  });

  if (courseQuery.error) {
    return <ErrorMessage error={errorText(courseQuery.error)} />;
  }
  if (courseQuery.data === undefined) {
    return <Loading label={t("coursePreview.loading")} />;
  }

  const course = courseQuery.data;
  const chapters = course.outline.chapters.filter((chapter) => chapter.steps.length > 0);
  const opened = chapters.findIndex((chapter) => chapter.id === chapterId);
  const following = chapters[opened + 1];

  return (
    <CoursePreviewScreen
      courseName={readerText(deck.title)}
      courseLang={readerLang(deck.title)}
      courseHref={deckHref}
      chapters={chapters}
      chapterHref={(chapter) => chapterHref(chapter?.id)}
      onExit={onExit}
    >
      {opened < 0 ? undefined : (
        <PreviewChapter
          key={chapterId}
          course={course}
          chapter={chapters[opened]!}
          lastLabel={
            following === undefined ? t("coursePreview.toChapters") : t("coursePreview.nextChapter")
          }
          onEnd={() => onChapter(following?.id)}
          random={random}
        />
      )}
    </CoursePreviewScreen>
  );
}

/**
 * One chapter of a course's preview, from its first step: each step's
 * theory, then its questions, each answered and explained as in the
 * course (ChapterPlayerScreen), but with nothing graded or recorded. The
 * chapter's final review is left out: after its last question it ends
 * (`onEnd`). Each question's options are shuffled once, as it comes up.
 */
function PreviewChapter({
  course,
  chapter,
  lastLabel,
  onEnd,
  random,
}: {
  course: LibraryCourse;
  chapter: CourseChapter;
  /** What Next says after the chapter's last question. */
  lastLabel: string;
  onEnd: () => void;
  random: () => number;
}) {
  const [at, setAt] = useState<ChapterPlace>({ step: 0, phase: "read", chunk: 0, question: 0 });
  const [answer, setAnswer] = useState<CheckedAnswer | null>(null);
  const card = course.cards.get(chapter.steps[at.step]!.questionIds[at.question]!)!;
  const choices = useMemo(() => choicesOf(card, random), [at.step, at.question]);

  function next() {
    setAnswer(null);
    const place = nextPlace(chapter, at);
    if (place === null) onEnd();
    else setAt(place);
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
      busy={false}
      error={null}
      onAnswerPhase={() => setAt({ ...at, phase: "answer" })}
      onChunk={(chunk) => setAt({ ...at, chunk })}
      onCheck={(choice) => setAnswer({ choice, effect: "none" })}
      lastLabel={lastLabel}
      arrival
      onNext={next}
    />
  );
}
