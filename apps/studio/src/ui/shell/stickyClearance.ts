// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** The custom properties studio.css makes the main content's scroll-padding of. */
const STICKY = ["--s-sticky-top", "--s-sticky-start", "--s-sticky-bottom"] as const;

/**
 * Keeps what has the focus in a table (DataTable) clear of what sticks
 * over it as the main content scrolls (studio.css), as WCAG 2.2 asks
 * (2.4.11, Focus Not Obscured): the header row, the first column (a
 * row's checkbox and name) and the bar of the rows selected. How far in
 * from the edges of the pane that scrolls they reach varies, with the
 * density, the names, the bar's buttons and the pane's own padding, so
 * it is measured as the focus comes to `target` and given to the main
 * content as the custom properties its scroll-padding is made of; then
 * `target` is scrolled into sight, clear of them. Where a part is not
 * stuck, it reaches no nearer than what it heads, so the room it is
 * given moves nothing. What is itself in the header row or the first
 * column needs no room from that part. A table outside the main content
 * has nothing that sticks.
 */
export function clearSticky(table: HTMLTableElement, target: Element): void {
  const main = table.closest("main");
  if (main === null) return;
  const pane = main.getBoundingClientRect();
  const header = table.tHead!;
  // Sideways, a narrow screen's table scrolls in its own box (studio.css).
  const box = table.parentElement!;
  const across = box.scrollWidth > box.clientWidth ? box.getBoundingClientRect() : pane;
  // The first column, and the row's name after a row's checkbox (studio.css).
  const stuck = table.classList.contains("selectable") ? 2 : 1;
  const cellsOf = (row: Element) => [...row.children].slice(0, stuck);
  // A caption's link is in no row.
  const row = target.closest("tr");
  const inFirst = row !== null && cellsOf(row).some((cell) => cell.contains(target));
  const firstEnd = cellsOf(header.firstElementChild!).at(-1)!.getBoundingClientRect().right;
  const bar = main.querySelector(".studio-bulk-bar")?.getBoundingClientRect();
  const room = [
    header.contains(target) ? 0 : header.getBoundingClientRect().bottom - pane.top,
    inFirst ? 0 : firstEnd - across.left,
    bar === undefined ? 0 : pane.bottom - bar.top,
  ];
  room.forEach((size, at) => main.style.setProperty(STICKY[at]!, `${Math.max(0, size)}px`));
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/**
 * Takes the room clearSticky made away as the focus leaves the table, so
 * that what sticks is itself scrolled to no further (the bar of the
 * rows selected, its buttons focused).
 */
export function unclearSticky(table: HTMLTableElement): void {
  const main = table.closest("main");
  for (const property of STICKY) main?.style.removeProperty(property);
}
