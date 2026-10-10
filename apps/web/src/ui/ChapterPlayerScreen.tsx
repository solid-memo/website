import { useId, useLayoutEffect, useRef } from "preact/hooks";
import type { Choice, CourseChapter } from "@solid-memo/domain/course";
import { isMarkdown, type CardContent } from "@solid-memo/domain/deck";
import { CourseQuestion, type CheckedAnswer } from "./CourseQuestion";
import { DataProse, useProseChunks } from "./DataText";
import { useI18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";

/** Which half of a step is shown: its theory, or its questions. */
export type StepPhase = "read" | "answer";

/**
 * One chapter of a course, a step at a time, each in two phases. First
 * the step's theory, to read in the reader's language, with a button on
 * to its questions and a hint that the theory is not shown while
 * answering. Then "Check your understanding", its questions one after
 * another (CourseQuestion), each answered and explained before Next,
 * with the theory not rendered at all: answering checks what was
 * understood, not what can be read off the screen. Next after the step's
 * last question goes to the next step's theory, or, after the chapter's
 * last step, to its final review.
 *
 * As a new step comes up, its heading takes the focus, so its theory is
 * read first; as each of its questions comes up, the "Check your
 * understanding" heading takes it, so the question is read after what it
 * is (which question of how many). The step the chapter opens at leaves
 * the focus where the page put it. The hint is the button's description,
 * so the learner hears that the theory goes away before pressing it.
 *
 * Theory in Markdown (the step's `textFormat`) is shown as its blocks;
 * plain theory as paragraphs, split at its blank lines (DataProse).
 * Markdown theory with top-level thematic breaks is read a chunk at a
 * time: which part of how many, the chunk, Back to the one before (from
 * the second on) and Continue to the next; the last chunk has the hint
 * and the button on to the questions. Moving to another chunk of the
 * same step puts the focus on which part it is, so the chunk is read
 * from its start. A chunk past the last, as when switching the reader's
 * language leaves fewer, shows the last. Theory in one chunk shows as it
 * always has.
 */
export function ChapterPlayerScreen({
  chapter,
  stepIndex,
  phase,
  questionIndex,
  chunkIndex,
  card,
  choices,
  answer,
  busy,
  error,
  onAnswerPhase,
  onChunk,
  onCheck,
  onNext,
}: {
  chapter: CourseChapter;
  /** The step shown, 0-based in the chapter's steps. */
  stepIndex: number;
  phase: StepPhase;
  /** The question shown while answering, 0-based in the step's. */
  questionIndex: number;
  /** The chunk of the step's theory shown while reading, 0-based. */
  chunkIndex: number;
  /** The question's card. */
  card: CardContent;
  choices: readonly Choice[];
  answer: CheckedAnswer | null;
  busy: boolean;
  error: ErrorText | null;
  /** Leaves the theory for the step's questions. */
  onAnswerPhase: () => void;
  /** Shows another chunk of the step's theory, 0-based. */
  onChunk: (index: number) => void;
  onCheck: (choice: Choice) => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const step = chapter.steps[stepIndex]!;
  const hintId = useId();
  const stepRef = useRef<HTMLHeadingElement>(null);
  const checkRef = useRef<HTMLHeadingElement>(null);
  const partRef = useRef<HTMLParagraphElement>(null);
  const shownStep = useRef(stepIndex);
  const markdown = isMarkdown(step.textFormat);
  const chunks = useProseChunks(step.theory, markdown);
  const chunk = Math.min(chunkIndex, chunks - 1);
  const lastChunk = chunk === chunks - 1;
  const shownChunk = useRef({ step: stepIndex, chunk: chunkIndex });
  const last = stepIndex === chapter.steps.length - 1 && questionIndex === step.questionIds.length - 1;

  useLayoutEffect(() => {
    if (shownStep.current === stepIndex) return;
    shownStep.current = stepIndex;
    stepRef.current!.focus();
  }, [stepIndex]);
  useLayoutEffect(() => {
    const before = shownChunk.current;
    shownChunk.current = { step: stepIndex, chunk: chunkIndex };
    // A new step's heading takes the focus; only a chunk the learner moved to within a step moves it.
    if (before.step === stepIndex && before.chunk !== chunkIndex) partRef.current!.focus();
  }, [stepIndex, chunkIndex]);
  useLayoutEffect(() => {
    if (phase === "answer") checkRef.current!.focus();
  }, [phase, stepIndex, questionIndex]);

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
        {phase === "read" && (
          <>
            {chunks > 1 && (
              <p ref={partRef} class="course-part" tabIndex={-1}>
                {t("chapterPlayer.part", { number: chunk + 1, count: chunks })}
              </p>
            )}
            <DataProse class="course-theory" text={step.theory} markdown={markdown} chunk={chunk} />
            <div class="course-to-questions">
              {lastChunk && (
                <p id={hintId} class="hint">
                  {t("chapterPlayer.theoryHidden")}
                </p>
              )}
              <div class="actions">
                {chunk > 0 && <button onClick={() => onChunk(chunk - 1)}>{t("chapterPlayer.back")}</button>}
                {lastChunk ? (
                  <button class="primary" aria-describedby={hintId} onClick={onAnswerPhase}>
                    {t("chapterPlayer.toQuestions", { count: step.questionIds.length })}
                  </button>
                ) : (
                  <button class="primary" onClick={() => onChunk(chunk + 1)}>
                    {t("chapterPlayer.continue")}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </article>
      {phase === "answer" && (
        <>
          <h3 ref={checkRef} class="course-check-heading" tabIndex={-1}>
            {step.questionIds.length > 1
              ? t("chapterPlayer.checkNumbered", { number: questionIndex + 1, count: step.questionIds.length })
              : t("chapterPlayer.check")}
          </h3>
          <CourseQuestion
            key={`${stepIndex}:${questionIndex}`}
            card={card}
            choices={choices}
            answer={answer}
            focusQuestion={false}
            busy={busy}
            error={error}
            nextLabel={last ? t("chapterPlayer.toReview") : t("chapterPlayer.next")}
            onCheck={onCheck}
            onNext={onNext}
          />
        </>
      )}
    </section>
  );
}
