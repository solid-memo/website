// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useId } from "preact/hooks";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { CourseSummary } from "@solid-memo/application/courses";
import type { UseCases } from "@solid-memo/application/useCases";
import { courseProgress, type CourseChapter, type CourseProgress } from "@solid-memo/domain/course";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { chapterHref } from "./CourseContainer";
import { useCourseLinks } from "./courseLinks";
import { readsSpentAmong } from "./deckTreeEditor";
import { ErrorMessage } from "./ErrorMessage";
import { CourseIcon, LibraryIcon } from "./icons";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";
import { queryKeys } from "./queryKeys";

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
 * above the deck list, so going on with one is never a menu away: under
 * a heading that says what they are and why they are there, each with
 * its title (to the course's page), how many chapters are done, and a
 * button to go on where they left off. The heading's hint says courses
 * run alongside other decks; while the learner has nothing but courses,
 * a line under them points to the deck library (`libraryHref`), so a
 * course is never taken for all there is to learn.
 */
export function CourseStrip({
  entries,
  libraryHref,
}: {
  entries: readonly CourseStripEntry[];
  /** The deck library, pointed to while every deck is a course; no line without it. */
  libraryHref?: string;
}) {
  const { t, readerText } = useI18n();
  const headingId = useId();
  if (entries.length === 0) return null;
  return (
    <aside class="course-strip" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("deckList.courses")}</h2>
      <p class="hint">{t("deckList.coursesHint")}</p>
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
            <span class="hint">
              {t("course.chaptersDone", { done: entry.done, count: entry.count })}
            </span>
            <progress
              value={entry.done}
              max={entry.count}
              aria-label={t("deckList.courseProgress")}
            />
          </li>
        ))}
      </ul>
      {libraryHref !== undefined && (
        <div class="course-strip-library">
          <p>{t("deckList.coursesLibrary")}</p>
          <a class="button" href={libraryHref}>
            <LibraryIcon />
            {t("deckList.libraryLink")}
          </a>
        </div>
      )}
    </aside>
  );
}

/**
 * What the strip needs of a course deck (UseCases.getCourseSummary). Under
 * the key the course's own screens refresh it by, as one of its own (so
 * it is never taken for the whole course), with the release it is of;
 * fresh for a little while, so summaries fetched as the deck list's
 * arrangement is read (Workspace) serve the strip that follows.
 */
export function courseStripQuery(useCases: UseCases, deck: Deck) {
  return {
    queryKey: queryKeys.courseStrip(deck.url, deck.sourceUrl),
    queryFn: () => useCases.getCourseSummary(deck),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  };
}

/**
 * How many of the courses shown are read whole behind the strip, from
 * the library or a link: a catalog may list any number, and a course
 * read whole holds all its cards for a while. Any other reads as its
 * page opens.
 */
const COURSES_READ_BEHIND = 4;

/** Where a course not yet finished stands, as the strip shows it. */
interface CourseStanding {
  /** The chapter to go on with. */
  current: CourseChapter;
  /** The course's progress, of that chapter alone (chapterHref looks no further). */
  progress: CourseProgress;
  /** Chapters completed. */
  done: number;
}

/**
 * What each summary came to, and for which completed chapters. The strip
 * renders again as each course's summary arrives, and courses may share
 * one long outline, so nothing that walks an outline runs on each render:
 * it runs once per summary and value of the deck's completed chapters.
 */
const standings = new WeakMap<
  CourseSummary,
  { completedChapters: Deck["completedChapters"]; standing: CourseStanding | undefined }
>();

/** Where the course stands; none once every chapter is done, as a finished course is left out. */
function standingOf(
  summary: CourseSummary,
  completedChapters: Deck["completedChapters"],
): CourseStanding | undefined {
  const known = standings.get(summary);
  if (known !== undefined && known.completedChapters === completedChapters) return known.standing;
  const standing = workOutStanding(summary, completedChapters ?? []);
  standings.set(summary, { completedChapters, standing });
  return standing;
}

function workOutStanding(
  { outline, answeredCardIds }: CourseSummary,
  completedChapters: readonly string[],
): CourseStanding | undefined {
  const progress = courseProgress(outline, answeredCardIds, completedChapters);
  const at = progress.chapters.findIndex((chapter) => chapter.url === progress.currentChapterUrl);
  if (at === -1) return undefined;
  return {
    current: outline.chapters[at]!,
    progress: { ...progress, chapters: [progress.chapters[at]!] },
    done: progress.chapters.filter((chapter) => chapter.state === "done").length,
  };
}

/**
 * Reads what the strip needs of each course deck (courseStripQuery) and
 * shows those still to finish, as far as the deck says (its title and
 * completed chapters, so a deck read afresh moves the strip on), linked where the course links say (useCourseLinks). A
 * course not yet read, or that cannot be, is left out: the deck list
 * works without it. Once a course is shown, the whole of it (getCourse,
 * under queryKeys.course) is read behind it, for the first few
 * (COURSES_READ_BEHIND), so its page and chapter open on it, as Workspace
 * reads them. When the page session's reads of releases from a link are
 * spent (linkedReadsSpent), for a course here or for `readsRefused`, the
 * list's copies, one error says so above the strip.
 */
export function CourseStripContainer({
  useCases,
  instance,
  decks,
  libraryHref,
  readsRefused,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The decks that are courses, in the list's order. */
  decks: readonly Deck[];
  /** What refused a read for the list's copies (useCopies), if anything did. */
  readsRefused?: unknown;
  /** The deck library, while the instance has no deck that is not a course (CourseStrip). */
  libraryHref?: string;
}) {
  const { errorText } = useI18n();
  const links = useCourseLinks();
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: decks.map((deck) => courseStripQuery(useCases, deck)),
  });
  const entries = results.flatMap(({ data: summary }, at): CourseStripEntry[] => {
    if (summary === undefined) return [];
    const deck = decks[at]!;
    const standing = standingOf(summary, deck.completedChapters);
    if (standing === undefined) return [];
    const { current, progress, done } = standing;
    return [
      {
        key: deck.url,
        title: deck.title,
        href: links.courseHref(instance.url, deck.url),
        continueHref: chapterHref(links, instance.url, { deck, progress }, current),
        started: summary.answeredCardIds.length > 0,
        done,
        count: summary.outline.chapters.length,
      },
    ];
  });
  const shown = entries.map((entry) => entry.key).join(" ");
  useEffect(() => {
    const keys = new Set(shown.split(" "));
    for (const deck of decks.filter((one) => keys.has(one.url)).slice(0, COURSES_READ_BEHIND)) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.course(deck.url),
        queryFn: () => useCases.getCourse(deck),
        staleTime: 30_000,
      });
    }
  }, [shown]);
  return (
    <>
      <ErrorMessage error={errorText(readsRefused ?? readsSpentAmong(results))} />
      <CourseStrip entries={entries} libraryHref={libraryHref} />
    </>
  );
}
