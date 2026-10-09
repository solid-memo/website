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
  return { filter, sort: { column: column as DeckColumn, descending: params.get("order") === "desc" } };
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

/** Whether a row's title, in any language, or one of its groups' names holds the filter, case and diacritics aside. */
export function matchesFilter(row: DeckTableRow, filter: string): boolean {
  const wanted = folded(filter.trim());
  if (wanted === "") return true;
  const texts = [row.deck.title, ...row.groups.map((group) => group.title)].flatMap((text) => Object.values(text));
  return texts.some((text) => folded(text).includes(wanted));
}

/**
 * What a row is sorted by in a column: text, a number, or undefined
 * while a figure is not known (such rows come last, either way).
 * `text` names a text as the reader sees it.
 */
function sortKey(row: DeckTableRow, column: DeckColumn, text: (text: LangText) => string): string | number | undefined {
  switch (column) {
    case "title":
      return text(row.deck.title);
    case "group":
      return row.groups.map((group) => text(group.title)).join(" › ");
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
 * The rows the view shows, in its order: those that match its filter,
 * sorted by its column, ties (and every row, unsorted) in the order they
 * were given in. Text is compared as the reader's language sorts it
 * (`locale`), case aside and numbers by value ("Kanji 2" before "Kanji 10").
 */
export function arrangeDeckRows(
  rows: readonly DeckTableRow[],
  view: DeckTableView,
  text: (text: LangText) => string,
  locale: string,
): DeckTableRow[] {
  const shown = rows.filter((row) => matchesFilter(row, view.filter));
  const sort = view.sort;
  if (sort === undefined) return shown;
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const keys = new Map(shown.map((row) => [row, sortKey(row, sort.column, text)]));
  const compare = (a: string | number, b: string | number) =>
    typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return shown
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const [x, y] = [keys.get(a.row), keys.get(b.row)];
      if (x === undefined || y === undefined) {
        return x === y ? a.index - b.index : x === undefined ? 1 : -1;
      }
      return (sort.descending ? compare(y, x) : compare(x, y)) || a.index - b.index;
    })
    .map(({ row }) => row);
}
