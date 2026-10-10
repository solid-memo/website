import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { allSelected, NO_SELECTION, rangeToggled, sortOf, toggled, visibleColumns, type TableSort } from "./tableModel";
import { useRowKeys, type RowSelection } from "./useRowKeys";

/** A column of a DataTable: its key, its header, and each row's cell. */
export interface Column<R> {
  key: string;
  label: ComponentChildren;
  /** A column of figures, aligned to compare. */
  number?: boolean;
  cell: (row: R) => ComponentChildren;
}

/** How a DataTable's rows are selected, by a checkbox each, in a column of their own. */
export interface TableSelection<R> extends RowSelection {
  /** The column's header, which only screen readers hear. */
  label: string;
  /** The checkbox that selects every row shown. */
  allLabel: string;
  rowLabel: (row: R) => string;
}

/**
 * A table of the Studio's (docs/studio.md): its caption, a row each of
 * `rows` (by their keys, `keyOf`), the cell that names the row first
 * (`name`, its row header, whose link opens it), then the other
 * `columns`, but those `hidden`. With `onSort`, each header is a button
 * that sorts the table by its column, which says so (`aria-sort`).
 * With `select`, each row has a checkbox, and the header one that
 * selects every row shown; a click with Shift held selects, or not,
 * every row from the one ticked last. The rows are moved between,
 * selected and opened from the keyboard (useRowKeys): the cursor's row
 * is marked, as is each row selected, and the row shown beside the
 * table (`current`, `aria-current`), j and k showing another, from
 * either end of the table the row beyond it (`around`). Its header row, and its first
 * column, stay in sight as the page scrolls (studio.css).
 */
export function DataTable<R>({
  caption,
  class: className,
  rows,
  keyOf,
  classOf,
  name,
  columns,
  hidden,
  sort,
  onSort,
  select,
  current,
  around,
  onMove,
  onOpen,
}: {
  caption: ComponentChildren;
  /** The table's own class, beside the Studio's. */
  class?: string;
  rows: readonly R[];
  keyOf: (row: R) => string;
  /** A row's own class (a retired card's). */
  classOf?: (row: R) => string | undefined;
  name: Column<R>;
  columns: readonly Column<R>[];
  hidden?: ReadonlySet<string>;
  sort?: TableSort;
  onSort?: (key: string) => void;
  select?: TableSelection<R>;
  /** The row shown beside the table, by its key. */
  current?: string;
  /** The rows just before the table's first and after its last (on other pages), which j and k show from its ends. */
  around?: { previous?: R; next?: R };
  /** Show another row beside the table, as j and k ask. */
  onMove?: (row: R) => void;
  /** Open a row, as Enter asks. */
  onOpen?: (row: R) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const keys = rows.map(keyOf);
  const shown = visibleColumns(columns, hidden ?? NO_SELECTION);
  // The rows j and k may show, by their keys.
  const byKey = new Map([around?.previous, ...rows, around?.next].flatMap((row) => (row === undefined ? [] : [[keyOf(row), row] as const])));
  const { cursor, anchor, follow } = useRowKeys({
    body,
    keys,
    select,
    current,
    around: {
      ...(around?.previous === undefined ? {} : { previous: keyOf(around.previous) }),
      ...(around?.next === undefined ? {} : { next: keyOf(around.next) }),
    },
    ...(onMove === undefined ? {} : { onMove: (key: string) => onMove(byKey.get(key)!) }),
    ...(onOpen === undefined ? {} : { onOpen: (at: number) => onOpen(rows[at]!) }),
  });

  const header = (column: Column<R>) => (
    <th key={column.key} scope="col" class={column.number ? "number" : undefined} aria-sort={sortOf(sort, column.key)}>
      {onSort === undefined ? (
        column.label
      ) : (
        <button type="button" class="sort" onClick={() => onSort(column.key)}>
          {column.label}
        </button>
      )}
    </th>
  );

  return (
    <div class="studio-table">
      <table class={["studio-list", "studio-data-table", select !== undefined && "selectable", className].filter(Boolean).join(" ")}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {select !== undefined && (
              <th scope="col">
                <span class="visually-hidden">{select.label}</span>
                <input
                  type="checkbox"
                  aria-label={select.allLabel}
                  checked={allSelected(select.chosen, keys)}
                  onChange={(event) => select.onChoose(toggled(select.chosen, keys, event.currentTarget.checked))}
                />
              </th>
            )}
            {header(name)}
            {shown.map(header)}
          </tr>
        </thead>
        <tbody
          ref={body}
          // The cursor goes where the focus goes.
          onFocusIn={(event) => follow([...body.current!.children].findIndex((row) => row.contains(event.target as Node)))}
        >
          {rows.map((row, at) => {
            const key = keys[at]!;
            const chosen = select?.chosen.has(key) === true;
            return (
              <tr
                key={key}
                class={[classOf?.(row), chosen && "selected", at === cursor && "cursor"].filter(Boolean).join(" ") || undefined}
                aria-current={key === current ? "true" : undefined}
              >
                {select !== undefined && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={select.rowLabel(row)}
                      aria-keyshortcuts="x"
                      checked={chosen}
                      onClick={(event) => {
                        const on = event.currentTarget.checked;
                        const from = keys.indexOf(anchor.current ?? "");
                        select.onChoose(
                          event.shiftKey && from !== -1 ? rangeToggled(select.chosen, keys, from, at, on) : toggled(select.chosen, [key], on),
                        );
                        anchor.current = key;
                      }}
                    />
                  </td>
                )}
                <th scope="row">{name.cell(row)}</th>
                {shown.map((column) => (
                  <td key={column.key} class={column.number ? "number" : undefined}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
