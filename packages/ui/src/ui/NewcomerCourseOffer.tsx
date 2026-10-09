import { useId } from "preact/hooks";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";

/**
 * The library's course for newcomers, offered under the heading of an
 * empty deck list: a card dealt in with a fan of cards beside it and a
 * shine across it (style.css), its title, what it is, and one button
 * that starts it. A landmark named by the title, not a section with a
 * heading, so the Decks heading stays the screen's first; it takes no
 * focus. While the
 * course starts, the button is only aria-disabled, so focus stays on it.
 */
export function NewcomerCourseOffer({
  course,
  aboutHref,
  busy,
  error,
  onStart,
}: {
  course: LibraryDeck;
  /** The course's page in the library. */
  aboutHref: string;
  busy: boolean;
  error: ErrorText | null;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <aside class="newcomer-course" aria-labelledby={titleId}>
      <span class="newcomer-course-fan" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <div class="newcomer-course-body">
        <p class="newcomer-course-eyebrow">{t("newcomerCourse.eyebrow")}</p>
        <p id={titleId} class="newcomer-course-title">
          <ReaderText text={course.title} />
        </p>
        <p>{t("newcomerCourse.pitch")}</p>
        <p class="hint">
          {t("library.course")} · {t("common.cardCount", { count: course.cardCount })}
        </p>
        <div class="edit-actions">
          <button
            class="primary"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onStart();
            }}
          >
            {busy ? t("libraryDeck.starting") : t("newcomerCourse.start")}
          </button>
          <a class="button" href={aboutHref}>
            {t("newcomerCourse.about")}
          </a>
        </div>
        <ErrorMessage error={error} />
      </div>
    </aside>
  );
}
