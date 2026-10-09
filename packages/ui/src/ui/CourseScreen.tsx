import type { ComponentChildren } from "preact";
import type { ChapterState, CourseChapter, CourseOutline, CourseProgress } from "@solid-memo/domain/course";
import { isMarkdown } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import type { CompletedChapter } from "./CourseContainer";
import { Confetti } from "./Confetti";
import { DataText } from "./DataText";
import { CheckIcon } from "./icons";
import { useI18n, type I18n } from "./i18n";
import { linkify } from "./linkify";
import { ReaderText } from "./ReaderText";

function stateLabel(state: ChapterState, t: I18n["t"]): string {
  switch (state) {
    case "locked":
      return t("course.locked");
    case "open":
      return t("course.open");
    case "done":
      return t("course.done");
  }
}

/** How many sparkles burst from a chapter just completed. */
const SPARKLES = 8;

/**
 * A course as the learner has it (docs/courses.md): its title and blurb,
 * how far the learner is, a button to go on where they left off (the
 * step to resume at, or the final review once a chapter's steps are
 * done), and its chapters in order, each locked until the one before it
 * is completed, open, or done, with how many of its steps are done. An
 * open or done chapter's title links to it; a locked one's does not. A
 * chapter's description may be in Markdown (its `textFormat`); its title
 * is always plain. Once every chapter is done, the course says it is
 * finished, with a link back to the decks. A notice (a newer release of
 * the course on offer) goes under the blurb.
 *
 * Coming back from a chapter just completed, the page cheers: a word
 * that the chapter is done, above the button on, which takes the focus
 * (marked `data-arrival` for useScreenFocus), so a screen reader reads it
 * and Tab goes on to Continue; the chapter's Done badge pops with a
 * burst of sparkles; and when it was the course's last chapter left,
 * confetti falls over the page (Confetti). The motion is decoration only
 * (style.css), and none of it plays with motion reduced.
 */
export function CourseScreen({
  title,
  description,
  outline,
  progress,
  started,
  chapterHref,
  continueHref,
  decksHref,
  justCompleted,
  notice,
}: {
  title: LangText;
  description?: LangText;
  outline: CourseOutline;
  progress: CourseProgress;
  /** The learner has answered a question of it. */
  started: boolean;
  /** Where a chapter's title links. */
  chapterHref: (chapter: CourseChapter) => string;
  /** Where to go on; absent once every chapter is done. */
  continueHref?: string;
  /** The instance's deck list, which a finished course links back to. */
  decksHref: string;
  /** The chapter the learner has just completed, to cheer about. */
  justCompleted?: CompletedChapter;
  /** Shown under the blurb: the offer of a newer release. */
  notice?: ComponentChildren;
}) {
  const { t, tx, readerText, readerLang } = useI18n();
  const completed = outline.chapters.find((chapter) => chapter.url === justCompleted?.chapterUrl);
  const doneCount = progress.chapters.filter((chapter) => chapter.state === "done").length;
  return (
    <>
      <section class="course">
        <header>
          <h2>
            <ReaderText text={title} />
          </h2>
          <span class="hint">
            {t("course.chaptersDone", { done: doneCount, count: outline.chapters.length })}
          </span>
        </header>
        {description !== undefined && (
          <p class="deck-description" lang={readerLang(description)}>
            {linkify(readerText(description))}
          </p>
        )}
        {notice}
        {completed !== undefined && (
          <div class="course-cheer" data-arrival>
            <p>
              {justCompleted!.finishedCourse
                ? t("course.courseCompleted")
                : tx("course.chapterCompleted", { chapter: <ReaderText text={completed.title} /> })}
            </p>
            {continueHref !== undefined && <p>{t("course.continueOrStop")}</p>}
          </div>
        )}
        {continueHref === undefined ? (
          <>
            <p class="course-finished">
              <CheckIcon />
              {t("course.finished")}
            </p>
            <div class="actions">
              <a class="button primary" href={decksHref}>
                {t("course.backToDecks")}
              </a>
            </div>
          </>
        ) : (
          <div class="actions">
            <a class="button primary" href={continueHref}>
              {started ? t("course.continue") : t("course.start")}
            </a>
          </div>
        )}
        <ol class="course-chapters">
          {outline.chapters.map((chapter, index) => {
            const { state, doneStepIds } = progress.chapters[index]!;
            return (
              <li key={chapter.url} class={`course-chapter ${state}${chapter === completed ? " just-completed" : ""}`}>
                <h3>
                  <span class="course-chapter-number">{t("course.chapterNumber", { number: index + 1 })}</span>{" "}
                  {state === "locked" ? (
                    <ReaderText text={chapter.title} />
                  ) : (
                    <a href={chapterHref(chapter)}>
                      <ReaderText text={chapter.title} />
                    </a>
                  )}
                </h3>
                <span class={`course-state ${state}`}>
                  {stateLabel(state, t)}
                  {chapter === completed && (
                    <span class="course-sparkles" aria-hidden="true">
                      {Array.from({ length: SPARKLES }, (_, sparkle) => (
                        <span key={sparkle} style={{ "--angle": `${(sparkle * 360) / SPARKLES}deg` }} />
                      ))}
                    </span>
                  )}
                </span>
                {chapter.description !== undefined && (
                  <DataText text={chapter.description} markdown={isMarkdown(chapter.textFormat)} />
                )}
                <p class="hint">
                  {t("course.stepsDone", { done: doneStepIds.length, count: chapter.steps.length })}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
      {completed !== undefined && justCompleted!.finishedCourse && <Confetti />}
    </>
  );
}
