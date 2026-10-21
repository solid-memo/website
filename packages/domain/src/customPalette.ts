// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
// SPDX-FileCopyrightText: 2021 Jan Warchoł
//
// SPDX-License-Identifier: MIT

import { contrast, hexColor, hexOf, mix, type Rgba } from "./contrast";
import type { LangText } from "./langText";
import { contrastTargets, isPalette, type Palette } from "./palette";
import { THEMES, type Theme } from "./theme";

/**
 * A palette the user designs (docs/theme.md, Palettes of one's own): a
 * name, the palette it is based on, and the colors it sets in the light
 * theme and in the dark, kept in the instance's palettes document. It
 * sets only the roles listed here, each an opaque color written
 * `#rrggbb`; every other role is its base's, or derived from the colors
 * it sets (DERIVED_ROLES). The pod is data anyone who may write it may
 * have written, so a palette read from it, or from the device, is held
 * to these rules again here (parsePalette) before anything is painted.
 */

/**
 * The roles of palettes.css a user's palette sets, and no other: the
 * surfaces and the text on them, the lines and a field's edge, the
 * primary color (a focus ring's too), a primary button, links, danger
 * and warning text, and the answer buttons' grades. Opaque colors all,
 * which a contrast check can measure.
 */
export const PALETTE_ROLES = [
  "--bg",
  "--surface",
  "--surface-sunken",
  "--text",
  "--text-muted",
  "--border",
  "--control-border",
  "--primary",
  "--primary-fill",
  "--on-primary",
  "--link",
  "--danger",
  "--warning-text",
  "--grade-0",
  "--grade-1",
  "--grade-2",
  "--grade-3",
  "--grade-4",
  "--grade-5",
] as const;

export type PaletteRole = (typeof PALETTE_ROLES)[number];

/**
 * The roles that go with a role a palette sets, and how each is mixed
 * from two of them as `color-mix(in srgb, one p%, two)` would: a hovered
 * surface from the text and the surface, a soft tint from its color and
 * the surface. One is painted only when the palette sets a color it is
 * mixed from, else it stays its base's.
 */
const DERIVED: Record<string, readonly [one: PaletteRole, percent: number, two: PaletteRole]> = {
  "--surface-hover": ["--text", 6, "--surface"],
  "--border-strong": ["--text", 20, "--border"],
  "--primary-hover": ["--text", 20, "--primary-fill"],
  "--primary-soft": ["--primary", 12, "--surface"],
  "--link-hover-bg": ["--text", 10, "--surface"],
  "--danger-soft": ["--danger", 10, "--surface"],
  "--danger-border": ["--danger", 30, "--surface"],
  "--warning-soft": ["--warning-text", 10, "--surface"],
  "--warning-border": ["--warning-text", 35, "--surface"],
};

/** The roles mixed from those a palette sets. */
export const DERIVED_ROLES = Object.keys(DERIVED);

/** Every role a user's palette paints: those it sets, then those mixed from them. */
export const PAINTED_ROLES: readonly string[] = [...PALETTE_ROLES, ...DERIVED_ROLES];

/** The colors a palette sets in one theme, by role; a role it leaves out is its base's. */
export type PaletteColors = Partial<Record<PaletteRole, string>>;

export interface CustomPalette {
  /** Its subject in the instance's palettes document, the IRI the preferences choose it by. */
  url: string;
  /** Its name, by language tag. */
  title: LangText;
  /** The palette whose colors it has where it sets none. */
  basedOn: Palette;
  light: PaletteColors;
  dark: PaletteColors;
}

/** What a palette paints with, and is checked by: its base and its colors. */
export type PaletteSettings = Pick<CustomPalette, "basedOn" | "light" | "dark">;

/** A palette as the editor gives it to be saved: one with no address yet is a new one. */
export type PaletteDraft = Omit<CustomPalette, "url"> & { url: string | null };

/** The palette the app is shown in: a built-in one, or one of the user's own over its base. */
export interface ShownPalette {
  palette: Palette;
  custom: CustomPalette | null;
}

/** An opaque color as a palette the user designs writes one: `#rrggbb`, nothing else. */
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/**
 * Each built-in palette's colors of the painted roles, in the order of
 * PAINTED_ROLES, as palettes.css sets them (style.test.ts keeps the two
 * in step): what a user's palette has where it sets none.
 */
const BUILT_IN: Record<Palette, Record<Theme, string>> = {
  standard: {
    light:
      "#f7f6f1 #ffffff #fbfaf5 #16202a #545c68 #e4e1d5 #858072 " +
      "#2c6b3d #2c6b3d #ffffff #25603a #c42d18 #7a5800 #d63a25 " +
      "#e2662a #e8932a #d9b11c #7fb13c #2f8a4a #f1efe6 #cfcbbb " +
      "#235430 #e6f1e8 #e4e5e7 #fdeee9 #f0c9be #fdf4dc #e6c876",
    dark:
      "#11171e #19212b #151c25 #ecebe4 #9ba6b2 #2a3644 #66788d " +
      "#4fae6a #2a7340 #ffffff #74cc8e #ff8a75 #f1d283 #d63a25 " +
      "#e2662a #e8932a #d9b11c #7fb13c #2f8a4a #232e3b #3a4859 " +
      "#33864b #1b3324 #3a414b #38201c #63302a #33280e #5e4a17",
  },
  "high-contrast": {
    light:
      "#ffffff #ffffff #f3f3f3 #000000 #303030 #6e6e6e #4d4d4d " +
      "#004488 #004488 #ffffff #004488 #8f1029 #5c3f00 #b8211a " +
      "#c75a12 #c98a00 #a99000 #5f8f1c #1f6e35 #e8e8e8 #303030 " +
      "#002d5c #e3edf7 #e3edf7 #fbeef0 #8f1029 #fbf3df #8a6400",
    dark:
      "#000000 #0f0f0f #080808 #ffffff #d6d6d6 #8c8c8c #a6a6a6 " +
      "#8ec5ff #8ec5ff #000000 #a6d1ff #ffb3bd #ffd97a #e8432b " +
      "#ee7733 #ddaa33 #d9c21c #8fc24a #44aa66 #262626 #cccccc " +
      "#b8dbff #0e2a47 #0e2a47 #3d0a12 #ff8090 #2e2200 #b38a00",
  },
  "color-vision": {
    light:
      "#f7f6f1 #ffffff #fbfaf5 #16202a #545c68 #e4e1d5 #858072 " +
      "#00649c #00649c #ffffff #005a8c #a84800 #7a5300 #d55e00 " +
      "#e69f00 #f0e442 #56b4e9 #2b93cd #0072b2 #f1efe6 #cfcbbb " +
      "#004e7a #e4f0f7 #e4e5e7 #fbeee5 #efc6a9 #fdf3dc #e6c470",
    dark:
      "#11171e #19212b #151c25 #ecebe4 #b9c2cc #2a3644 #66788d " +
      "#56b4e9 #56b4e9 #000000 #8dcdf2 #ff9b5e #f0b43c #d55e00 " +
      "#e69f00 #f0e442 #56b4e9 #2b93cd #0072b2 #232e3b #3a4859 " +
      "#7fc6ef #14293a #3a414b #3a2216 #6e3a1c #33280e #5e4a17",
  },
  parchment: {
    light:
      "#ece3cc #fbf3db #f4ebd3 #2c3d43 #43555b #d5cdb6 #7d745e " +
      "#3b6600 #3b6600 #fbf3db #376000 #ad1a25 #6e5600 #d2212d " +
      "#c25d1e #b8750f #ad8900 #7b8f00 #489100 #e4dbc2 #bdb49b " +
      "#2e5000 #e0e3c4 #dcd3ba #f5e2cc #e2b4a2 #f3e7c2 #d6bf75",
    dark:
      "#1d1a15 #26221b #221e18 #ece3cc #c2b9a3 #3b3529 #857b66 " +
      "#84c747 #84c747 #1d1a15 #9bd466 #ff7b6e #e3bf45 #fa5750 " +
      "#ed8649 #e39d3a #dbb32d #a8b934 #75b938 #312c23 #4d4535 " +
      "#97d35f #28311b #403a2e #3a201a #6b3028 #33290f #5e4b17",
  },
};

/** A built-in palette's color of every painted role in a theme, by role. */
export function builtInColors(palette: Palette, theme: Theme): Record<string, string> {
  const colors = BUILT_IN[palette][theme].split(" ");
  return Object.fromEntries(PAINTED_ROLES.map((role, at) => [role, colors[at]!]));
}

/** The colors in `value` a palette may set: the listed roles alone, each `#rrggbb`, in lower case. */
function colorsOf(value: unknown): PaletteColors {
  if (typeof value !== "object" || value === null) return {};
  const given = value as Record<string, unknown>;
  return Object.fromEntries(
    PALETTE_ROLES.filter((role) => Object.hasOwn(given, role) && isHexColor(given[role])).map(
      (role) => [role, (given[role] as string).toLowerCase()],
    ),
  );
}

/** A name's text by language tag: only text, under a tag of letters, digits and hyphens. */
function titleOf(value: unknown): LangText {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        /^[a-z0-9-]{0,35}$/.test(entry[0]) && typeof entry[1] === "string",
    ),
  );
}

/**
 * A palette from what was read, its pod's record or the device's copy,
 * held to the rules again: its address a string, its base a built-in
 * palette (Standard for any other), and only the listed roles' colors,
 * each `#rrggbb`, every other value left out. Null when it has no
 * address.
 */
export function parsePalette(value: unknown): CustomPalette | null {
  if (typeof value !== "object" || value === null) return null;
  const given = value as Record<string, unknown>;
  if (typeof given.url !== "string" || given.url === "") return null;
  return {
    url: given.url,
    title: titleOf(given.title),
    basedOn:
      typeof given.basedOn === "string" && isPalette(given.basedOn) ? given.basedOn : "standard",
    light: colorsOf(given.light),
    dark: colorsOf(given.dark),
  };
}

/**
 * The colors to paint a palette with in a theme, by role, over its
 * base's: those it sets, and each role mixed from them (DERIVED) where
 * it sets a color the role is mixed from to other than its base's.
 */
export function paintedColors(palette: PaletteSettings, theme: Theme): Record<string, string> {
  const base = builtInColors(palette.basedOn, theme);
  const set = colorsOf(palette[theme]);
  const color = (role: PaletteRole) => set[role] ?? base[role]!;
  const changed = (role: PaletteRole) => set[role] !== undefined && set[role] !== base[role];
  const derived = Object.entries(DERIVED)
    .filter(([, [one, , two]]) => changed(one) || changed(two))
    .map(([role, [one, percent, two]]) => [
      role,
      hexOf(mix(hexColor(color(one))!, percent, hexColor(color(two))!, 100 - percent)),
    ]);
  return { ...set, ...Object.fromEntries(derived) };
}

/** A palette's color of every painted role in a theme: its base's, with what it paints over them. */
export function effectiveColors(palette: PaletteSettings, theme: Theme): Record<string, string> {
  return { ...builtInColors(palette.basedOn, theme), ...paintedColors(palette, theme) };
}

/** A pair of colors the check measures: one in front, text or an edge, on what it is on. */
export interface CheckedPair {
  front: string;
  back: string;
  /**
   * What it is on is an answer button's tint, its grade at this many
   * percent over the surface: 12, or 24 under the pointer (style.css's
   * .quality-buttons).
   */
  tint?: 12 | 24;
  /** An edge (a text field's, a focus ring's), held to the edge's ratio, not the text's. */
  edge?: true;
}

const SURFACES = ["--bg", "--surface", "--surface-sunken", "--surface-hover"];

/**
 * The pairs that hold text, or that the user must see, the same the
 * tests check of every built-in palette (style.test.ts) among the roles
 * a palette of one's own paints: text, muted text, links, danger and
 * warning text on every surface and on their own tints, the text on a
 * primary button and on the primary color, an answer button's text and
 * muted text on its tint, and a field's edge and the focus ring on the
 * surfaces.
 */
export const CHECKED_PAIRS: readonly CheckedPair[] = [
  ...["--text", "--text-muted", "--link", "--danger", "--warning-text"].flatMap((front) =>
    SURFACES.map((back) => ({ front, back })),
  ),
  { front: "--text", back: "--primary-soft" },
  { front: "--text-muted", back: "--primary-soft" },
  { front: "--link", back: "--primary-soft" },
  { front: "--link", back: "--link-hover-bg" },
  { front: "--danger", back: "--danger-soft" },
  { front: "--warning-text", back: "--warning-soft" },
  { front: "--on-primary", back: "--primary-fill" },
  { front: "--on-primary", back: "--primary-hover" },
  { front: "--on-primary", back: "--primary" },
  ...[0, 1, 2, 3, 4, 5].flatMap((grade) =>
    ["--text", "--text-muted"].flatMap((front) =>
      ([12, 24] as const).map((tint) => ({ front, back: `--grade-${grade}`, tint })),
    ),
  ),
  ...SURFACES.map((back) => ({ front: "--control-border", back, edge: true as const })),
  ...["--bg", "--surface"].map((back) => ({ front: "--primary", back, edge: true as const })),
];

/**
 * Below this, the text on the page's background or on a surface is not
 * readable at all, whatever the user means: such a palette is not saved.
 */
export const REFUSED_BELOW = 3;

/** Whether a pair is the text itself on the background or a surface, which REFUSED_BELOW holds to. */
function isReading(pair: CheckedPair): boolean {
  return pair.front === "--text" && pair.tint === undefined && SURFACES.includes(pair.back);
}

/** What a pair of a palette measured: how it stands against its target. */
export interface PairCheck extends CheckedPair {
  theme: Theme;
  ratio: number;
  target: number;
  /**
   * "pass" at its target or more; "low" below it, saved only when the
   * user says so; "refused" for the text on the background or a surface
   * below 3:1 (REFUSED_BELOW).
   */
  verdict: "pass" | "low" | "refused";
}

/** A pair's contrast among `colors`, each role's color by role. */
function ratioOf(pair: CheckedPair, colors: Record<string, string>): number {
  const color = (role: string): Rgba => hexColor(colors[role]!)!;
  const back =
    pair.tint === undefined
      ? color(pair.back)
      : mix(color(pair.back), pair.tint, color("--surface"), 100 - pair.tint);
  return contrast(color(pair.front), back);
}

/**
 * Every checked pair of a palette in each theme, measured against the
 * targets of its base (contrastTargets): what the editor shows, and
 * what a save is held to. A pair the base itself has below its target,
 * one of the known gaps docs/accessibility.md lists, is held to the
 * base's own ratio instead, so that the gap counts against the base,
 * not against a palette that keeps it.
 */
export function checkPalette(palette: PaletteSettings): PairCheck[] {
  const targets = contrastTargets(palette.basedOn);
  return THEMES.flatMap((theme) => {
    const colors = effectiveColors(palette, theme);
    const base = builtInColors(palette.basedOn, theme);
    return CHECKED_PAIRS.map((pair): PairCheck => {
      const ratio = ratioOf(pair, colors);
      const target = Math.min(pair.edge ? targets.edge : targets.text, ratioOf(pair, base));
      const reading = isReading(pair);
      return {
        ...pair,
        theme,
        ratio,
        target,
        verdict: ratio >= target ? "pass" : reading && ratio < REFUSED_BELOW ? "refused" : "low",
      };
    });
  });
}

/** How a palette's checks stand together: refused if any is, else low if any is, else it passes. */
export function paletteVerdict(checks: readonly PairCheck[]): PairCheck["verdict"] {
  if (checks.some((check) => check.verdict === "refused")) return "refused";
  return checks.some((check) => check.verdict === "low") ? "low" : "pass";
}

/**
 * Whether a palette's text is readable on the background and on every
 * surface (REFUSED_BELOW): one that is not, written by another app or
 * by any script of the site, is shown as its base.
 */
export function isReadable(palette: PaletteSettings): boolean {
  return paletteVerdict(checkPalette(palette)) !== "refused";
}
