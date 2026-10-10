import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { courseHref, decksHref, routeToHash } from "./router";

/**
 * Where a course's screens link to its chapters: Solid Memo's own course
 * routes, unless a provider says otherwise. The Studio's trial plays a
 * course with the same screens, its links its own (docs/studio.md, The
 * trial).
 */
export interface CourseLinks {
  /** The course's page. */
  courseHref(instanceUrl: string, deckUrl: string): string;
  /** A chapter's steps. */
  chapterHref(instanceUrl: string, deckUrl: string, chapterUrl: string): string;
  /** A chapter's final review. */
  reviewHref(instanceUrl: string, deckUrl: string, chapterUrl: string): string;
  /** The instance's deck list, which a finished course links back to; none where there is no list to go back to. */
  decksHref?(instanceUrl: string): string;
}

/** Solid Memo's course routes. */
export const APP_COURSE_LINKS: CourseLinks = {
  courseHref,
  chapterHref: (instanceUrl, deckUrl, chapterUrl) => routeToHash({ screen: "courseChapter", instanceUrl, deckUrl, chapterUrl }),
  reviewHref: (instanceUrl, deckUrl, chapterUrl) => routeToHash({ screen: "courseReview", instanceUrl, deckUrl, chapterUrl }),
  decksHref,
};

export const CourseLinksContext = createContext<CourseLinks>(APP_COURSE_LINKS);

/** The course links of the screen: Solid Memo's, unless a provider gives others. */
export function useCourseLinks(): CourseLinks {
  return useContext(CourseLinksContext);
}

/**
 * The time answers are given at: now, unless a provider says otherwise.
 * The Studio's trial moves it days ahead, to play the days to come.
 */
export const Clock = createContext<() => Date>(() => new Date());

/** The screen's clock (Clock). */
export function useClock(): () => Date {
  return useContext(Clock);
}
