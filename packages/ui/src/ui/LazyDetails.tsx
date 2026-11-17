// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

/**
 * A closed <details> whose content is drawn only while it is open: a
 * closed one's content is built all the same, so a long report behind
 * one would cost every render of the screen it sits on.
 */
export function LazyDetails({
  summary,
  children,
}: {
  summary: ComponentChildren;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{summary}</summary>
      {open && children}
    </details>
  );
}
