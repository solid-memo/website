import type { DeckTableView } from "@solid-memo/domain/deckTable";

/**
 * Home's views (docs/studio.md, Home): each a preset of Home's query,
 * shown as a tab above its table. A view keeps the decks of one kind
 * (`show` in the URL), and may sort them too; the filter's text stays
 * as the user typed it.
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

/** What Home knows of a deck to tell the views it is in: today's due cards (while they are counted, none), and its badges. */
export interface DeckFacts {
  due: number | undefined;
  badges: readonly (string | { from: string })[];
}

/**
 * Whether a view keeps a deck: every view, all; due, one with cards due
 * today; courses, a copy of a course; copies, a copy of a library
 * release or of one added from a link; attention, one whose data is
 * invalid or whose cards could not be read.
 */
export function inView(view: HomeView, { due, badges }: DeckFacts): boolean {
  switch (view) {
    case "all":
      return true;
    case "due":
      return due !== undefined && due > 0;
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

/**
 * Home's query in another view: its preset, the filter's text kept. Due
 * sorts the decks by their cards due, the most first; every other view
 * is in the order the user arranged the decks.
 */
export function withView(query: HomeQuery, view: HomeView): HomeQuery {
  const filter = query.view?.filter ?? "";
  const sorted: DeckTableView = view === "due" ? { filter, sort: { column: "due", descending: true } } : { filter };
  return {
    ...(sorted.filter === "" && sorted.sort === undefined ? {} : { view: sorted }),
    ...(view === "all" ? {} : { show: view }),
  };
}
