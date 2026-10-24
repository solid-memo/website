// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Course } from "@solid-memo/application/courses";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import type { Storage } from "@solid-memo/domain/storage";
import { isCanonicalStatisticsHash, type RouteRef } from "./router";

/**
 * What a lookup the route needs has found so far: nothing it needs, a read
 * still under way, a read that failed, what it looks for not there, or it.
 */
export type Lookup<T> =
  | { status: "unneeded" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "missing" }
  | { status: "found"; value: T };

/** The value a lookup found, null otherwise. */
export function found<T>(lookup: Lookup<T>): T | null {
  return lookup.status === "found" ? lookup.value : null;
}

/** Whether a lookup is done with: what it looks for found or not there, or its read failed. */
export function settled(lookup: Lookup<unknown>): boolean {
  return lookup.status === "found" || lookup.status === "missing" || lookup.status === "failed";
}

/** What the workspace has read for a route, so far. */
export interface Loaded {
  /** The hash the route was read from, which may say more than the route keeps. */
  hash: string;
  /** The user's instances, undefined until they are read. */
  instances: readonly Instance[] | undefined;
  deck: Lookup<Deck>;
  card: Lookup<Card>;
  /** The library deck of a library route, or of a link to one (#/try). */
  libraryDeck: Lookup<LibraryDeck>;
  libraryCard: Lookup<LibraryCard>;
  /** The course the route's deck is the learner's copy of. */
  course: Lookup<Course>;
  /** Whether the course is being read afresh, so its progress may be behind. */
  courseRereading: boolean;
  /** The storages the storage picker offers, undefined until they are read. */
  storages: readonly Storage[] | undefined;
}

/**
 * Where a route goes instead, and whether that is because a link to a
 * library deck (#/try) named one the library does not have, which the
 * library says once it is open.
 */
export interface Redirect {
  to: RouteRef;
  triedUnknown: boolean;
}

/**
 * Where the route's chapter is in the course's outline (-1 when it is not,
 * or there is no course), and the chapter, null unless it is there and open.
 */
export function openChapterOf(course: Course | null, chapterUrl: string | null) {
  const chapterIndex =
    course === null ? -1 : course.outline.chapters.findIndex((c) => c.url === chapterUrl);
  const activeChapter =
    chapterIndex >= 0 && course!.progress.chapters[chapterIndex]!.state !== "locked"
      ? course!.outline.chapters[chapterIndex]!
      : null;
  return { chapterIndex, activeChapter };
}

/**
 * Whether a final review opens before its chapter's steps are done: once
 * the course is read afresh, as going on from the last step reaches the
 * review before that step's answer is read back.
 */
export function reviewTooSoon(route: RouteRef | null, course: Course | null, rereading: boolean) {
  if (route?.screen !== "courseReview" || rereading) return false;
  const { chapterIndex, activeChapter } = openChapterOf(course, route.chapterUrl);
  return (
    activeChapter !== null && course!.progress.chapters[chapterIndex]!.resumeStepId !== undefined
  );
}

/**
 * Where a link to a library deck (#/try) goes in an instance: the deck's
 * page, or the library when the library does not have it or cannot be read.
 */
export function triedTarget(instanceUrl: string, libraryDeck: Lookup<LibraryDeck>): Redirect {
  return libraryDeck.status === "found"
    ? {
        to: { screen: "libraryDeck", instanceUrl, libraryDeckUrl: libraryDeck.value.seriesUrl },
        triedUnknown: false,
      }
    : { to: { screen: "library", instanceUrl }, triedUnknown: libraryDeck.status === "missing" };
}

type CourseRoute = Extract<RouteRef, { screen: "course" | "courseChapter" | "courseReview" }>;

const go = (to: RouteRef): Redirect => ({ to, triedUnknown: false });

/** With no route, or an unknown instance: the only instance's decks, the picker, or the storages. */
function instanceRedirect(route: RouteRef | null, instances: readonly Instance[]) {
  if (route === null) {
    if (instances.length === 1) return go({ screen: "home", instanceUrl: instances[0]!.url });
    return go({ screen: instances.length > 1 ? "instancePicker" : "storagePicker" });
  }
  if ("instanceUrl" in route && !instances.some((i) => i.url === route.instanceUrl)) {
    return go({ screen: instances.length > 0 ? "instancePicker" : "storagePicker" });
  }
  return null;
}

/** A link to a library deck (#/try), once the library is read or failed: on to an only instance, or to make one. */
function tryRedirect(instances: readonly Instance[], libraryDeck: Lookup<LibraryDeck>) {
  if (!settled(libraryDeck)) return null;
  if (instances.length === 1) return triedTarget(instances[0]!.url, libraryDeck);
  return instances.length === 0 ? go({ screen: "storagePicker" }) : null;
}

/**
 * For a course's routes: a deck that is no copy of a release, to its page;
 * a chapter the course does not have or still locked, to the course; a
 * final review too soon, to its chapter.
 */
function courseRedirect(route: CourseRoute, deck: Deck, loaded: Loaded) {
  const { instanceUrl, deckUrl } = route;
  if (deck.sourceUrl === undefined) {
    return go({ screen: "deckDetail", instanceUrl, deckUrl });
  }
  const course = found(loaded.course);
  if (course === null || route.screen === "course") return null;
  if (openChapterOf(course, route.chapterUrl).activeChapter === null) {
    return go({ screen: "course", instanceUrl, deckUrl });
  }
  return reviewTooSoon(route, course, loaded.courseRereading)
    ? go({ ...route, screen: "courseChapter" })
    : null;
}

/** The redirect of the route's lookups after its instance's, in the order they are read. */
function lookupRedirect(route: RouteRef, loaded: Loaded): Redirect | null {
  if (!("instanceUrl" in route)) return null;
  const { instanceUrl } = route;
  if (loaded.deck.status === "missing") return go({ screen: "home", instanceUrl });
  if (
    (route.screen === "statistics" || route.screen === "deckStatistics") &&
    !isCanonicalStatisticsHash(loaded.hash)
  ) {
    return go(route);
  }
  if (route.screen === "card" && loaded.card.status === "missing") {
    return go({ screen: "browser", instanceUrl, deckUrl: route.deckUrl });
  }
  if (loaded.libraryDeck.status === "missing") return go({ screen: "library", instanceUrl });
  if (route.screen === "libraryCard" && loaded.libraryCard.status === "missing") {
    return go({ screen: "libraryBrowser", instanceUrl, libraryDeckUrl: route.libraryDeckUrl });
  }
  if (
    (route.screen === "course" ||
      route.screen === "courseChapter" ||
      route.screen === "courseReview") &&
    loaded.deck.status === "found"
  ) {
    return courseRedirect(route, loaded.deck.value, loaded);
  }
  return null;
}

/**
 * Where a route goes instead of opening, given what the workspace has read
 * for it so far; null while it opens, or what decides it is still being
 * read. The rules go in the order a route is resolved: no route, then a
 * link to a library deck (#/try), the instance, the deck, the statistics'
 * range and tab, the card, the library deck, the library card and the
 * course; the storage picker with a single storage goes on to the
 * instance creator. Each is a replace, never a Back stop (docs/routing.md).
 */
export function resolveRoute(route: RouteRef | null, loaded: Loaded): Redirect | null {
  const { instances } = loaded;
  if (instances === undefined) return null;
  if (route?.screen === "try") return tryRedirect(instances, loaded.libraryDeck);
  const redirect = instanceRedirect(route, instances) ?? lookupRedirect(route!, loaded);
  if (redirect !== null) return redirect;
  if (route!.screen === "storagePicker" && loaded.storages?.length === 1) {
    const [storage] = loaded.storages;
    return go({ screen: "instanceCreator", storageUrl: storage!.url, source: storage!.source });
  }
  return null;
}
