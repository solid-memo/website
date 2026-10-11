// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { composing } from "@solid-memo/ui/composing";
import { useI18n } from "@solid-memo/ui/i18n";
import { UnsavedEdits } from "./unsavedEdits";

/** The event that asks a cell to be edited, as F2 on its row does (useRowKeys). */
export const EDIT_CELL = "studio-edit-cell";

/** How a table's cell is edited in place (EditableCell). */
export interface CellEdit {
  /** What the field is, its row's name with it ("New per day of Kanji N5"). */
  label: string;
  /** What the cell shows, as text, which its button says after the label. */
  shown: string;
  /** What the field starts with. */
  value: string;
  /** A whole number of 0 or more; else text, or a choice among `options`. */
  number?: boolean;
  options?: readonly { value: string; label: string }[];
  /** Saves the value; resolves to whether it was saved (why not, the screen says). */
  onSave: (value: string) => Promise<boolean>;
}

/**
 * A cell of a Studio table edited in place (docs/studio.md, Editing in
 * a cell). Without `edit` it is what it shows (`children`). With it, a
 * button shows the same, which opens a field in the cell: its text, its
 * number or its choice. A cell whose content is a link (`link`, a row's
 * name) has no button, and opens only from the keyboard: F2 on its row
 * opens the cell the focus is in, else the row's first (EDIT_CELL).
 *
 * Enter, or Save, saves (`onSave`), and the cell shows what it holds
 * again, the focus back on it; Escape, or Cancel, leaves the value as it
 * was. A value changed and not saved stays in the field, the focus gone
 * elsewhere or not, and is reported as unsaved (UnsavedEdits), so that
 * the Studio asks before it is left, as it asks of a card's edits; a
 * field left unchanged closes as the focus leaves it. Saved from there,
 * it is saved as the cell is edited then (its `edit` as last rendered,
 * which another cell of its row saved since may have changed); its
 * edits discarded there, the field closes. A save refused keeps the
 * field open, marked invalid until it changes. Enter and Escape that an
 * input method takes, to end or drop what it composes (Korean, say),
 * are its own.
 */
export function EditableCell({
  edit,
  link = false,
  children,
}: {
  edit: CellEdit | null;
  link?: boolean;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const report = useContext(UnsavedEdits);
  const cell = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState(false);
  // The focus goes back to the cell once the field closes from the keyboard or its buttons.
  const refocus = useRef(false);
  const dirty = editing && edit !== null && value !== edit.value;
  const latest = useRef(value);
  latest.current = value;
  // A save asked from elsewhere (UnsavedEdits) saves as the cell is edited now, not as it was once its value changed.
  const current = useRef(edit);
  current.current = edit;

  function start() {
    setValue(edit!.value);
    setRefused(false);
    setEditing(true);
  }

  // Before the browser paints, so a key pressed as soon as the cell shows finds it listening.
  useLayoutEffect(() => {
    // A cell that cannot be edited now has none to ask.
    const node = cell.current;
    if (node === null) return;
    node.addEventListener(EDIT_CELL, start);
    return () => node.removeEventListener(EDIT_CELL, start);
  });

  useLayoutEffect(() => {
    if (editing) {
      const field = cell.current!.querySelector<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      )!;
      field.focus();
      if (field instanceof HTMLInputElement) field.select();
    } else if (refocus.current) {
      refocus.current = false;
      cell.current!.querySelector<HTMLElement>("a, button")!.focus();
    }
  }, [editing]);

  useEffect(() => {
    // Discarded, the field closes where it is: the focus has gone where the move took it.
    if (dirty)
      report(
        () => save(latest.current),
        cell,
        () => setEditing(false),
      );
    else report(null, cell);
  }, [dirty]);
  useEffect(() => () => report(null, cell), []);

  if (edit === null) return <>{children}</>;

  function close() {
    refocus.current = true;
    setEditing(false);
  }

  async function save(saved: string): Promise<boolean> {
    const now = current.current!;
    if (saved === now.value) {
      close();
      return true;
    }
    setSaving(true);
    const ok = await now.onSave(saved);
    setSaving(false);
    setRefused(!ok);
    if (ok) close();
    return ok;
  }

  const keys = (event: KeyboardEvent) => {
    if (composing(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!saving) void save(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const typed = (changed: string) => {
    setValue(changed);
    setRefused(false);
  };
  const field = {
    "aria-label": edit.label,
    "aria-invalid": refused || undefined,
    value,
    onKeyDown: keys,
  };

  if (!editing) {
    return (
      <span ref={cell} class="studio-cell" data-cell-edit>
        {link ? (
          children
        ) : (
          <button
            type="button"
            class="studio-cell-edit"
            aria-label={t("studio.inline.cell", { field: edit.label, value: edit.shown })}
            aria-keyshortcuts="F2"
            onClick={start}
          >
            {children}
          </button>
        )}
      </span>
    );
  }
  return (
    <span
      ref={cell}
      class="studio-cell editing"
      data-cell-edit
      // A field left as it was closes as the focus leaves the cell.
      onFocusOut={(event) => {
        if (!dirty && !cell.current!.contains(event.relatedTarget as Node | null))
          setEditing(false);
      }}
    >
      {edit.options !== undefined ? (
        <select {...field} onChange={(event) => typed(event.currentTarget.value)}>
          {edit.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...field}
          {...(edit.number ? { type: "number", min: 0, step: 1 } : { type: "text" })}
          onInput={(event) => typed(event.currentTarget.value)}
        />
      )}
      <button type="button" disabled={saving} onClick={() => void save(value)}>
        {t("studio.inline.save")}
      </button>
      <button type="button" onClick={close}>
        {t("studio.inline.cancel")}
      </button>
    </span>
  );
}
