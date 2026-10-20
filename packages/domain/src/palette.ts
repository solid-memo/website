// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The palettes the app comes in (docs/theme.md, Palettes): sets of
 * colors for what they do for the reader, each in the light theme and
 * in the dark, apart from the theme itself. A preference, kept on the
 * device.
 */
export const PALETTES = ["standard", "high-contrast", "color-vision", "parchment"] as const;

export type Palette = (typeof PALETTES)[number];

/** Until the user says otherwise, the app is in its standard colors. */
export const DEFAULT_PALETTE: Palette = "standard";

export function isPalette(value: string): value is Palette {
  return (PALETTES as readonly string[]).includes(value);
}
