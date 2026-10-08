import type { ChapterState, CourseChapter, CourseOutline, CourseProgress } from "@solid-memo/domain/course";
import { isMarkdown } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
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

/**
 * A course as the learner has it (docs/courses.md): its title and blurb,
 * how far the learner is, a button to go on where they left off (the
 * step to resume at, or the final review once a chapter's steps are
 * done), and its chapters in order, each locked until the one before it
 * is completed, open, or done, with how many of its steps are done. An
 * open or done chapter's title links to it; a locked one's does not. A
 * chapter's description may be in Markdown (its `textFormat`); its title
 * is always plain.
 */
export function CourseScreen({
  title,
  description,
  outline,
  progress,
  started,
  chapterHref,
  continueHref,
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
}) {
  const { t, readerText, readerLang } = useI18n();
  const doneCount = progress.chapters.filter((chapter) => chapter.state === "done").length;
  return (
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
      {continueHref === undefined ? (
        <p class="course-finished">
          <CheckIcon />
          {t("course.finished")}
        </p>
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
            <li key={chapter.url} class={`course-chapter ${state}`}>
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
              <span class={`course-state ${state}`}>{stateLabel(state, t)}</span>
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
  );
}
