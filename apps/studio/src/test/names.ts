// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An accessible name to find an element by, whose parts are marked with
 * their languages (EditableCell): happy-dom has no user agent
 * stylesheet, so a span is not inline in it, and the name is computed
 * with a space at each, before the punctuation after a part too
 * ("Back of 木 : Tree"). A browser's name has none there.
 */
export const named = (text: string) => (name: string) => name.replace(/ (?=[:,.])/g, "") === text;

/** An element's text as it is seen: without the names kept hidden for its controls (EditableCell). */
export function shownText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[hidden]")) hidden.remove();
  return copy.textContent!;
}
