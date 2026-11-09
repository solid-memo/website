// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { DECK_DIRECTIONS, type Deck } from "./deck";
import type { DeckGroup, DeckTree, TreeNode } from "./deckTree";
import { folded, type LangText } from "./langText";

/**
 * The Studio's table of an instance's decks (docs/studio.md): a row per
 * deck, with the groups it is in and its figures, filtered by a text and
 * sorted by a column, as the URL says (`DeckTableView`).
 */

/** A deck's figures that are counted, apart from its catalog entry: they come in as they are read. */
export type DeckFigure = "cards" | "due" | "new";

/** A deck as the table shows it. */
export interface DeckTableRow {
  deck: Deck;
  /** The groups the deck is in, the outermost first; none at the top level. */
  groups: readonly DeckGroup[];
  /** The figures known so far. */
  figures: Partial<Record<DeckFigure, number>>;
  /** The daily caps the deck is studied with: its own, else the instance's preferences. */
  newCardsPerDay: number;
  maxReviewsPerDay: number;
}

/** A column the table can be sorted by. */
export type DeckColumn =
  | "title"
  | "group"
  | "direction"
  | "newCardsPerDay"
  | "maxReviewsPerDay"
  | "due"
  | "new"
  | "modified"
  | "cards";

export const DECK_COLUMNS: readonly DeckColumn[] = [
  "title",
  "group",
  "direction",
  "newCardsPerDay",
  "maxReviewsPerDay",
  "due",
  "new",
  "modified",
  "cards",
];

/**
 * How the table is looked at: the decks whose title or groups hold
 * `filter`, sorted by `sort`, or in the order the user arranged them
 * (domain/deckTree.ts) when there is none.
 */
export interface DeckTableView {
  filter: string;
  sort?: { column: DeckColumn; descending: boolean };
}

export const DEFAULT_DECK_TABLE_VIEW: DeckTableView = { filter: "" };

/** The view a route's query states (`q`, `sort`, `order=desc`); anything it does not know is left out. */
export function deckTableViewFromParams(params: URLSearchParams): DeckTableView {
  const column = params.get("sort");
  const filter = params.get("q") ?? "";
  if (column === null || !(DECK_COLUMNS as readonly string[]).includes(column)) return { filter };
  return {
    filter,
    sort: { column: column as DeckColumn, descending: params.get("order") === "desc" },
  };
}

/** The query parameters of a view, none for what is as by default. */
export function deckTableViewToParams(view: DeckTableView): Record<string, string> {
  return {
    ...(view.filter === "" ? {} : { q: view.filter }),
    ...(view.sort === undefined ? {} : { sort: view.sort.column }),
    ...(view.sort?.descending === true ? { order: "desc" } : {}),
  };
}

/**
 * The view sorted by the column next: ascending first, then descending,
 * then in the user's own order again.
 */
export function nextSort(view: DeckTableView, column: DeckColumn): DeckTableView {
  const { sort: current, ...rest } = view;
  if (current?.column !== column) return { ...rest, sort: { column, descending: false } };
  return current.descending ? rest : { ...rest, sort: { column, descending: true } };
}

/** Each deck's groups, outermost first, by the deck's URL; a deck at the top level has none. */
export function groupsOfDecks(tree: DeckTree): Map<string, readonly DeckGroup[]> {
  const result = new Map<string, readonly DeckGroup[]>();
  const walk = (nodes: readonly TreeNode[], groups: readonly DeckGroup[]) => {
    for (const node of nodes) {
      if (node.kind === "deck") result.set(node.deck.url, groups);
      else walk(node.children, [...groups, node.group]);
    }
  };
  walk(tree.children, []);
  return result;
}

/** Every group in the tree, in the tree's order, each with the groups it is in and itself, outermost first. */
export function groupTrails(tree: DeckTree): { group: DeckGroup; trail: readonly DeckGroup[] }[] {
  const result: { group: DeckGroup; trail: readonly DeckGroup[] }[] = [];
  const walk = (nodes: readonly TreeNode[], above: readonly DeckGroup[]) => {
    for (const node of nodes) {
      if (node.kind === "deck") continue;
      const trail = [...above, node.group];
      result.push({ group: node.group, trail });
      walk(node.children, trail);
    }
  };
  walk(tree.children, []);
  return result;
}

/** Each text's forms in every language, folded: a table folds the same titles on each render while a filter is set. */
const foldedForms = new WeakMap<LangText, readonly string[]>();

function foldedFormsOf(text: LangText): readonly string[] {
  let forms = foldedForms.get(text);
  if (forms === undefined) {
    forms = Object.values(text).map(folded);
    foldedForms.set(text, forms);
  }
  return forms;
}

/** Whether a row's title, in any language, or one of its groups' names holds the filter, case and diacritics aside. */
export function matchesFilter(row: DeckTableRow, filter: string): boolean {
  const wanted = folded(filter.trim());
  if (wanted === "") return true;
  return [row.deck.title, ...row.groups.map((group) => group.title)]
    .flatMap(foldedFormsOf)
    .some((form) => form.includes(wanted));
}

/** The columns that sort by a text as the reader sees it; the others by a number. */
type TextColumn = "title" | "group";

function isTextColumn(column: DeckColumn): column is TextColumn {
  return column === "title" || column === "group";
}

/** The number a row is sorted by in a column of numbers: undefined while a figure is not known (such rows come last, either way). */
function numberKey(row: DeckTableRow, column: Exclude<DeckColumn, TextColumn>): number | undefined {
  switch (column) {
    case "direction":
      return DECK_DIRECTIONS.indexOf(row.deck.direction);
    case "newCardsPerDay":
      return row.newCardsPerDay;
    case "maxReviewsPerDay":
      return row.maxReviewsPerDay;
    case "modified":
      return Date.parse(row.deck.modifiedAt ?? row.deck.createdAt);
    case "due":
    case "new":
    case "cards":
      return row.figures[column];
  }
}

/**
 * The texts the table's rows are sorted by, a text per row in the rows'
 * order: none unless `column` is one of text. A row's figures may
 * change without changing these, so a caller can rank them once and keep
 * the ranks while the texts stay the same.
 */
export function deckSortTexts(
  rows: readonly DeckTableRow[],
  column: DeckColumn | undefined,
  text: (text: LangText) => string,
): string[] {
  if (column === "title") return rows.map((row) => text(row.deck.title));
  if (column !== "group") return [];
  const paths = deckGroupPaths(rows, text);
  return rows.map((row) => paths.get(row.groups)!);
}

/** Each list of groups the rows are in, named as the reader sees it: once a list, as decks of a group share theirs and a path can be long. */
export function deckGroupPaths(
  rows: readonly DeckTableRow[],
  text: (text: LangText) => string,
): Map<readonly DeckGroup[], string> {
  return new Map(
    [...new Set(rows.map((row) => row.groups))].map((groups) => [
      groups,
      groups.map((group) => text(group.title)).join(" › "),
    ]),
  );
}

/**
 * Each text's place in the order the reader's language sorts them
 * (`locale`), case aside and numbers by value ("Kanji 2" before
 * "Kanji 10"), by the text's position in `texts`; texts that compare
 * equal share a place. By position, as a Map of texts would be slow to
 * look a long path of groups up in.
 */
export function deckTextRanks(texts: readonly string[], locale: string): number[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const order = texts.map((_, index) => index);
  order.sort((a, b) => collator.compare(texts[a]!, texts[b]!));
  const ranks = new Array<number>(texts.length);
  let rank = 0;
  order.forEach((at, place) => {
    if (place > 0 && collator.compare(texts[order[place - 1]!]!, texts[at]!) !== 0) rank += 1;
    ranks[at] = rank;
  });
  return ranks;
}

/** The rows' ranks (`deckTextRanks` of their `deckSortTexts`) by the row: none for a column of numbers. */
export function deckRowRanks(
  rows: readonly DeckTableRow[],
  ranks: readonly number[],
): Map<DeckTableRow, number> {
  return new Map(ranks.map((rank, index) => [rows[index]!, rank]));
}

/**
 * The rows in the order of `sort`, ties (and every row, unsorted) in
 * the order they were given in. A column of text sorts by each row's place in `ranks`
 * (`deckRowRanks`).
 */
export function arrangeDeckRows(
  rows: readonly DeckTableRow[],
  sort: DeckTableView["sort"],
  ranks: ReadonlyMap<DeckTableRow, number>,
): DeckTableRow[] {
  if (sort === undefined) return [...rows];
  const column = sort.column;
  const keyOf = isTextColumn(column)
    ? (row: DeckTableRow) => ranks.get(row)!
    : (row: DeckTableRow) => numberKey(row, column);
  const keys = new Map(rows.map((row) => [row, keyOf(row)]));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const [x, y] = [keys.get(a.row), keys.get(b.row)];
      if (x === undefined || y === undefined) {
        return x === y ? a.index - b.index : x === undefined ? 1 : -1;
      }
      return (sort.descending ? y - x : x - y) || a.index - b.index;
    })
    .map(({ row }) => row);
}
