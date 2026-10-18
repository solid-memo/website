// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext, useRef, useState } from "preact/hooks";
import { ActionsMenu, MenuCheckbox } from "@solid-memo/ui/ActionsMenu";
import { useI18n } from "@solid-memo/ui/i18n";
import {
  allSelected,
  NO_SELECTION,
  onlyAllowed,
  rangeToggled,
  sortOf,
  toggled,
  visibleColumns,
  withColumn,
  type Selection,
  type TableSort,
} from "./tableModel";
import { useRowKeys, type RowSelection } from "./useRowKeys";
import { clearSticky, unclearSticky } from "./stickyClearance";

/** A column of a DataTable: its key, its header, and each row's cell. */
export interface Column<R> {
  key: string;
  label: ComponentChildren;
  /** A column of figures, aligned to compare. */
  number?: boolean;
  /** A column the table is never sorted by (one of buttons), though it is by the others. */
  unsorted?: boolean;
  cell: (row: R) => ComponentChildren;
}

/** How a DataTable's rows are selected, by a checkbox each, in a column of their own. */
export interface TableSelection<R> extends RowSelection {
  /** The column's header, which only screen readers hear. */
  label: string;
  /** The checkbox that selects every row shown. */
  allLabel: string;
  rowLabel: (row: R) => string;
  /** Whether a row has a checkbox; every row has when absent. */
  offered?: (row: R) => boolean;
  /** Whether a row's checkbox may be checked now; it is disabled, and the row not selected, when not. */
  enabled?: (row: R) => boolean;
  /** No checkbox may be checked now (while the selected rows are acted on). */
  disabled?: boolean;
}

/** The columns each table hides, by the table's name, and how one is hidden or shown again (the Studio keeps them, prefs.ts). */
export interface HiddenColumns {
  hidden: (table: string) => ReadonlySet<string>;
  onHidden: (table: string, hidden: ReadonlySet<string>) => void;
}

/** The columns the tables hide: the shell's, which the device keeps; outside the Studio, each table's own. */
export const HiddenColumns = createContext<HiddenColumns | null>(null);

/**
 * A table of the Studio's (docs/studio.md): its caption, a row each of
 * `rows` (by their keys, `keyOf`), the cell that names the row first
 * (`name`, its row header, whose link opens it), then the other
 * `columns`. With `columnsOf` (the table's name), a menu above it
 * (Columns) shows or hides each of those, and the device keeps which
 * are hidden (HiddenColumns): each is shown until hidden there. With `onSort`, each header is a button
 * that sorts the table by its column, which says so (`aria-sort`).
 * With `select`, each row has a checkbox (each it `offered`, disabled
 * while it is not `enabled`), and the header one that selects every row
 * shown that can be; a click with Shift held selects, or not, every row
 * from the one checked last, passing over those that cannot be. The rows are moved between,
 * selected and opened from the keyboard (useRowKeys): the cursor's row
 * is marked, as is each row selected, and the row shown beside the
 * table (`current`, `aria-current`), j and k showing another, from
 * either end of the table the row beyond it (`around`); or, with
 * `onCursor`, the cursor's row, as the cursor moves. A table of another
 * (`keys` false: a card's answers beside its deck's cards) leaves the
 * keys to it. Its header row, and its first column, stay in sight as
 * the page scrolls (studio.css), and what has the focus is scrolled
 * clear of them, and of the bar of the rows selected (stickyClearance).
 */
export function DataTable<R>({
  caption,
  captionHidden = false,
  class: className,
  rows,
  keyOf,
  classOf,
  name,
  columns,
  columnsOf,
  sort,
  onSort,
  select,
  current,
  around,
  onMove,
  onCursor,
  onOpen,
  keys: takesKeys = true,
}: {
  caption: ComponentChildren;
  /** The caption is heard only, as the screen's heading says the same. */
  captionHidden?: boolean;
  /** The table's own class, beside the Studio's. */
  class?: string;
  rows: readonly R[];
  keyOf: (row: R) => string;
  /** A row's own class (a retired card's). */
  classOf?: (row: R) => string | undefined;
  name: Column<R>;
  columns: readonly Column<R>[];
  /** The table's name, under which the device keeps the columns it hides: none is hidden, nor can be, without. */
  columnsOf?: string;
  sort?: TableSort;
  onSort?: (key: string) => void;
  select?: TableSelection<R>;
  /** The row shown beside the table, by its key. */
  current?: string;
  /** The rows just before the table's first and after its last (on other pages), which j and k show from its ends. */
  around?: { previous?: R; next?: R };
  /** Show another row beside the table, as j and k ask. */
  onMove?: (row: R) => void;
  /** The cursor moved to a row (j and k, or the focus), to show beside the table. */
  onCursor?: (row: R) => void;
  /** Open a row, as Enter asks. */
  onOpen?: (row: R) => void;
  /** Whether the table takes the keys of its rows (useRowKeys). */
  keys?: boolean;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const keys = rows.map(keyOf);
  const columnsHidden = useHiddenColumns(columnsOf);
  const shown = visibleColumns(columns, columnsHidden.hidden);
  const rowOf = new Map(rows.map((row, at) => [keys[at]!, row]));
  // A row whose checkbox may be checked now.
  const choosable = (row: R) =>
    select !== undefined &&
    !select.disabled &&
    (select.offered?.(row) ?? true) &&
    (select.enabled?.(row) ?? true);
  const allowed = (key: string) => choosable(rowOf.get(key)!);
  const choosableKeys = keys.filter(allowed);
  const choose = (next: Selection) => select!.onChoose(onlyAllowed(select!.chosen, next, allowed));
  // The rows j and k may show, by their keys.
  const byKey = new Map(
    [around?.previous, ...rows, around?.next].flatMap((row) =>
      row === undefined ? [] : [[keyOf(row), row] as const],
    ),
  );
  const { cursor, anchor, follow } = useRowKeys({
    body,
    keys,
    enabled: takesKeys,
    ...(select === undefined || select.disabled === true
      ? {}
      : { select: { chosen: select.chosen, onChoose: choose } }),
    current,
    around: {
      ...(around?.previous === undefined ? {} : { previous: keyOf(around.previous) }),
      ...(around?.next === undefined ? {} : { next: keyOf(around.next) }),
    },
    ...(onMove === undefined ? {} : { onMove: (key: string) => onMove(byKey.get(key)!) }),
    ...(onCursor === undefined ? {} : { onCursor: (key: string) => onCursor(byKey.get(key)!) }),
    ...(onOpen === undefined ? {} : { onOpen: (at: number) => onOpen(rows[at]!) }),
  });

  const header = (column: Column<R>) => (
    <th
      key={column.key}
      scope="col"
      class={column.number ? "number" : undefined}
      aria-sort={sortOf(sort, column.key)}
    >
      {onSort === undefined || column.unsorted ? (
        column.label
      ) : (
        <button type="button" class="sort" onClick={() => onSort(column.key)}>
          {column.label}
        </button>
      )}
    </th>
  );

  return (
    <>
      {columnsOf !== undefined && columns.length > 0 && (
        <ColumnPicker columns={columns} {...columnsHidden} />
      )}
      <div class="studio-table">
        <table
          // What has the focus kept clear of what sticks over it (stickyClearance).
          onFocusIn={(event) => clearSticky(event.currentTarget, event.target as Element)}
          onFocusOut={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              unclearSticky(event.currentTarget);
          }}
          class={[
            "studio-list",
            "studio-data-table",
            select !== undefined && "selectable",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <caption class={captionHidden ? "visually-hidden" : undefined}>{caption}</caption>
          <thead>
            <tr>
              {select !== undefined && (
                <th scope="col">
                  <span class="visually-hidden">{select.label}</span>
                  {rows.some((row) => select.offered?.(row) ?? true) && (
                    <input
                      type="checkbox"
                      aria-label={select.allLabel}
                      checked={allSelected(select.chosen, choosableKeys)}
                      disabled={choosableKeys.length === 0}
                      onChange={(event) =>
                        select.onChoose(
                          toggled(select.chosen, choosableKeys, event.currentTarget.checked),
                        )
                      }
                    />
                  )}
                </th>
              )}
              {header(name)}
              {shown.map(header)}
            </tr>
          </thead>
          <tbody
            ref={body}
            // The cursor goes where the focus goes.
            onFocusIn={(event) =>
              follow(
                [...body.current!.children].findIndex((row) => row.contains(event.target as Node)),
              )
            }
          >
            {rows.map((row, at) => {
              const key = keys[at]!;
              const chosen = select?.chosen.has(key) === true && (select.enabled?.(row) ?? true);
              return (
                <tr
                  key={key}
                  class={
                    [classOf?.(row), chosen && "selected", at === cursor && "cursor"]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  aria-current={key === current ? "true" : undefined}
                >
                  {select !== undefined && (
                    <td>
                      {(select.offered?.(row) ?? true) && (
                        <input
                          type="checkbox"
                          aria-label={select.rowLabel(row)}
                          aria-keyshortcuts="x"
                          checked={chosen}
                          disabled={!choosable(row)}
                          onClick={(event) => {
                            const on = event.currentTarget.checked;
                            const from = keys.indexOf(anchor.current ?? "");
                            choose(
                              event.shiftKey && from !== -1
                                ? rangeToggled(select.chosen, keys, from, at, on)
                                : toggled(select.chosen, [key], on),
                            );
                            anchor.current = key;
                          }}
                        />
                      )}
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
    </>
  );
}

/**
 * The columns a table hides: those the device keeps under its name
 * (`table`). Outside the Studio, or without a name (and so a menu to
 * hide one), its own: none until hidden.
 */
function useHiddenColumns(table: string | undefined): {
  hidden: ReadonlySet<string>;
  onHidden: (hidden: ReadonlySet<string>) => void;
} {
  const kept = useContext(HiddenColumns);
  const [own, setOwn] = useState<ReadonlySet<string>>(NO_SELECTION);
  if (kept === null || table === undefined) return { hidden: own, onHidden: setOwn };
  return { hidden: kept.hidden(table), onHidden: (hidden) => kept.onHidden(table, hidden) };
}

/** The menu that shows or hides each of a table's columns, but its first, which names the rows. */
function ColumnPicker<R>({
  columns,
  hidden,
  onHidden,
}: {
  columns: readonly Column<R>[];
  hidden: ReadonlySet<string>;
  onHidden: (hidden: ReadonlySet<string>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div class="studio-table-tools">
      <ActionsMenu
        label={t("studio.columns.label")}
        text={t("studio.columns.button")}
        buttonClass=""
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      >
        {columns.map((column) => (
          <MenuCheckbox
            key={column.key}
            checked={!hidden.has(column.key)}
            onChange={(shown) => onHidden(withColumn(hidden, column.key, shown))}
          >
            {column.label}
          </MenuCheckbox>
        ))}
      </ActionsMenu>
    </div>
  );
}
