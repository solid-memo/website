import type { Course } from "@solid-memo/application/useCases";
import type { CourseChapter } from "@solid-memo/domain/course";
import { CourseScreen } from "./CourseScreen";
import { decksHref, routeToHash } from "./router";

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
export function chapterHref(instanceUrl: string, course: Course, chapter: CourseChapter): string {
  const progress = course.progress.chapters.find((entry) => entry.url === chapter.url)!;
  const toReview = progress.state === "open" && progress.resumeStepId === undefined;
  return routeToHash({
    screen: toReview ? "courseReview" : "courseChapter",
    instanceUrl,
    deckUrl: course.deck.url,
    chapterUrl: chapter.url,
  });
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
 * back from its final review.
 */
export function CourseContainer({
  instanceUrl,
  course,
  justCompleted,
}: {
  instanceUrl: string;
  course: Course;
  justCompleted?: CompletedChapter;
}) {
  const current = course.outline.chapters.find((chapter) => chapter.url === course.progress.currentChapterUrl);
  return (
    <CourseScreen
      title={course.release.title}
      description={course.release.description}
      outline={course.outline}
      progress={course.progress}
      started={course.answeredCardIds.length > 0}
      chapterHref={(chapter) => chapterHref(instanceUrl, course, chapter)}
      continueHref={current === undefined ? undefined : chapterHref(instanceUrl, course, current)}
      decksHref={decksHref(instanceUrl)}
      justCompleted={justCompleted}
    />
  );
}
