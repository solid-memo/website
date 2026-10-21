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

/**
 * The least contrast a palette holds to (docs/accessibility.md): text on
 * what it is on, and an edge on its surface (a text field's, a focus
 * ring's). WCAG's AA (4.5:1 and 3:1) for every palette; High contrast's
 * AAA for text (7:1), and AA text's ratio for edges. A palette the user
 * designs is held to its base's.
 */
export function contrastTargets(palette: string): { text: number; edge: number } {
  return palette === "high-contrast" ? { text: 7, edge: 4.5 } : { text: 4.5, edge: 3 };
}
