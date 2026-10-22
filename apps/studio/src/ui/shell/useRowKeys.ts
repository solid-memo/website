// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from "preact/hooks";
import { EDIT_CELL } from "./EditableCell";
import { rangeToggled, stepCursor, toggled, NO_SELECTION, type Selection } from "./tableModel";
import { shortcutOf, type ShortcutId } from "./shortcuts";
import { useScreenKeys } from "./useShortcuts";

/** How a table's rows are selected: which are, and the selection to make. */
export interface RowSelection {
  chosen: Selection;
  onChoose: (chosen: Selection) => void;
}

/**
 * Edits a row's cell (F2): the one the focus is in, if it can be edited, else
 * the row's first that can; false when none can.
 */
function editCell(row: Element, target: Element): boolean {
  const own = row.contains(target)
    ? target.closest("td, th")!.querySelector("[data-cell-edit]")
    : null;
  const cell = own ?? row.querySelector("[data-cell-edit]");
  if (cell === null) return false;
  cell.dispatchEvent(new Event(EDIT_CELL));
  return true;
}

/**
 * The keys of a table's rows (DataTable), the screen's own of the
 * Studio's (useScreenKeys), wherever the focus is but in a field the
 * user types in: j and k move the cursor to the next row or the one
 * before (the focus goes to the row's link; from outside the table, from
 * the cursor's row, or to the first), Shift+J and Shift+K move it too,
 * selecting every row from where the selection was last made to it, x
 * selects the row or not, Enter opens it (`onOpen`), and Escape clears
 * the selection, while there is one. x, Enter and Shift+J or Shift+K act
 * on the row the focus is in, or, with the focus on the page's body (as
 * a reload or a cleared selection leaves it), the cursor's: elsewhere
 * (a button of the page) they are that element's own. On the row's link
 * Enter is the link's own. F2 edits the row's cell the focus is in, or
 * its first that can be edited (EditableCell).
 *
 * The cursor goes where the focus goes in the table. While a row is
 * shown beside the table (`current`, by its key), the cursor stays on
 * it: j and k ask to show another (`onMove`, by its key), from either
 * end of the table the one beyond it (`around`, on another page), and
 * the focus goes to that row once it is shown. Once none is shown, the
 * cursor stays on the row that was, and the focus, lost with the row
 * shown, goes back to it. With `onCursor`, each move of the cursor (j,
 * k, or the focus) is told, so that its row is shown beside the table,
 * as `current` then. `keys` are the rows', in the table's order. A
 * table not `enabled` takes no key.
 */
export function useRowKeys({
  body,
  keys,
  enabled = true,
  select,
  current,
  around,
  onMove,
  onCursor,
  onOpen,
}: {
  body: { current: HTMLTableSectionElement | null };
  keys: readonly string[];
  enabled?: boolean;
  select?: RowSelection;
  current?: string;
  /** The keys of the rows just before the table's first and after its last, on other pages. */
  around?: { previous?: string; next?: string };
  onMove?: (key: string) => void;
  onCursor?: (key: string) => void;
  onOpen?: (at: number) => void;
}): { cursor: number; anchor: { current: string | null }; follow: (at: number) => void } {
  const [own, setOwn] = useState<string | null>(null);
  const cursor = keys.indexOf(current ?? own ?? "");
  // Where the selection was last made: a range is selected from it.
  const anchor = useRef<string | null>(null);
  // The row asked to be shown: the focus goes to it once it is.
  const shown = useRef<string | null>(null);
  // The row shown beside the table before.
  const was = useRef(current);
  // The row the cursor was told to be on last (onCursor).
  const told = useRef(current);

  // A row asked for may have left the table meanwhile (its cards read afresh, say).
  const linkOf = (at: number) => body.current!.children[at]?.querySelector<HTMLElement>("th a");

  useEffect(() => {
    const left = was.current;
    was.current = current;
    // Told afresh from here: a row no longer shown (a link went without it) is told again when the cursor comes back to it.
    told.current = current;
    if (current === undefined) {
      if (left === undefined) return;
      setOwn(left);
      if (document.activeElement === document.body) linkOf(keys.indexOf(left))?.focus();
      return;
    }
    if (shown.current !== current) return;
    shown.current = null;
    linkOf(keys.indexOf(current))?.focus();
  }, [current]);

  /** Asks to show a row beside the table, by its key. */
  function show(key: string) {
    shown.current = key;
    onMove!(key);
  }

  /** Moves the cursor to a row, the focus with it; beside the table, by showing that row. */
  function move(at: number) {
    if (current !== undefined && onMove !== undefined && keys[at] !== current) {
      show(keys[at]!);
      return;
    }
    cursorTo(at);
    linkOf(at)?.focus();
  }

  /** The cursor on a row, told as it moves: not again while the row is shown, or about to be. */
  function cursorTo(at: number) {
    const key = keys[at]!;
    setOwn(key);
    if (onCursor === undefined || key === current || key === told.current) return;
    told.current = key;
    onCursor(key);
  }

  /** Moves the cursor a row down or up (j, k), or false when there is no row to move it to. */
  function step(from: number, by: 1 | -1): boolean {
    const next = stepCursor(from, keys.length, by);
    if (next === -1) return false;
    // From either end beside the table, the row beyond it.
    const beyond =
      next !== from || current === undefined || onMove === undefined
        ? undefined
        : by === 1
          ? around?.next
          : around?.previous;
    if (beyond !== undefined) {
      anchor.current = beyond;
      show(beyond);
      return true;
    }
    anchor.current = keys[next]!;
    move(next);
    return true;
  }

  /**
   * Moves the cursor a row down or up (Shift+J, Shift+K), selecting every row
   * from the anchor to it, or false when the rows are not selected or there is
   * no row to act on.
   */
  function extend(at: number, by: 1 | -1): boolean {
    if (select === undefined || at === -1) return false;
    const next = stepCursor(at, keys.length, by);
    const from = keys.indexOf(anchor.current ?? "");
    select.onChoose(rangeToggled(select.chosen, keys, from === -1 ? at : from, next, true));
    if (from === -1) anchor.current = keys[at]!;
    move(next);
    return true;
  }

  /** Selects a row or not (x), or false when the rows are not selected or there is no row to act on. */
  function choose(at: number): boolean {
    if (select === undefined || at === -1) return false;
    anchor.current = keys[at]!;
    select.onChoose(toggled(select.chosen, [keys[at]!], !select.chosen.has(keys[at]!)));
    return true;
  }

  /** Opens a row (Enter), or false when there is none to open or the focus is on a link or button. */
  function open(target: EventTarget | null, at: number): boolean {
    // The row's link opens the row itself, and its buttons do what they do.
    if (
      onOpen === undefined ||
      at === -1 ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLButtonElement
    )
      return false;
    onOpen(at);
    return true;
  }

  /** Clears the selection (Escape), or false when there is none. */
  function clear(): boolean {
    if (select === undefined || select.chosen.size === 0) return false;
    select.onChoose(NO_SELECTION);
    return true;
  }

  /**
   * Acts on a table's key, on the row the focus is in (`focused`) or the one
   * x, Enter and the extending keys act on (`at`), or false when it does not.
   */
  function act(
    shortcut: ShortcutId | null,
    target: EventTarget | null,
    focused: number,
    at: number,
  ): boolean {
    switch (shortcut) {
      case "down":
      case "up":
        return step(focused !== -1 ? focused : cursor, shortcut === "down" ? 1 : -1);
      case "extendDown":
      case "extendUp":
        return extend(at, shortcut === "extendDown" ? 1 : -1);
      case "select":
        return choose(at);
      case "open":
        return open(target, at);
      case "clear":
        return clear();
      case "edit":
        return at !== -1 && editCell(body.current!.children[at]!, target as Element);
      default:
        return false;
    }
  }

  useScreenKeys((event, key) => {
    if (!enabled) return;
    const focused = [...body.current!.children].findIndex((row) =>
      row.contains(document.activeElement),
    );
    const onBody = document.activeElement === document.body;
    // The row x, Enter and the extending keys act on.
    const at = focused !== -1 ? focused : onBody ? cursor : -1;
    if (!act(shortcutOf(key, "table"), event.target, focused, at)) return;
    event.preventDefault();
  });

  return { cursor, anchor, follow: cursorTo };
}
