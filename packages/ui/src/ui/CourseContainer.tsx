// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LibraryUseCases } from "@solid-memo/application/library";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Course } from "@solid-memo/application/courses";
import type { ChapterProgress, CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import { useCourseLinks, type CourseLinks } from "./courseLinks";
import { CourseScreen } from "./CourseScreen";
import { LibraryUpgradeContainer } from "./LibraryUpgradeContainer";
import { usePausedToday } from "./pausedToday";

/**
 * Where a chapter of the course is taken up: its steps, from the first
 * not done, or its final review once they all are and it is not yet
 * completed. A completed chapter opens at its steps again, for practice;
 * one with no step (outlineOfCards) always opens at its final review.
 * The caller has the chapter's progress at hand, so this looks up
 * nothing, however many chapters the course has.
 */
export function chapterHref(
  links: CourseLinks,
  instanceUrl: string,
  deckUrl: string,
  chapter: CourseChapter,
  progress: ChapterProgress,
): string {
  const toReview =
    chapter.steps.length === 0 ||
    (progress.state === "open" && progress.resumeStepId === undefined);
  return (toReview ? links.reviewHref : links.chapterHref)(instanceUrl, deckUrl, chapter.url);
}

/** A chapter the learner has just completed, as they come back to the course's page. */
export interface CompletedChapter {
  chapterUrl: string;
  /** Completing it completed the course: it was the last chapter left. */
  finishedCourse: boolean;
}

/**
 * Owns a course's page. The course itself is resolved by Workspace
 * (courseQuery), which the page needs for its trail too; so is the
 * chapter just completed, which Workspace keeps as the learner comes
 * back from its final review. A newer release of the course is offered
 * here as on the deck's page (LibraryUpgradeContainer), since the
 * learner comes here, not there. Its chapters link where the course
 * links say (useCourseLinks). A course whose deck is paused today is
 * paused with it (usePausedToday): its page offers no way on.
 */
export function CourseContainer({
  useCases,
  instance,
  course,
  justCompleted,
}: {
  useCases: LibraryUseCases & Pick<UseCases, "getPreferences">;
  instance: Instance;
  course: Course;
  justCompleted?: CompletedChapter;
}) {
  const links = useCourseLinks();
  const instanceUrl = instance.url;
  const deckUrl = course.deck.url;
  // The chapter to go on with is the one open (courseProgress opens one at most).
  const at = course.progress.chapters.findIndex((chapter) => chapter.state === "open");
  const paused = usePausedToday(useCases, instanceUrl)(course.deck);
  return (
    <CourseScreen
      title={course.release.title}
      description={course.release.description}
      outline={course.outline}
      progress={course.progress}
      started={course.answeredCardIds.length > 0}
      chapterHref={(chapter, progress) =>
        chapterHref(links, instanceUrl, deckUrl, chapter, progress)
      }
      continueHref={
        at === -1
          ? undefined
          : chapterHref(
              links,
              instanceUrl,
              deckUrl,
              course.outline.chapters[at]!,
              course.progress.chapters[at]!,
            )
      }
      decksHref={links.decksHref?.(instanceUrl)}
      libraryHref={links.libraryHref?.(instanceUrl)}
      preferencesHref={links.preferencesHref?.(instanceUrl, course.deck.url)}
      justCompleted={justCompleted}
      paused={paused}
      notice={
        <LibraryUpgradeContainer useCases={useCases} instance={instance} deck={course.deck} />
      }
    />
  );
}
