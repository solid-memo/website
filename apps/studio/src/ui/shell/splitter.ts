// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * How big a pane a splitter sizes may be, in CSS pixels: no smaller than
 * `min`, no bigger than `max`, and `initial` until the user sizes it.
 */
export interface PaneSize {
  min: number;
  max: number;
  initial: number;
}

/** The aside's width, beside the main content. */
export const ASIDE_WIDTH: PaneSize = { min: 192, max: 640, initial: 288 };

/** The aside's width as a detail (a card beside its deck's cards): wider, for an editor. */
export const DETAIL_WIDTH: PaneSize = { min: 320, max: 960, initial: 480 };

/** The dock's height, under the main content. */
export const DOCK_HEIGHT: PaneSize = { min: 96, max: 480, initial: 192 };

/**
 * A pane's bounds at the page's text size: those above are for a root
 * font size of 16px, the browser's own, and a larger text size (the
 * browser's, or the page's) makes them as much larger, so a pane keeps
 * as much of its content in sight.
 */
export function scaledPane(size: PaneSize): PaneSize {
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
  return { ...size, min: Math.round(size.min * scale), max: Math.round(size.max * scale) };
}

/** How far an arrow key moves a splitter, in CSS pixels. */
export const SPLITTER_STEP = 16;

/** A size kept within the pane's bounds, in whole pixels. */
export function clampSize(value: number, size: PaneSize): number {
  return Math.round(Math.min(size.max, Math.max(size.min, value)));
}

/**
 * The size a key gives the pane a splitter sizes, or null for a key the
 * splitter does not take. The pane is at the end of the splitter (the
 * aside right of it, the dock under it), so moving the splitter toward
 * the start makes it bigger: Left for a vertical splitter, Up for a
 * horizontal one. Home makes it as small as it may be, End as big.
 */
export function splitterKey(
  key: string,
  orientation: "vertical" | "horizontal",
  value: number,
  size: PaneSize,
): number | null {
  const [grow, shrink] =
    orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  switch (key) {
    case grow:
      return clampSize(value + SPLITTER_STEP, size);
    case shrink:
      return clampSize(value - SPLITTER_STEP, size);
    case "Home":
      return size.min;
    case "End":
      return size.max;
    default:
      return null;
  }
}

/**
 * The size a drag gives the pane: what it was when the drag began
 * (`from`), and as far bigger as the pointer moved toward the start
 * since (`start`, then `at`, along the splitter's axis).
 */
export function draggedSize(from: number, start: number, at: number, size: PaneSize): number {
  return clampSize(from + start - at, size);
}
