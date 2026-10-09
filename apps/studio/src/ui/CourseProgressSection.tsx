import type { Course } from "@solid-memo/application/useCases";
import type { CompletedChaptersEdit } from "@solid-memo/domain/course";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { ReaderText } from "@solid-memo/ui/ReaderText";

/**
 * A course's chapters as the learner stands in them (courseProgress):
 * each done, open or locked. A chapter done can be marked not done, and
 * the course restarted, once the user confirms: no chapter done. A
 * chapter the deck completed that the release no longer has (retired)
 * is listed by its id, to mark not done too. Answers and review states
 * stay as they are either way. While the course is read the section
 * says so, and why it could not be (`unreadable`).
 */
export function CourseProgressSection({
  course,
  unreadable,
  busy,
  onEdit,
}: {
  course: Course | undefined;
  unreadable: ErrorText | null;
  busy: boolean;
  onEdit: (edit: CompletedChaptersEdit) => void;
}) {
  const { t, readerText } = useI18n();

  if (course === undefined) {
    return (
      <section aria-labelledby="course-progress-heading">
        <h3 id="course-progress-heading">{t("studio.about.progress")}</h3>
        {unreadable === null ? <p class="hint">{t("studio.about.progressLoading")}</p> : <ErrorMessage error={unreadable} />}
      </section>
    );
  }

  const inOutline = new Set(course.outline.chapters.map((chapter) => chapter.id));
  const gone = (course.deck.completedChapters ?? []).filter((url) => !inOutline.has(fragmentIdOf(url)));
  const done = course.progress.chapters.some((chapter) => chapter.state === "done") || gone.length > 0;
  const notDone = (chapterUrl: string, name: string) => (
    <button
      type="button"
      disabled={busy}
      aria-label={t("studio.about.notDoneLabel", { chapter: name })}
      onClick={() => onEdit({ kind: "notDone", chapterUrl })}
    >
      {t("studio.about.notDone")}
    </button>
  );

  return (
    <section aria-labelledby="course-progress-heading">
      <h3 id="course-progress-heading">{t("studio.about.progress")}</h3>
      <ol class="studio-chapters">
        {course.outline.chapters.map((chapter, index) => {
          const { state } = course.progress.chapters[index]!;
          return (
            <li key={chapter.id}>
              <ReaderText text={chapter.title} /> <span class="studio-badge">{t(`studio.about.chapter.${state}`)}</span>
              {state === "done" && <> {notDone(chapter.url, readerText(chapter.title))}</>}
            </li>
          );
        })}
      </ol>
      {gone.length > 0 && (
        <>
          <p>{t("studio.about.goneChapters")}</p>
          <ul>
            {gone.map((url) => (
              <li key={url}>
                <code>{fragmentIdOf(url)}</code> {notDone(url, fragmentIdOf(url))}
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="hint">{t("studio.about.progressHint")}</p>
      {done && (
        <button
          type="button"
          class="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("studio.about.restartConfirm"))) onEdit({ kind: "restart" });
          }}
        >
          {t("studio.about.restart")}
        </button>
      )}
    </section>
  );
}
