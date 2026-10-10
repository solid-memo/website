import { useQueries } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { chapterHref, courseKey } from "./CourseContainer";
import { useCourseLinks } from "./courseLinks";
import { CourseIcon } from "./icons";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/** A course still to finish, as the strip shows it. */
export interface CourseStripEntry {
  /** The course's deck. */
  key: string;
  title: LangText;
  /** The course's page. */
  href: string;
  /** Where to go on: the chapter the learner is at. */
  continueHref: string;
  /** The learner has answered a question of it. */
  started: boolean;
  /** Chapters completed, out of `count`. */
  done: number;
  count: number;
}

/**
 * The courses the learner has started and not finished, in a strip
 * above the deck list, so going on with one is never a menu away: each
 * with its title (to the course's page), how many chapters are done,
 * and a button to go on where they left off.
 */
export function CourseStrip({ entries }: { entries: readonly CourseStripEntry[] }) {
  const { t, readerText } = useI18n();
  if (entries.length === 0) return null;
  return (
    <aside class="course-strip" aria-label={t("deckList.courses")}>
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            <a class="course-strip-title" href={entry.href}>
              <CourseIcon />
              <ReaderText text={entry.title} />
            </a>
            <a
              class="button primary"
              href={entry.continueHref}
              aria-label={
                entry.started
                  ? t("deckList.continueCourseNamed", { course: readerText(entry.title) })
                  : t("deckList.startCourseNamed", { course: readerText(entry.title) })
              }
            >
              {entry.started ? t("course.continue") : t("course.start")}
            </a>
            <span class="hint">{t("course.chaptersDone", { done: entry.done, count: entry.count })}</span>
            <progress value={entry.done} max={entry.count} aria-label={t("deckList.courseProgress")} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Reads each course deck as a course (UseCases.getCourse), under the key
 * the course's own screens read and refresh it by, and shows those still
 * to finish, linked where the course links say (useCourseLinks). A
 * course not yet read, or that cannot be, is left out: the deck list
 * works without it.
 */
export function CourseStripContainer({
  useCases,
  instance,
  decks,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The decks that are courses, in the list's order. */
  decks: readonly Deck[];
}) {
  const links = useCourseLinks();
  const results = useQueries({
    queries: decks.map((deck) => ({
      queryKey: courseKey(deck.url),
      queryFn: () => useCases.getCourse(deck),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    })),
  });
  const entries = results.flatMap(({ data: course }): CourseStripEntry[] => {
    if (course === undefined) return [];
    // None once every chapter is done: a finished course is left out.
    const current = course.outline.chapters.find((chapter) => chapter.url === course.progress.currentChapterUrl);
    if (current === undefined) return [];
    return [
      {
        key: course.deck.url,
        title: course.release.title,
        href: links.courseHref(instance.url, course.deck.url),
        continueHref: chapterHref(links, instance.url, course, current),
        started: course.answeredCardIds.length > 0,
        done: course.progress.chapters.filter((chapter) => chapter.state === "done").length,
        count: course.outline.chapters.length,
      },
    ];
  });
  return <CourseStrip entries={entries} />;
}
