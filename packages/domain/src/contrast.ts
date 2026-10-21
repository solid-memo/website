// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Colors as WCAG 2 measures them (docs/theme.md, Color roles): a color
 * read from `#rrggbb` or `#rrggbbaa`, two colors mixed as CSS's
 * `color-mix(in srgb, …)` mixes them, and the contrast ratio of text on
 * what it is on. The tests check the palettes' blocks with it, and the
 * palette editor the colors of a palette the user designs.
 */

/** A color: red, green and blue from 0 to 255, and its alpha from 0 to 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A color written `#rrggbb`, or `#rrggbbaa` with its alpha in 255ths, in either case; null for any other text. */
export function hexColor(text: string): Rgba | null {
  if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(text)) return null;
  const channel = (at: number) => Number.parseInt(text.slice(at, at + 2), 16);
  return {
    r: channel(1),
    g: channel(3),
    b: channel(5),
    a: text.length === 9 ? channel(7) / 255 : 1,
  };
}

/** An opaque color written `#rrggbb` in lower case, each channel rounded. */
export function hexOf({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Two colors mixed at these percentages, as CSS Color 5 mixes them in
 * sRGB: premultiplied, the percentages normalized, and below 100% in
 * all a mix the more transparent.
 */
export function mix(one: Rgba, p1: number, two: Rgba, p2: number): Rgba {
  const total = p1 + p2;
  const [w1, w2] = [p1 / total, p2 / total];
  const a = one.a * w1 + two.a * w2;
  const channel = (key: "r" | "g" | "b") =>
    a === 0 ? 0 : (one[key] * one.a * w1 + two[key] * two.a * w2) / a;
  return { r: channel("r"), g: channel("g"), b: channel("b"), a: a * Math.min(1, total / 100) };
}

/** `top` laid over the opaque `under`. */
export function over(top: Rgba, under: Rgba): Rgba {
  const mixed = (key: "r" | "g" | "b") => top[key] * top.a + under[key] * (1 - top.a);
  return { r: mixed("r"), g: mixed("g"), b: mixed("b"), a: 1 };
}

/** A color's relative luminance, as WCAG 2 defines it. */
function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG 2's contrast ratio of `text` on `surface`, from 1 to 21: `text`
 * laid over the surface first if it is see-through. The surface is
 * opaque, or laid over what it is on by the caller.
 */
export function contrast(text: Rgba, surface: Rgba): number {
  if (surface.a < 1) throw new Error("A surface seen through: lay it over what it is on");
  const [high, low] = [luminance(over(text, surface)), luminance(surface)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
