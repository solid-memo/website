import { useId, useLayoutEffect, useRef } from "preact/hooks";
import type { CourseAnswer } from "@solid-memo/application/useCases";
import type { Choice } from "@solid-memo/domain/course";
import { promptSides, type CardContent } from "@solid-memo/domain/deck";
import { CardFace } from "./CardFace";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { MultipleChoice } from "./MultipleChoice";
import { ReaderText } from "./ReaderText";

/** A question checked: the option chosen, and what the answer did to its card. */
export interface CheckedAnswer {
  choice: Choice;
  effect: CourseAnswer["effect"];
}

/**
 * One of a course's multiple-choice questions (a card: its front asks,
 * its back is the right option among its distractors), then what the
 * answer was: right or wrong said in a status line, with "Added to your
 * deck" when the answer brought the card into the learner's deck; why
 * the option chosen is wrong, when its distractor says; and the right
 * answer as the card's back has it, its note included. Then Next.
 *
 * Keyed by the caller, so each question starts unanswered. The focus
 * goes to the question as it comes up when `focusQuestion` (not when the
 * screen's heading, or a step's theory, should be read first), and to
 * the feedback once checked, where Enter goes on as Next does.
 */
export function CourseQuestion({
  card,
  choices,
  answer,
  focusQuestion,
  busy,
  error,
  nextLabel,
  onCheck,
  onNext,
}: {
  card: CardContent;
  /** The options, in the order shown. */
  choices: readonly Choice[];
  /** Null until checked. */
  answer: CheckedAnswer | null;
  focusQuestion: boolean;
  busy: boolean;
  error: ErrorText | null;
  /** What Next says: "Next", "Final review", "Finish". */
  nextLabel: string;
  onCheck: (choice: Choice) => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const questionId = useId();
  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const { question, answer: rightAnswer } = promptSides({ card, direction: "front-to-back" });
  const correct = choices.find((choice) => choice.correct)!;
  const checked = answer !== null;

  useLayoutEffect(() => {
    if (focusQuestion) questionRef.current!.focus();
  }, []);
  useLayoutEffect(() => {
    if (checked) feedbackRef.current!.focus();
  }, [checked]);

  const verdict =
    answer === null
      ? ""
      : [
          answer.choice.correct ? t("courseQuestion.right") : t("courseQuestion.wrong"),
          ...(answer.effect === "introduce" ? [t("courseQuestion.added")] : []),
        ].join(" ");

  function onFeedbackKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter" || (event.target as Element).closest("button")) return;
    event.preventDefault();
    onNext();
  }

  return (
    <div class="course-question">
      <div ref={questionRef} id={questionId} class="study-face" tabIndex={-1}>
        <CardFace {...question} note={undefined} role="question" />
      </div>
      <MultipleChoice
        labelledBy={questionId}
        choices={choices}
        answered={answer === null ? undefined : { chosen: answer.choice.key, correct: correct.key }}
        busy={busy}
        onCheck={(key) => onCheck(choices.find((choice) => choice.key === key)!)}
      />
      {/* Mounted for the whole question, so its verdict is heard as it comes. */}
      <p
        role="status"
        class={`course-verdict${answer === null ? "" : answer.choice.correct ? " right" : " wrong"}`}
      >
        {verdict}
      </p>
      {answer !== null && (
        <div ref={feedbackRef} class="course-feedback" tabIndex={-1} onKeyDown={onFeedbackKeyDown}>
          {answer.choice.note !== undefined && (
            <p class="course-why">
              {t("courseQuestion.why")} <ReaderText text={answer.choice.note} />
            </p>
          )}
          <div class="course-right-answer">
            <CardFace {...rightAnswer} role="answer" />
          </div>
          <button class="primary" onClick={onNext}>
            {nextLabel}
          </button>
        </div>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
