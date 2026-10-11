// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";
import { shortcutOf } from "./shortcuts";
import { useScreenKeys } from "./useShortcuts";

/**
 * The bar of a table's selected rows (DataTable), a group named for them
 * (`label`), there only while some are (`count`): how many (`said`), what
 * can be done with them all at once (`children`: buttons, and menus of
 * them), and Clear, which selects none (`onClear`). It stays in sight at
 * the foot of the main content as the table scrolls. A status line, there
 * throughout, says how many are selected. The key `.` opens the bar's
 * first menu, or goes to its first button, a screen's own key of the
 * Studio's (useScreenKeys).
 */
export function BulkBar({
  label,
  count,
  said,
  onClear,
  children,
}: {
  label: string;
  count: number;
  said: string;
  onClear: () => void;
  children?: ComponentChildren;
}) {
  const { t } = useI18n();
  const actions = useRef<HTMLDivElement>(null);

  useScreenKeys((event, key) => {
    if (count === 0 || shortcutOf(key, "table") !== "bulk") return;
    const first = actions.current!.querySelector<HTMLElement>("button, a");
    // With nothing to do (the deck may not be changed), only Clear.
    if (first === null) return;
    event.preventDefault();
    if (first.getAttribute("aria-haspopup") === "menu") first.click();
    else first.focus();
  });

  return (
    <>
      <p class="visually-hidden" role="status">
        {said}
      </p>
      {count > 0 && (
        <div class="studio-bulk-bar" role="group" aria-label={label}>
          <p aria-hidden="true">{said}</p>
          <div ref={actions} class="actions">
            {children}
          </div>
          <button type="button" onClick={onClear}>
            {t("studio.bulk.clear")}
          </button>
        </div>
      )}
    </>
  );
}
