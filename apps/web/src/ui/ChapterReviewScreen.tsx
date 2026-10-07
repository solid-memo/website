import { useLayoutEffect, useRef } from "preact/hooks";
import type { Choice } from "@solid-memo/domain/course";
import type { CardContent } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { CourseQuestion, type CheckedAnswer } from "./CourseQuestion";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { CheckIcon } from "./icons";
import { Loading } from "./Loading";
import { ReaderText } from "./ReaderText";

/** How the chapter's completion stands, once every question is answered right. */
export type Completion =
  | { state: "saving" }
  | { state: "failed"; error: ErrorText | null }
  | { state: "done"; nextChapter?: { title: LangText; href: string } };

/**
 * A chapter's final review: every question of its steps and its own
 * review questions, shuffled, one at a time (CourseQuestion); a question
 * answered wrongly comes back later, until each is answered right. Then
 * the chapter is completed, and the screen says so, with a link to the
 * next chapter, or, after the last, that the course is finished; the way
 * back to the course is its breadcrumb. The end takes the focus, as the
 * question it replaces had it.
 */
export function ChapterReviewScreen({
  chapterTitle,
  position,
  total,
  card,
  choices,
  answer,
  busy,
  error,
  completion,
  onCheck,
  onNext,
  onRetry,
}: {
  chapterTitle: LangText;
  /** 1-based position of the question shown. */
  position: number;
  /** Questions in the review, including those coming back. */
  total: number;
  /** The question's card; null once every question is answered right. */
  card: CardContent | null;
  choices: readonly Choice[];
  answer: CheckedAnswer | null;
  busy: boolean;
  error: ErrorText | null;
  /** Set once every question is answered right. */
  completion: Completion | null;
  onCheck: (choice: Choice) => void;
  onNext: () => void;
  /** Tries completing the chapter again, after it failed. */
  onRetry: () => void;
}) {
  const { t, tx } = useI18n();
  return (
    <section class="course-review">
      <header>
        <h2>
          {tx("chapterReview.heading", { chapter: <ReaderText text={chapterTitle} /> })}
        </h2>
        {card !== null && <span class="hint">{t("chapterReview.position", { position, total })}</span>}
      </header>
      {card === null ? (
        <ReviewEnd completion={completion!} onRetry={onRetry} />
      ) : (
        <>
          <p class="hint">{t("chapterReview.intro")}</p>
          <CourseQuestion
            key={position}
            card={card}
            choices={choices}
            answer={answer}
            focusQuestion={position > 1}
            busy={busy}
            error={error}
            nextLabel={t("chapterReview.next")}
            onCheck={onCheck}
            onNext={onNext}
          />
        </>
      )}
    </section>
  );
}

function ReviewEnd({
  completion,
  onRetry,
}: {
  completion: Completion;
  onRetry: () => void;
}) {
  const { t, tx } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    endRef.current!.focus();
  }, [completion.state]);
  return (
    <div ref={endRef} class="course-review-end" tabIndex={-1}>
      {completion.state === "saving" && <Loading label={t("chapterReview.completing")} />}
      {completion.state === "failed" && (
        <>
          <ErrorMessage error={completion.error} />
          <button onClick={onRetry}>{t("chapterReview.retry")}</button>
        </>
      )}
      {completion.state === "done" && (
        <>
          <p class="course-finished">
            <CheckIcon />
            {completion.nextChapter === undefined ? t("chapterReview.courseDone") : t("chapterReview.chapterDone")}
          </p>
          {/* The way back to the course is its breadcrumb (docs/routing.md). */}
          {completion.nextChapter !== undefined && (
            <div class="actions">
              <a class="button primary" href={completion.nextChapter.href}>
                {tx("chapterReview.nextChapter", { chapter: <ReaderText text={completion.nextChapter.title} /> })}
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
