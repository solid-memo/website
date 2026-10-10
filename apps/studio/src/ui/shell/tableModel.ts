/**
 * What a Studio table (DataTable) keeps apart from the page: the rows
 * selected, by their keys; how it is sorted; where its cursor goes; and
 * which of its columns are shown. Each is a plain value, worked out here.
 */

/** The keys of the rows selected. One kept selected while its row is not shown stays selected. */
export type Selection = ReadonlySet<string>;

export const NO_SELECTION: Selection = new Set();

/** The selection with these rows' keys selected (`on`), or not. */
export function toggled(selection: Selection, keys: readonly string[], on: boolean): Selection {
  return new Set(on ? [...selection, ...keys] : [...selection].filter((key) => !keys.includes(key)));
}

/**
 * The selection with every row from one to another (`from` and `to`, by
 * their place among `keys`, the rows in the table's order, either way
 * round, both in) selected (`on`), or not: a range, as a click with
 * Shift held makes from the row ticked last.
 */
export function rangeToggled(selection: Selection, keys: readonly string[], from: number, to: number, on: boolean): Selection {
  return toggled(selection, keys.slice(Math.min(from, to), Math.max(from, to) + 1), on);
}

/** Whether every one of these rows is selected; not of no rows. */
export function allSelected(selection: Selection, keys: readonly string[]): boolean {
  return keys.length > 0 && keys.every((key) => selection.has(key));
}

/** How a table is sorted: by the column of `key`, one way or the other. */
export interface TableSort<K extends string = string> {
  key: K;
  descending: boolean;
}

/**
 * The sort a column's header gives next: by it, ascending first, then
 * descending, then none again (the rows in their own order).
 */
export function nextSort<K extends string>(sort: TableSort<K> | undefined, key: K): TableSort<K> | undefined {
  if (sort?.key !== key) return { key, descending: false };
  return sort.descending ? undefined : { key, descending: true };
}

/** How a column says it sorts the table (its `aria-sort`): not at all, unless it is the one sorted by. */
export function sortOf(sort: TableSort | undefined, key: string): "ascending" | "descending" | undefined {
  return sort?.key !== key ? undefined : sort.descending ? "descending" : "ascending";
}

/**
 * The row the cursor goes to, by its place among `count` rows, from the
 * one it is on (`at`; -1 for none) a row on (`step` 1) or back (-1),
 * staying at either end. From none, either goes to the first.
 */
export function stepCursor(at: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (at === -1) return 0;
  return Math.min(count - 1, Math.max(0, at + step));
}

/** The columns shown: all but those `hidden` names, by their keys. */
export function visibleColumns<C extends { key: string }>(columns: readonly C[], hidden: ReadonlySet<string>): C[] {
  return columns.filter((column) => !hidden.has(column.key));
}

/** The hidden columns, with one of them shown (`shown`) or hidden. */
export function withColumn(hidden: ReadonlySet<string>, key: string, shown: boolean): ReadonlySet<string> {
  return toggled(hidden, [key], !shown);
}
