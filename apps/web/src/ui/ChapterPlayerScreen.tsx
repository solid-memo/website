import { useLayoutEffect, useRef } from "preact/hooks";
import type { Choice, CourseChapter } from "@solid-memo/domain/course";
import { isMarkdown, type CardContent } from "@solid-memo/domain/deck";
import { CourseQuestion, type CheckedAnswer } from "./CourseQuestion";
import { DataProse } from "./DataText";
import { useI18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";

/**
 * One chapter of a course, a step at a time: the step's theory, to read
 * in the reader's language, then "Check your understanding", its
 * questions one after another (CourseQuestion), each answered and
 * explained before Next. Next after the chapter's last question goes to
 * its final review.
 *
 * As a new step comes up, its heading takes the focus, so its theory is
 * read before its question; a second question of the same step takes the
 * focus itself.
 *
 * Theory in Markdown (the step's `textFormat`) is shown as its blocks;
 * plain theory as paragraphs, split at its blank lines (DataProse).
 */
export function ChapterPlayerScreen({
  chapter,
  stepIndex,
  questionIndex,
  card,
  choices,
  answer,
  busy,
  error,
  onCheck,
  onNext,
}: {
  chapter: CourseChapter;
  /** The step shown, 0-based in the chapter's steps. */
  stepIndex: number;
  /** The question shown, 0-based in the step's. */
  questionIndex: number;
  /** The question's card. */
  card: CardContent;
  choices: readonly Choice[];
  answer: CheckedAnswer | null;
  busy: boolean;
  error: ErrorText | null;
  onCheck: (choice: Choice) => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const step = chapter.steps[stepIndex]!;
  const stepRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(stepIndex);
  const last = stepIndex === chapter.steps.length - 1 && questionIndex === step.questionIds.length - 1;

  useLayoutEffect(() => {
    if (shownStep.current === stepIndex) return;
    shownStep.current = stepIndex;
    stepRef.current!.focus();
  }, [stepIndex]);

  return (
    <section class="course-player">
      <header>
        <h2>
          <ReaderText text={chapter.title} />
        </h2>
      </header>
      <article class="course-step">
        <h3 ref={stepRef} tabIndex={-1}>
          {t("chapterPlayer.step", { number: stepIndex + 1, count: chapter.steps.length })}
        </h3>
        <progress
          class="course-progress"
          value={stepIndex}
          max={chapter.steps.length}
          aria-label={t("chapterPlayer.progress")}
        />
        <DataProse class="course-theory" text={step.theory} markdown={isMarkdown(step.textFormat)} />
      </article>
      <h3 class="course-check-heading">
        {step.questionIds.length > 1
          ? t("chapterPlayer.checkNumbered", { number: questionIndex + 1, count: step.questionIds.length })
          : t("chapterPlayer.check")}
      </h3>
      <CourseQuestion
        key={`${stepIndex}:${questionIndex}`}
        card={card}
        choices={choices}
        answer={answer}
        focusQuestion={questionIndex > 0}
        busy={busy}
        error={error}
        nextLabel={last ? t("chapterPlayer.toReview") : t("chapterPlayer.next")}
        onCheck={onCheck}
        onNext={onNext}
      />
    </section>
  );
}
