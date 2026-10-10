import type { Course, UseCases } from "@solid-memo/application/useCases";
import type { CourseChapter } from "@solid-memo/domain/course";
import type { Instance } from "@solid-memo/domain/instance";
import { useCourseLinks, type CourseLinks } from "./courseLinks";
import { CourseScreen } from "./CourseScreen";
import { LibraryUpgradeContainer } from "./LibraryUpgradeContainer";

/**
 * The key a course as the learner has it (UseCases.getCourse) is queried
 * under: Workspace reads it to resolve the course routes, and the
 * course's screens refresh it after what they write.
 */
export function courseKey(deckUrl: string): string[] {
  return ["course", deckUrl];
}

/**
 * Where a chapter of the course is taken up: its steps, from the first
 * not done, or its final review once they all are and it is not yet
 * completed. A completed chapter opens at its steps again, for practice.
 */
export function chapterHref(links: CourseLinks, instanceUrl: string, course: Course, chapter: CourseChapter): string {
  const progress = course.progress.chapters.find((entry) => entry.url === chapter.url)!;
  const toReview = progress.state === "open" && progress.resumeStepId === undefined;
  return (toReview ? links.reviewHref : links.chapterHref)(instanceUrl, course.deck.url, chapter.url);
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
 * links say (useCourseLinks).
 */
export function CourseContainer({
  useCases,
  instance,
  course,
  justCompleted,
}: {
  useCases: UseCases;
  instance: Instance;
  course: Course;
  justCompleted?: CompletedChapter;
}) {
  const links = useCourseLinks();
  const instanceUrl = instance.url;
  const current = course.outline.chapters.find((chapter) => chapter.url === course.progress.currentChapterUrl);
  return (
    <CourseScreen
      title={course.release.title}
      description={course.release.description}
      outline={course.outline}
      progress={course.progress}
      started={course.answeredCardIds.length > 0}
      chapterHref={(chapter) => chapterHref(links, instanceUrl, course, chapter)}
      continueHref={current === undefined ? undefined : chapterHref(links, instanceUrl, course, current)}
      decksHref={links.decksHref?.(instanceUrl)}
      justCompleted={justCompleted}
      notice={<LibraryUpgradeContainer useCases={useCases} instance={instance} deck={course.deck} />}
    />
  );
}
