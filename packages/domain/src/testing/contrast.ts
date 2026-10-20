// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The palettes' colors as the tests read them (docs/theme.md, Color
 * roles): the blocks of `packages/ui/src/palettes.css`, each palette's in
 * the light theme and in the dark, a role's color with its `var()`
 * references followed and its `color-mix()` mixed, and WCAG 2's contrast
 * ratio of two colors. It reads CSS text, not files: each test reads its
 * own.
 */

/** A color: red, green and blue from 0 to 255, and its alpha from 0 to 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A block of palettes.css: the palette and the theme it is for, and the roles it sets, by name. */
export interface PaletteBlock {
  palette: string;
  theme: "light" | "dark";
  selector: string;
  roles: Record<string, string>;
}

/** CSS text without its comments. */
export function uncommented(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The selector of a palette block: `:root` for Standard, then the palette, then the dark theme. */
const BLOCK = /^:root(?:\[data-palette="([a-z][a-z-]*)"\])?(\[data-theme="dark"\])?$/;

/**
 * Every block of palettes.css, in the order written. A rule whose
 * selector is not a palette block's throws: the file holds nothing else.
 */
export function paletteBlocks(css: string): PaletteBlock[] {
  return [...uncommented(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => {
    const selector = match[1]!.trim();
    const parts = BLOCK.exec(selector);
    if (parts === null) throw new Error(`Not a palette block: ${selector}`);
    const roles = Object.fromEntries(
      match[2]!
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration !== "")
        .map((declaration) => {
          const colon = declaration.indexOf(":");
          return [
            declaration.slice(0, colon).trim(),
            declaration
              .slice(colon + 1)
              .replace(/\s+/g, " ")
              .trim(),
          ];
        }),
    );
    return {
      palette: parts[1] ?? "standard",
      theme: parts[2] === undefined ? "light" : "dark",
      selector,
      roles,
    };
  });
}

/** The arguments of a function's call, split at its top-level commas. */
function argumentsOf(call: string): string[] {
  const inner = call.slice(call.indexOf("(") + 1, -1);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < inner.length; at++) {
    if (inner[at] === "(") depth++;
    if (inner[at] === ")") depth--;
    if (inner[at] === "," && depth === 0) {
      parts.push(inner.slice(start, at).trim());
      start = at + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts;
}

/** A color and the percentage it is mixed at, if it says one. */
function mixPart(part: string): { color: string; percent: number | undefined } {
  const percent = /\s+(\d+(?:\.\d+)?)%$/.exec(part);
  return percent === null
    ? { color: part, percent: undefined }
    : { color: part.slice(0, percent.index), percent: Number(percent[1]) };
}

/**
 * `value`'s color, as palettes.css writes one: `#rrggbb` (or
 * `#rrggbbaa`, its alpha in 255ths), `transparent`,
 * `var()` of a role in `roles`, or `color-mix(in srgb, …)` of two of
 * these, mixed as CSS Color 5 says (premultiplied, the percentages
 * normalized, and below 100% in all a mix the more transparent).
 */
export function colorOf(value: string, roles: Record<string, string>): Rgba {
  const color = value.trim();
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(color)) {
    const channel = (at: number) => Number.parseInt(color.slice(at, at + 2), 16);
    return {
      r: channel(1),
      g: channel(3),
      b: channel(5),
      a: color.length === 9 ? channel(7) / 255 : 1,
    };
  }
  if (color === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const reference = /^var\((--[\w-]+)\)$/.exec(color);
  if (reference !== null) {
    const role = roles[reference[1]!];
    if (role === undefined) throw new Error(`No role ${reference[1]}`);
    return colorOf(role, roles);
  }
  if (color.startsWith("color-mix(") && color.endsWith(")")) {
    const [space, first, second] = argumentsOf(color);
    if (space !== "in srgb" || first === undefined || second === undefined)
      throw new Error(`Not a mix in sRGB of two colors: ${color}`);
    const one = mixPart(first);
    const two = mixPart(second);
    const p1 = one.percent ?? (two.percent === undefined ? 50 : 100 - two.percent);
    const p2 = two.percent ?? 100 - p1;
    const total = p1 + p2;
    const [c1, c2] = [colorOf(one.color, roles), colorOf(two.color, roles)];
    const [w1, w2] = [p1 / total, p2 / total];
    const a = c1.a * w1 + c2.a * w2;
    const channel = (key: "r" | "g" | "b") =>
      a === 0 ? 0 : (c1[key] * c1.a * w1 + c2[key] * c2.a * w2) / a;
    return { r: channel("r"), g: channel("g"), b: channel("b"), a: a * Math.min(1, total / 100) };
  }
  throw new Error(`Not a palette color: ${color}`);
}

/** `top` laid over the opaque `under`. */
export function over(top: Rgba, under: Rgba): Rgba {
  const mix = (key: "r" | "g" | "b") => top[key] * top.a + under[key] * (1 - top.a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
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

/**
 * The least contrast a palette's blocks hold to (docs/accessibility.md):
 * text on what it is on, and a text field's edge on its surface. WCAG's
 * AA (4.5:1 and 3:1) for every palette; High contrast's AAA for text
 * (7:1), and AA text's ratio for edges.
 */
export function contrastTargets(palette: string): { text: number; edge: number } {
  return palette === "high-contrast" ? { text: 7, edge: 4.5 } : { text: 4.5, edge: 3 };
}

/** A color written as palettes.css writes one, alone: see colorOf. */
const COLOR_PART = String.raw`#[0-9a-f]{6}(?:[0-9a-f]{2})?|transparent|var\(--[\w-]+\)`;

/** Whether `value` is a color as palettes.css writes one, color-mix() of such colors among them. */
function isPaletteColor(value: string): boolean {
  if (new RegExp(`^(?:${COLOR_PART})$`).test(value)) return true;
  if (!value.startsWith("color-mix(") || !value.endsWith(")")) return false;
  const [space, ...colors] = argumentsOf(value);
  return (
    space === "in srgb" &&
    colors.length === 2 &&
    colors.every((part) => isPaletteColor(mixPart(part).color))
  );
}

/**
 * Whether a role's value is written as palettes.css allows: a color (see
 * isPaletteColor), or a shadow of such colors (lengths, `inset`, and
 * several shadows apart by commas). No `rgb()`, `hsl()`, short hex or
 * named color: what a palette sets is checked, and later read from
 * elsewhere, by these few forms alone.
 */
export function isPaletteValue(value: string): boolean {
  return argumentsOf(`(${value})`).every((shadow) => {
    const words = shadow.match(/color-mix\((?:[^()]|\([^()]*\))*\)|\S+/g) ?? [];
    return (
      words.length > 0 &&
      words.every(
        (word) =>
          isPaletteColor(word) || word === "inset" || /^-?\d*\.?\d+(?:px|rem|em)?$/.test(word),
      )
    );
  });
}

/**
 * The colors `css` writes out itself, outside palettes.css's roles:
 * hexadecimal colors, and `rgb()`, `rgba()`, `hsl()` or `hsla()` calls,
 * in declarations' values (not a selector's `#id`), comments left out.
 */
export function literalColors(css: string): string[] {
  return [...uncommented(css).matchAll(/:\s*([^;{}]+)(?=[;}])/g)]
    .flatMap((value) => [...value[1]!.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g)])
    .map((match) => match[0]);
}
