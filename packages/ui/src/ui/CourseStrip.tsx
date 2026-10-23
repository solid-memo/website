// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useId } from "preact/hooks";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { courseProgress } from "@solid-memo/domain/course";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { chapterHref } from "./CourseContainer";
import { useCourseLinks } from "./courseLinks";
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
 * Reads what the strip needs of each course deck (courseStripQuery) and
 * shows those still to finish, as far as the deck says (its title and
 * completed chapters, so a deck read afresh moves the strip on), linked where the course links say (useCourseLinks). A
 * course not yet read, or that cannot be, is left out: the deck list
 * works without it. Once a course is shown, the whole of it (getCourse,
 * under queryKeys.course) is read behind it, so its page and chapter open on
 * it, as Workspace reads them.
 */
export function CourseStripContainer({
  useCases,
  instance,
  decks,
  libraryHref,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The decks that are courses, in the list's order. */
  decks: readonly Deck[];
  /** The deck library, while the instance has no deck that is not a course (CourseStrip). */
  libraryHref?: string;
}) {
  const links = useCourseLinks();
  const queryClient = useQueryClient();
  const results = useQueries({
    queries: decks.map((deck) => courseStripQuery(useCases, deck)),
  });
  const entries = results.flatMap(({ data: summary }, at): CourseStripEntry[] => {
    if (summary === undefined) return [];
    const deck = decks[at]!;
    const { outline, answeredCardIds } = summary;
    const progress = courseProgress(outline, answeredCardIds, deck.completedChapters ?? []);
    // None once every chapter is done: a finished course is left out.
    const current = outline.chapters.find((chapter) => chapter.url === progress.currentChapterUrl);
    if (current === undefined) return [];
    return [
      {
        key: deck.url,
        title: deck.title,
        href: links.courseHref(instance.url, deck.url),
        continueHref: chapterHref(links, instance.url, { deck, progress }, current),
        started: answeredCardIds.length > 0,
        done: progress.chapters.filter((chapter) => chapter.state === "done").length,
        count: outline.chapters.length,
      },
    ];
  });
  const shown = entries.map((entry) => entry.key).join(" ");
  useEffect(() => {
    for (const deck of decks) {
      if (!shown.split(" ").includes(deck.url)) continue;
      void queryClient.prefetchQuery({
        queryKey: queryKeys.course(deck.url),
        queryFn: () => useCases.getCourse(deck),
        staleTime: 30_000,
      });
    }
  }, [shown]);
  return <CourseStrip entries={entries} libraryHref={libraryHref} />;
}
