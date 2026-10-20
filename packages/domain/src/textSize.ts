// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The text sizes the app comes in, from the browser's own size up
 * (docs/theme.md, Text size): each scales the page's root font size, so
 * the browser's own text size is multiplied in. A preference, kept on
 * the device.
 */
export const TEXT_SIZES = ["default", "large", "larger", "largest"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

/** How much larger than the browser's own each size is: the root's font size, and --text-scale (style.css). */
export const TEXT_SCALES: Readonly<Record<TextSize, number>> = {
  default: 1,
  large: 1.125,
  larger: 1.25,
  largest: 1.5,
};

/** Until the user says otherwise, the text is the browser's own size. */
export const DEFAULT_TEXT_SIZE: TextSize = "default";

export function isTextSize(value: string): value is TextSize {
  return (TEXT_SIZES as readonly string[]).includes(value);
}
