// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { queryToParams, type CardQuery, type CardState } from "@solid-memo/domain/cardQuery";
import {
  DEFAULT_DECK_TABLE_VIEW,
  deckTableViewFromParams,
  deckTableViewToParams,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";

/**
 * Home's views and the card workbench's (docs/studio.md, Home and Card
 * workbench): each a preset of the table's query, shown as a tab above
 * it. A view of Home's keeps the decks of one kind (`show` in the URL),
 * one of the workbench's the cards in one state (`state`); the rest of
 * the query stays as the user left it. Beside them, the views the user
 * saved, each a whole query under a name.
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
  return HOME_VIEWS.find(
    (view): view is Exclude<HomeView, "all"> => view !== "all" && view === param,
  );
}

/** Home's query in another view: the filter's text and the sort kept. */
export function withView(query: HomeQuery, view: HomeView): HomeQuery {
  return {
    ...(query.view === undefined ? {} : { view: query.view }),
    ...(view === "all" ? {} : { show: view }),
  };
}

/** Home's query as its URL's parameters hold it: none for what is as by default. */
export function homeParams(query: HomeQuery): Record<string, string> {
  return {
    ...deckTableViewToParams(query.view ?? DEFAULT_DECK_TABLE_VIEW),
    ...(query.show === undefined ? {} : { show: query.show }),
  };
}

/** Home's query from its URL's parameters (homeParams): a view as by default, or a name it does not know, left out. */
export function homeQueryOf(params: URLSearchParams): HomeQuery {
  const view = deckTableViewFromParams(params);
  const show = showFromParam(params.get("show"));
  return {
    ...(view.filter === "" && view.sort === undefined ? {} : { view }),
    ...(show === undefined ? {} : { show }),
  };
}

/** A view of the workbench: every card, those due, the new ones, or the leeches. */
export type CardView = "all" | Extract<CardState, "due" | "new" | "leech">;

/** The workbench's views, in their tabs' order. */
export const CARD_VIEWS: readonly CardView[] = ["all", "due", "new", "leech"];

/** The view of the workbench a query is in: every card without a state, else the state's; none for a state no view has. */
export function cardViewOf(query: CardQuery): CardView | null {
  if (query.state === undefined) return "all";
  return CARD_VIEWS.find((view) => view === query.state) ?? null;
}

/** The workbench's query in another view, from its first page: the rest of the query kept. */
export function withCardView(query: CardQuery, view: CardView): CardQuery {
  const { state: _state, ...rest } = query;
  return { ...rest, page: 1, ...(view === "all" ? {} : { state: view }) };
}

/** The workbench's query as a saved view keeps it: its page left out, as a view opens at the first. */
export function cardParams(query: CardQuery): Record<string, string> {
  return queryToParams({ ...query, page: 1 });
}

/** The tables whose views can be saved: Home and the card workbench (any deck's). */
export type ViewTable = "home" | "cards";

export const VIEW_TABLES: readonly ViewTable[] = ["home", "cards"];

/** A view saved under its name: the query it keeps, as the URL's parameters hold it ("q=kanji&sort=title"). */
export interface SavedView {
  name: string;
  params: string;
}

/** A query's parameters as a saved view keeps them. */
export function paramsText(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

/**
 * The saved views with one saved under `name` (trimmed): a name is a
 * view's own, so one saved under a name taken replaces that view, where
 * it was; another is added at the end.
 */
export function withSavedView(
  views: readonly SavedView[],
  name: string,
  params: string,
): SavedView[] {
  const view = { name: name.trim(), params };
  return views.some((each) => each.name === view.name)
    ? views.map((each) => (each.name === view.name ? view : each))
    : [...views, view];
}

/** The saved views with one renamed (`from`), where it was: another of the new name gives way to it. */
export function renamedView(views: readonly SavedView[], from: string, to: string): SavedView[] {
  const name = to.trim();
  return views.flatMap((each) =>
    each.name === from ? [{ ...each, name }] : each.name === name ? [] : [each],
  );
}

/** The saved views without one. */
export function withoutView(views: readonly SavedView[], name: string): SavedView[] {
  return views.filter((each) => each.name !== name);
}
