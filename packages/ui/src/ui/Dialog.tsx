// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { useI18n } from "./i18n";

/**
 * A modal dialog, open while it is shown: the browser's own `<dialog>`,
 * which keeps the focus in it and closes on Escape. Its heading names it.
 * Its Close button closes it too, and closed (`onClose`, which stops
 * showing it), the focus goes back where it was before it opened.
 * Opened, the focus goes to the field marked `autoFocus` in it, if one
 * is, as the browser does (and the test DOM does not). `onKeyDown` has
 * the keys it wants, from anywhere in it: the Studio's shortcuts leave
 * them to it while it is open. The deck list and the Studio share it,
 * `class` naming what it holds for its styles.
 */
export function Dialog({
  heading,
  class: className,
  dialogRef,
  onClose,
  onKeyDown,
  children,
}: {
  heading: ComponentChildren;
  class?: string;
  /** The `<dialog>`, for its content to close it by (`close()`). */
  dialogRef?: { current: HTMLDialogElement | null };
  /** The dialog closed: stop showing it. */
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent & { currentTarget: HTMLDialogElement }) => void;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const ownRef = useRef<HTMLDialogElement>(null);
  const ref = dialogRef ?? ownRef;
  const headingId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    ref.current!.showModal();
    ref.current!.querySelector<HTMLElement>("[autofocus]")?.focus();
    return () => opener.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      class={className === undefined ? "dialog" : `dialog ${className}`}
      aria-labelledby={headingId}
      onClose={onClose}
      onKeyDown={onKeyDown}
    >
      <header>
        <h2 id={headingId}>{heading}</h2>
        <button type="button" onClick={() => ref.current!.close()}>
          {t("dialog.close")}
        </button>
      </header>
      {children}
    </dialog>
  );
}
