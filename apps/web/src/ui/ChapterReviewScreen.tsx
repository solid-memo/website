import { useLayoutEffect, useRef } from "preact/hooks";
import type { Choice } from "@solid-memo/domain/course";
import type { CardContent } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { CourseQuestion, type CheckedAnswer } from "./CourseQuestion";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { Loading } from "./Loading";
import { ReaderText } from "./ReaderText";

/**
 * How the chapter's completion stands, once every question is answered
 * right. Once it is done, the learner is on the course's page.
 */
export type Completion = { state: "saving" } | { state: "failed"; error: ErrorText | null };

/**
 * A chapter's final review. It opens on a word before it: that every
 * step of the chapter is done, and what the review is, with a button to
 * start it and a link back to the course's chapters. Its heading is the
 * screen's, which the page focuses as the learner arrives (from the
 * chapter's last step or the course's page alike). Then every question
 * of its steps and its own review questions, shuffled, one at a time
 * (CourseQuestion), each taking the focus as it comes up; a question
 * answered wrongly comes back later, until each is answered right. Then
 * the chapter is completed, and while that is saved, or when it fails,
 * the screen says so in place of the question, and takes the focus as
 * the question had it.
 */
export function ChapterReviewScreen({
  chapterTitle,
  started,
  courseHref,
  position,
  total,
  card,
  choices,
  answer,
  busy,
  error,
  completion,
  onStart,
  onCheck,
  onNext,
  onRetry,
}: {
  chapterTitle: LangText;
  /** The learner has started the review, past the word before it. */
  started: boolean;
  /** The course's page, with its chapters: the way back before starting. */
  courseHref: string;
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
  onStart: () => void;
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
        {started && card !== null && (
          <span class="hint">{t("chapterReview.position", { position, total })}</span>
        )}
      </header>
      {!started ? (
        <div class="course-review-start">
          <p class="course-review-cheer">{t("chapterReview.cheer")}</p>
          <p>{t("chapterReview.about")}</p>
          <div class="actions">
            <button class="primary" onClick={onStart}>
              {t("chapterReview.start")}
            </button>
            <a class="button" href={courseHref}>
              {t("chapterReview.backToCourse")}
            </a>
          </div>
        </div>
      ) : card === null ? (
        <ReviewEnd completion={completion!} onRetry={onRetry} />
      ) : (
        <CourseQuestion
          key={position}
          card={card}
          choices={choices}
          answer={answer}
          focusQuestion
          busy={busy}
          error={error}
          nextLabel={t("chapterReview.next")}
          onCheck={onCheck}
          onNext={onNext}
        />
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
  const { t } = useI18n();
  const endRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    endRef.current!.focus();
  }, [completion.state]);
  return (
    <div ref={endRef} class="course-review-end" tabIndex={-1}>
      {completion.state === "saving" ? (
        <Loading label={t("chapterReview.completing")} />
      ) : (
        <>
          <ErrorMessage error={completion.error} />
          <button onClick={onRetry}>{t("chapterReview.retry")}</button>
        </>
      )}
    </div>
  );
}
