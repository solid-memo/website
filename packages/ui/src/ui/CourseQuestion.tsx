import { useId, useLayoutEffect, useRef } from "preact/hooks";
import type { CourseAnswer } from "@solid-memo/application/useCases";
import type { Choice } from "@solid-memo/domain/course";
import { isMarkdown, promptSides, type CardContent } from "@solid-memo/domain/deck";
import { isHttpUrl } from "@solid-memo/domain/webId";
import { CardFace } from "./CardFace";
import { DataText, plainDataText } from "./DataText";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { inDataRegion } from "./Markdown";
import { markdownBlocks } from "./markdownCache";
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
 * screen's heading should be read first), and to the feedback once
 * checked, where Enter goes on as Next does — but not on a link, or a
 * code block or table being scrolled.
 *
 * The options are named by the question. A question in Markdown may
 * hold a code block or a table, too much for a name, so its options are
 * named by its picture, as CardFace names it, and its plain label, and
 * described by the whole question when it is more than one paragraph.
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
  const { t, readerText } = useI18n();
  const questionId = useId();
  const nameId = useId();
  const markdown = isMarkdown(card.textFormat);
  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const { question, answer: rightAnswer } = promptSides({ card, direction: "front-to-back" });
  const correct = choices.find((choice) => choice.correct)!;
  const checked = answer !== null;
  const shownQuestion = readerText(question.text);
  const blocks = markdown ? markdownBlocks(shownQuestion) : null;
  // A question that is one paragraph is all in its name: no description repeats it.
  const singleParagraph = blocks !== null && blocks.length === 1 && blocks[0]!.type === "paragraph";

  /** The question's picture as CardFace names it, for the options' name. */
  function pictureName(): string[] {
    if (question.imageUrl === undefined) return [];
    if (!isHttpUrl(question.imageUrl)) return [t("cardFace.notWebUrl")];
    const description = question.imageDescription === undefined ? "" : readerText(question.imageDescription);
    return [description !== "" ? description : t("cardFace.frontPictureAlt")];
  }

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
    if (event.key !== "Enter" || (event.target as Element).closest("button") || inDataRegion(event.target as Element)) return;
    event.preventDefault();
    onNext();
  }

  return (
    <div class="course-question">
      <div ref={questionRef} id={questionId} class="study-face" tabIndex={-1}>
        <CardFace {...question} note={undefined} role="question" />
      </div>
      {markdown && (
        // Hidden, so it is read only as the options' name, not again after the question.
        <span id={nameId} hidden>
          {[`${t("cardFace.question")}:`, ...pictureName(), plainDataText(shownQuestion, true)].join(" ")}
        </span>
      )}
      <MultipleChoice
        labelledBy={markdown ? nameId : questionId}
        describedBy={markdown && !singleParagraph ? questionId : undefined}
        markdown={markdown}
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
          {answer.choice.note !== undefined &&
            (markdown ? (
              <div class="course-why">
                <span class="course-why-label">{t("courseQuestion.why")}</span>{" "}
                <DataText text={answer.choice.note} markdown />
              </div>
            ) : (
              <p class="course-why">
                {t("courseQuestion.why")} <ReaderText text={answer.choice.note} />
              </p>
            ))}
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
