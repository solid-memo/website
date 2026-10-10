import type { DeckTableView } from "@solid-memo/domain/deckTable";

/**
 * Home's views (docs/studio.md, Home): each a preset of Home's query,
 * shown as a tab above its table. A view keeps the decks of one kind
 * (`show` in the URL); the filter's text and the sort stay as the user
 * left them.
 */

/** A view of Home: every deck, those due today, the courses, the copies of releases, or those that need attention. */
export type HomeView = "all" | "due" | "courses" | "copies" | "attention";

/** Home's views, in their tabs' order. */
export const HOME_VIEWS: readonly HomeView[] = ["all", "due", "courses", "copies", "attention"];

/** Home's query, as its route holds it: how its table is looked at, and the view it is in (every deck when absent). */
export interface HomeQuery {
  view?: DeckTableView;
  show?: Exclude<HomeView, "all">;
}

/** What Home knows of a deck to tell the views it is in: today's due cards (or that they are still counted, or could not be), and its badges. */
export interface DeckFacts {
  due: number | "loading" | "unreadable";
  badges: readonly (string | { from: string })[];
}

/**
 * Whether a view keeps a deck: every view, all; due, one with cards due
 * today, or whose cards are still counted (so none is hidden while it
 * may be due, its count a loader meanwhile); courses, a copy of a course;
 * copies, a copy of a library release or of one added from a link;
 * attention, one whose data is invalid or whose cards could not be read.
 */
export function inView(view: HomeView, { due, badges }: DeckFacts): boolean {
  switch (view) {
    case "all":
      return true;
    case "due":
      return due === "loading" || (typeof due === "number" && due > 0);
    case "courses":
      return badges.includes("course");
    case "copies":
      return badges.some((badge) => badge === "library" || typeof badge === "object");
    case "attention":
      return badges.includes("invalid") || badges.includes("unreadable");
  }
}

/** The view a query is in. */
export function viewOf(query: HomeQuery): HomeView {
  return query.show ?? "all";
}

/** The view the URL's `show` names; none for every deck, or for a name it does not know. */
export function showFromParam(param: string | null): HomeQuery["show"] {
  return HOME_VIEWS.find((view): view is Exclude<HomeView, "all"> => view !== "all" && view === param);
}

/** Home's query in another view: the filter's text and the sort kept. */
export function withView(query: HomeQuery, view: HomeView): HomeQuery {
  return {
    ...(query.view === undefined ? {} : { view: query.view }),
    ...(view === "all" ? {} : { show: view }),
  };
}
