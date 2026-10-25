// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  colorOf,
  contrast,
  isPaletteValue,
  literalColors,
  contrastTargets,
  DEFICIENCIES,
  difference,
  over,
  paletteBlocks,
  type PaletteBlock,
  uncommented,
} from "@solid-memo/domain/testing/contrast";
import { PALETTES as PALETTE_IDS } from "@solid-memo/domain/palette";
import {
  builtInColors,
  CHECKED_PAIRS,
  PAINTED_ROLES,
  SERIES_ROLES,
  seriesColors,
} from "@solid-memo/domain/customPalette";
import { hexOf } from "@solid-memo/domain/contrast";
import { DEFAULT_TEXT_SIZE, TEXT_SCALES, TEXT_SIZES } from "@solid-memo/domain/textSize";

const read = (name: string) => readFileSync(join(import.meta.dirname, name), "utf8");
/** The palettes, which style.css imports. */
const PALETTES = read("palettes.css");

/*
 * The focus indicators in style.css, checked through the cascade itself,
 * since a later or more specific rule can silently take a ring away. The
 * font imports are left out: the test DOM has no packages to fetch; the
 * palettes are put in where style.css imports them. Nor does it know
 * :lang(), so it reads an element marked lang="ko", lang="ar" and so on
 * itself (of the same specificity) for it.
 */
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = read("style.css")
    .replace('@import "./palettes.css";', () => PALETTES)
    .replace(/^@import .*$/gm, "")
    .replace(/:lang\(([a-z]+)\)/g, '[lang|="$1"]');
  document.head.append(style);
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Puts `html` in the page and focuses the element `selector` names. */
function focused(html: string, selector: string): CSSStyleDeclaration {
  document.body.innerHTML = html;
  const element = document.querySelector<HTMLElement>(selector)!;
  element.focus();
  return getComputedStyle(element);
}

/**
 * The `property` value of the last rule in style.css that `element`
 * matches, for a state the test DOM's cascade does not follow.
 */
function lastMatching(element: Element, property: string): string | undefined {
  return [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter(
      (rule) => element.matches(rule.selectorText) && rule.style.getPropertyValue(property) !== "",
    )
    .map((rule) => rule.style.getPropertyValue(property))
    .at(-1);
}

describe("focus styles", () => {
  it.each(["radio", "checkbox"])("rings a focused %s in the primary color", (type) => {
    const style = focused(`<input type="${type}">`, "input");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
    expect(style.outlineOffset).toBe("2px");
  });

  it("shows a text field's focus with its border, and keeps an outline for forced colors", () => {
    const style = focused(`<input type="text">`, "input");
    expect(style.borderColor).toBe("#2c6b3d");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("transparent");
  });

  it("rings the focused language list in the primary color", () => {
    const style = focused(
      `<label class="language-selector"><select><option>en</option></select></label>`,
      "select",
    );
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
  });

  it("fades a busy button, but shows it in full with its ring when focused", () => {
    document.body.innerHTML = `<button aria-disabled="true">x</button>`;
    const button = document.querySelector("button")!;
    expect(getComputedStyle(button).opacity).toBe("0.5");
    button.focus();
    expect(lastMatching(button, "opacity")).toBe("1");
    expect(lastMatching(button, "outline-color")).toBe("var(--primary)");
  });

  it.each([
    ["the brand", `<header class="masthead"><a class="brand" href="#/">x</a></header>`, "a"],
    [
      "the wordmark",
      `<header class="masthead"><h1><a class="wordmark" href="#/">x</a></h1></header>`,
      "a",
    ],
    [
      "the WebID link",
      `<header class="masthead"><p class="session-line"><a href="https://x">x</a></p></header>`,
      "a",
    ],
    ["a button", `<header class="masthead"><button>x</button></header>`, "button"],
  ])("rings %s in the masthead's text color, which shows on its navy", (_, html, selector) => {
    expect(focused(html, selector).outlineColor).toBe("#f7f6f1");
  });

  it.each([
    [
      "a deck's menu button",
      `<ul class="deck-list"><li class="deck-row"><button class="icon row-menu">x</button></li></ul>`,
      "button",
    ],
    [
      "a group's fold button",
      `<div class="deck-group-header"><button class="group-toggle">x</button></div>`,
      "button",
    ],
    [
      "a group's menu button",
      `<div class="deck-group-header"><button class="icon row-menu">x</button></div>`,
      "button",
    ],
    [
      "a menu's item",
      `<div class="actions-menu" role="menu"><button role="menuitem">x</button></div>`,
      "button",
    ],
    [
      "a menu's link",
      `<div class="actions-menu" role="menu"><a role="menuitem" href="#/">x</a></div>`,
      "a",
    ],
  ])("rings %s in the primary color", (_, html, selector) => {
    const style = focused(html, selector);
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
  });

  it("always shows a deck's menu button, the pointer over its row or not", () => {
    document.body.innerHTML = `<ul class="deck-list"><li class="deck-row"><a href="#/">x</a><button class="icon row-menu">x</button></li></ul>`;
    const button = document.querySelector("button")!;
    expect(getComputedStyle(button).opacity).not.toBe("0");
    const hovering = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter(
        (rule): rule is CSSMediaRule =>
          rule instanceof CSSMediaRule && rule.conditionText === "(hover: hover)",
      )
      .flatMap((rule) => [...rule.cssRules])
      .filter(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule && rule.selectorText.includes("row-menu"),
      );
    expect(hovering).toEqual([]);
  });

  it("mutes a menu's item that cannot be done now, unhighlighted when focused, but not faded under its ring", () => {
    const style = focused(
      `<div class="actions-menu" role="menu"><button role="menuitem" aria-disabled="true">x</button></div>`,
      "button",
    );
    const item = document.querySelector("button")!;
    expect(style.color).toBe("#545c68");
    expect(lastMatching(item, "opacity")).toBe("1");
    expect(lastMatching(item, "background")).not.toContain("--surface-hover");
    expect(lastMatching(item, "outline-color")).toBe("var(--primary)");
    item.removeAttribute("aria-disabled");
    expect(lastMatching(item, "background")).toBe("var(--surface-hover)");
    expect(getComputedStyle(item).color).not.toBe("#545c68");
  });

  it("gives a menu's link no link highlight under the pointer, as a link elsewhere has", () => {
    /** The box shadows the rules for `element` under the pointer give it. */
    const hovered = (element: Element) =>
      [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter(
          (rule): rule is CSSStyleRule =>
            rule instanceof CSSStyleRule && rule.selectorText.includes(":hover"),
        )
        .filter((rule) => element.matches(rule.selectorText.replaceAll(":hover", "")))
        .map((rule) => rule.style.getPropertyValue("box-shadow"))
        .filter((shadow) => shadow !== "");
    document.body.innerHTML = `
      <p><a href="#/">x</a></p>
      <div class="actions-menu" role="menu"><a role="menuitem" href="#/">p</a></div>`;
    const [link, item] = document.querySelectorAll("a");
    expect(hovered(link)).not.toEqual([]);
    expect(hovered(item)).toEqual([]);
  });

  it("rings a course question's radio in the primary color", () => {
    const style = focused(
      `<div class="choices"><label class="choice"><input type="radio"></label></div>`,
      "input",
    );
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
  });

  it("rings a menu's item inside it, clear of its clipping", () => {
    const style = focused(
      `<div class="actions-menu" role="menu"><button role="menuitem">x</button></div>`,
      "button",
    );
    expect(style.outlineOffset).toBe("-2px");
  });

  it("draws a card table link's ring inside its cell, clear of the table's clipping", () => {
    const style = focused(
      `<table><tr><td class="clickable"><a href="#/">x</a></td></tr></table>`,
      "a",
    );
    expect(style.outlineOffset).toBe("-4px");
  });
});

/*
 * Reflow and text spacing (WCAG 1.4.10, 1.4.12): at 320px, or with the
 * reader's own spacing, names and labels wrap rather than being cut off.
 */
describe("reflow", () => {
  /** Puts `html` in the page and returns the computed style of `selector`. */
  function styled(html: string, selector: string): CSSStyleDeclaration {
    document.body.innerHTML = html;
    return getComputedStyle(document.querySelector(selector)!);
  }

  it.each([
    ["a button", `<button>x</button>`, "button"],
    ["a link styled as a button", `<a class="button" href="#/">x</a>`, "a"],
    [
      "the wordmark",
      `<div class="masthead"><h1><a class="brand" href="#/"><span class="wordmark">x</span></a></h1></div>`,
      "h1",
    ],
    ["the session line", `<div class="masthead"><p class="session-line">x</p></div>`, "p"],
    ["a breadcrumb", `<nav class="breadcrumbs"><ol><li><a href="#/">x</a></li></ol></nav>`, "a"],
    [
      "a deck's name",
      `<ul class="deck-list"><li class="deck-row"><a class="deck-open" href="#/">x</a></li></ul>`,
      "a",
    ],
    [
      "a group's name",
      `<div class="deck-group-header"><button class="group-toggle"><span class="group-name">x</span></button></div>`,
      "span",
    ],
    ["a group to move into", `<div class="move-into"><button>x</button></div>`, "button"],
    [
      "a library deck's name",
      `<ul class="library-list"><li><a class="library-deck-name" href="#/">x</a></li></ul>`,
      "a",
    ],
    [
      "the instance's name",
      `<div class="instance-bar-identity"><strong>x</strong></div>`,
      "strong",
    ],
    [
      "the instance's address",
      `<div class="instance-bar-identity"><span class="hint">x</span></div>`,
      "span",
    ],
    [
      "a storage's address",
      `<ul class="storage-list"><li><span class="hint">x</span></li></ul>`,
      "span",
    ],
    [
      "an instance's address",
      `<ul class="instance-list"><li><span class="hint">x</span></li></ul>`,
      "span",
    ],
  ])("wraps %s instead of cutting it off", (_, html, selector) => {
    const style = styled(html, selector);
    expect(style.whiteSpace).not.toBe("nowrap");
    expect(style.textOverflow).not.toBe("ellipsis");
  });

  it.each([
    ["the session line", `<div class="masthead"><p class="session-line">x</p></div>`, "p"],
    [
      "a deck's name",
      `<ul class="deck-list"><li class="deck-row"><a class="deck-open" href="#/">x</a></li></ul>`,
      "a",
    ],
    [
      "a group's name",
      `<div class="deck-group-header"><button class="group-toggle"><span class="group-name">x</span></button></div>`,
      "span",
    ],
    [
      "a storage's address",
      `<ul class="storage-list"><li><span class="hint">x</span></li></ul>`,
      "span",
    ],
  ])("breaks %s anywhere, so a long WebID or name fits the width", (_, html, selector) => {
    expect(styled(html, selector).overflowWrap).toBe("anywhere");
  });

  it.each(["input", "textarea"])(
    "keeps a %s no wider than what it is in, its width in characters at any text size",
    (tag) => {
      expect(styled(`<${tag}></${tag}>`, tag).maxWidth).toBe("100%");
    },
  );

  it("lets a card table's column names break, its cells' room cut, on a narrow screen", () => {
    const narrow = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter(
        (rule): rule is CSSMediaRule =>
          rule instanceof CSSMediaRule && rule.conditionText === "(max-width: 30rem)",
      )
      .flatMap((rule) => [...rule.cssRules] as CSSStyleRule[])
      .filter((rule) => rule.selectorText.includes(".card-table"));
    expect(narrow.map((rule) => rule.style.cssText)).toEqual([
      "padding-inline: 0.45rem;",
      "overflow-wrap: anywhere;",
    ]);
  });

  it("lets a group's header wrap its actions under its name", () => {
    expect(styled(`<div class="deck-group-header"></div>`, "div").flexWrap).toBe("wrap");
    expect(
      parseFloat(
        styled(
          `<div class="deck-group-header"><button class="group-toggle">x</button></div>`,
          "button",
        ).minWidth,
      ),
    ).toBe(0);
  });

  it("gives a group no row's box: its header and members are rows of their own", () => {
    const style = styled(`<ul class="deck-list"><li class="deck-group"></li></ul>`, "li");
    expect(style.display).toBe("block");
    expect(style.borderTopStyle).not.toBe("solid");
  });

  it("indents a level of the deck list, but no further from the fifth level on", () => {
    const css = readFileSync(join(import.meta.dirname, "style.css"), "utf8");
    const start = css.search(/\.deck-group-clip\s*>\s*\.deck-list \{/);
    expect(css.slice(start, css.indexOf("}", start))).toContain(
      "margin-inline-start: calc(1.25rem * clamp(0, 5 - var(--depth, 1), 1));",
    );
  });

  it("lets the masthead wrap, and never clips what is in it", () => {
    const style = styled(`<div class="masthead"></div>`, "div");
    expect(style.flexWrap).toBe("wrap");
    expect(style.overflow).not.toBe("hidden");
  });

  it("keeps a card table's actions a cell of its row, not an `.actions` flex box", () => {
    // Read from the file: the test DOM drops a `table-cell` display it does not know.
    const css = readFileSync(join(import.meta.dirname, "style.css"), "utf8");
    const start = css.indexOf(".card-table td.actions {");
    expect(css.slice(start, css.indexOf("}", start))).toContain("display: table-cell;");
  });

  it("leaves the logo placed from the title, not from a tilted heading", () => {
    expect(styled(`<div class="masthead"><h1>x</h1></div>`, "h1").transform).toBe("none");
  });
});

const BLOCKS = paletteBlocks(PALETTES);
/** Standard's light block, whose roles every block sets. */
const STANDARD = BLOCKS[0]!;

/*
 * Larger text (docs/theme.md, Text size): the text is sized in rem, so
 * the root's font size scales it all, and what the window sizes (vw)
 * grows with --text-scale. A font size in px would stay as it is, and a
 * breakpoint in px would not follow the browser's own text size.
 */
describe("text size", () => {
  const css = uncommented(read("style.css"));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.replace(/\s+/g, " ").trim(),
    body: m[2]!,
  }));

  it("sizes no text in px but the focus proxy's, which must be 16px", () => {
    expect(
      rules
        .filter(({ body }) => /(?:^|[;\s])font-size:[^;]*\dpx/.test(body))
        .map(({ selector }) => selector),
    ).toEqual([".focus-proxy"]);
  });

  it("breaks no layout at a width in px", () => {
    const queries = [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1]!.trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query).not.toMatch(/\dpx/);
  });

  it("scales the root's font size and --text-scale alike at each larger size, and the default not at all", () => {
    const steps = rules.filter(({ selector }) => selector.startsWith(":root[data-text-size="));
    expect(steps.map(({ selector }) => selector)).toEqual(
      TEXT_SIZES.filter((size) => size !== DEFAULT_TEXT_SIZE).map(
        (size) => `:root[data-text-size="${size}"]`,
      ),
    );
    for (const [at, { body }] of steps.entries()) {
      const scale = TEXT_SCALES[TEXT_SIZES[at + 1]!];
      expect(body).toMatch(new RegExp(`--text-scale:\\s*${scale};`));
      expect(body).toMatch(new RegExp(`font-size:\\s*${scale * 100}%;`));
    }
    expect(TEXT_SCALES[DEFAULT_TEXT_SIZE]).toBe(1);
  });

  it("grows the text the window sizes with --text-scale, 1 by default", () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim()).toBe(
      "1",
    );
    const sized = rules.flatMap(({ body }) =>
      [...body.matchAll(/(?:^|[;\s])font-size:([^;]*vw[^;]*)/g)].map((m) => m[1]!.trim()),
    );
    expect(sized.length).toBeGreaterThan(0);
    for (const value of sized)
      for (const term of value.match(/[\d.]+vw(?: \* var\(--text-scale\))?/g)!)
        expect(term).toMatch(/\* var\(--text-scale\)$/);
  });
});

describe("palettes", () => {
  it("starts with Standard, light then dark, and gives every palette both", () => {
    expect(BLOCKS.slice(0, 2).map(({ palette, theme }) => `${palette} ${theme}`)).toEqual([
      "standard light",
      "standard dark",
    ]);
    const palettes = new Set(BLOCKS.map(({ palette }) => palette));
    expect(BLOCKS.map(({ palette, theme }) => `${palette} ${theme}`).sort()).toEqual(
      [...palettes].flatMap((palette) => [`${palette} dark`, `${palette} light`]).sort(),
    );
  });

  it("gives an element marked with a palette that palette's colors, in the page's theme, whatever the page's palette", () => {
    const root = document.documentElement;
    root.dataset.palette = "high-contrast";
    // Put in anew each time: the test DOM keeps an element's computed style once read.
    const shown = () => {
      document.body.innerHTML = PALETTE_IDS.map((id) => `<i data-palette="${id}"></i>`).join("");
      return [...document.querySelectorAll("i")].map((element) =>
        getComputedStyle(element).getPropertyValue("--bg").trim(),
      );
    };
    const background = (theme: string) =>
      PALETTE_IDS.map(
        (id) =>
          BLOCKS.find((block) => block.palette === id && block.theme === theme)!.roles["--bg"],
      );
    try {
      expect(shown()).toEqual(background("light"));
      root.dataset.theme = "dark";
      expect(shown()).toEqual(background("dark"));
    } finally {
      delete root.dataset.palette;
      delete root.dataset.theme;
    }
  });

  it("has blocks for each palette the app offers, and for no other", () => {
    expect([...new Set(BLOCKS.map(({ palette }) => palette))]).toEqual([...PALETTE_IDS]);
  });

  it.each(BLOCKS.map((block) => [block.selector, block] as const))(
    "sets every role in %s, each written as a palette's color",
    (_, block) => {
      expect(Object.keys(block.roles).sort()).toEqual(Object.keys(STANDARD.roles).sort());
      for (const [role, value] of Object.entries(block.roles)) {
        expect({ role, value, allowed: isPaletteValue(value) }).toEqual({
          role,
          value,
          allowed: true,
        });
        // A role it names is the block's own.
        for (const [, named] of value.matchAll(/var\((--[\w-]+)\)/g))
          expect(Object.keys(block.roles)).toContain(named);
      }
    },
  );

  it("knows the forms a palette's colors are written in, and no others", () => {
    for (const value of [
      "#16202a",
      "#16202a0f",
      "transparent",
      "var(--primary)",
      "color-mix(in srgb, var(--accent-yellow) 70%, var(--text))",
      "0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent)",
      "inset 0 1px 0 color-mix(in srgb, #ffffff 18%, transparent), 0 1px 2px #16202a",
    ])
      expect(isPaletteValue(value)).toBe(true);
    for (const value of [
      "#fff",
      "#16202a0",
      "white",
      "rgb(255 255 255 / 0.5)",
      "hsl(0 0% 100%)",
      "color-mix(in oklab, #ffffff, #000000)",
      "color-mix(in srgb, #ffffff 50%, rgb(0 0 0))",
      "url(#a)",
      "",
    ])
      expect(isPaletteValue(value)).toBe(false);
  });

  it("writes out no color of its own outside the palettes", () => {
    expect(literalColors(read("style.css"))).toEqual([]);
    expect(literalColors(".a { color: #abc; background: rgb(0 0 0 / 0.5) }")).toEqual([
      "#abc",
      "rgb(0 0 0 / 0.5)",
    ]);
    // A selector's #id is no color.
    expect(literalColors("#add { color: var(--text); }")).toEqual([]);
  });
});

/** Each palette block, by its selector, as the tests below take them. */
const EACH_BLOCK = BLOCKS.map((block) => [block.selector, block] as const);

/**
 * Each pair expectContrast measured of the roles a palette of one's own
 * paints, as `front back tint`, which its editor must measure too
 * (CHECKED_PAIRS).
 */
const MEASURED = new Set<string>();

/** A pair's key in MEASURED, when its colors are roles a palette of one's own paints. */
function paintedPair(text: string, surface: string): string | null {
  const front = /^var\((--[a-z0-9-]+)\)$/.exec(text)?.[1];
  const plain = /^var\((--[a-z0-9-]+)\)$/.exec(surface);
  const tint = /^color-mix\(in srgb, var\((--grade-\d)\) (\d+)%, var\(--surface\)\)$/.exec(surface);
  const back = plain?.[1] ?? tint?.[1];
  if (front === undefined || back === undefined) return null;
  // A chart's step is mixed from roles a palette of one's own paints, so its editor measures it too.
  const fronts: readonly string[] = [...PAINTED_ROLES, ...SERIES_ROLES];
  if (!fronts.includes(front) || !PAINTED_ROLES.includes(back)) return null;
  return `${front} ${back} ${tint?.[2] ?? ""}`;
}

/**
 * Expects `text` on `surface`, both palette colors in `block`, at `ratio`
 * or more: by default the ratio text needs in the block's palette.
 */
function expectContrast(
  block: PaletteBlock,
  text: string,
  surface: string,
  ratio = contrastTargets(block.palette).text,
) {
  const pair = paintedPair(text, surface);
  if (pair !== null) MEASURED.add(pair);
  const color = (value: string) => colorOf(value, block.roles);
  const under = color(surface);
  // A see-through surface is laid over the page's background.
  const opaque = under.a < 1 ? over(under, color("var(--bg)")) : under;
  expect({ text, surface, enough: contrast(color(text), opaque) >= ratio }).toEqual({
    text,
    surface,
    enough: true,
  });
}

describe("contrast", () => {
  const surfaces = ["--bg", "--surface", "--surface-sunken", "--surface-hover"];
  const role = (name: string) => `var(${name})`;

  it("computes WCAG's ratio, mixing as CSS does", () => {
    const roles = { "--white": "#ffffff", "--black": "#000000" };
    expect(contrast(colorOf("#ffffff", roles), colorOf("#000000", roles))).toBe(21);
    expect(colorOf("color-mix(in srgb, var(--white), var(--black))", roles)).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1,
    });
    expect(colorOf("color-mix(in srgb, #ffffff 30%, transparent)", roles)).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 0.3,
    });
    expect(colorOf("color-mix(in srgb, transparent 20%, #000000 30%)", roles).a).toBeCloseTo(0.3);
    expect(colorOf("#ffffff80", roles).a).toBe(128 / 255);
    expect(() => contrast(colorOf("#000000", roles), colorOf("transparent", roles))).toThrow();
    expect(() => colorOf("var(--none)", roles)).toThrow();
    expect(() => colorOf("color-mix(in oklab, #ffffff, #000000)", roles)).toThrow();
    expect(() => colorOf("white", roles)).toThrow();
    expect(() => paletteBlocks(".a { --bg: #ffffff; }")).toThrow();
    // A block is for the root and for an element marked with its palette, in that theme.
    expect(() => paletteBlocks(":root { --bg: #ffffff; }")).toThrow();
    expect(() =>
      paletteBlocks(':root[data-theme="dark"], [data-palette="standard"] { --bg: #ffffff; }'),
    ).toThrow();
    expect(
      paletteBlocks(
        ':root[data-palette="a"][data-theme="dark"], [data-theme="dark"] [data-palette="a"] { --bg: #ffffff; }',
      ),
    ).toEqual([
      {
        palette: "a",
        theme: "dark",
        selector: ':root[data-palette="a"][data-theme="dark"]',
        roles: { "--bg": "#ffffff" },
      },
    ]);
  });

  it("asks more of High contrast: text at 7:1, and fields' edges at 4.5:1", () => {
    expect(contrastTargets("standard")).toEqual({ text: 4.5, edge: 3 });
    expect(contrastTargets("high-contrast")).toEqual({ text: 7, edge: 4.5 });
  });

  it.each(EACH_BLOCK)("gives text fields an edge of the ratio they need in %s", (_, block) => {
    for (const surface of surfaces)
      expectContrast(
        block,
        "var(--control-border)",
        role(surface),
        contrastTargets(block.palette).edge,
      );
  });

  it.each(EACH_BLOCK)("keeps text and muted text at the ratio text needs in %s", (_, block) => {
    for (const text of ["--text", "--text-muted"])
      for (const surface of [...surfaces, "--primary-soft"])
        expectContrast(block, role(text), role(surface));
  });

  it.each(EACH_BLOCK)(
    "keeps muted text readable over the background's blue disc and the course card's yellow glow in %s",
    (_, block) => {
      expectContrast(block, "var(--text-muted)", "var(--paper-blue)");
      const glow = colorOf("var(--paper-yellow)", block.roles);
      const card = colorOf("var(--primary-soft)", block.roles);
      expect(
        contrast(colorOf("var(--text-muted)", block.roles), over(glow, card)),
      ).toBeGreaterThanOrEqual(contrastTargets(block.palette).text);
    },
  );

  it.each(EACH_BLOCK)(
    "keeps the text on a primary fill, a link, and danger and warning text at the ratio text needs in %s",
    (_, block) => {
      for (const fill of ["--primary-fill", "--primary-hover"])
        expectContrast(block, "var(--on-primary)", role(fill));
      for (const surface of [...surfaces, "--primary-soft", "--link-hover-bg"])
        expectContrast(block, "var(--link)", role(surface));
      for (const surface of [...surfaces, "--danger-soft"])
        expectContrast(block, "var(--danger)", role(surface));
      for (const surface of [...surfaces, "--warning-soft"])
        expectContrast(block, "var(--warning-text)", role(surface));
    },
  );

  it.each(EACH_BLOCK)("keeps the masthead's text at the ratio text needs in %s", (_, block) => {
    for (const surface of ["--masthead-bg", "--masthead-link-hover-bg"])
      expectContrast(block, "var(--masthead-text)", role(surface));
    // The session line, the masthead's text faded (style.css).
    expectContrast(
      block,
      "color-mix(in srgb, var(--masthead-text) 72%, transparent)",
      "var(--masthead-bg)",
    );
    for (const surface of ["--masthead-text", "--masthead-button-hover"])
      expectContrast(block, "var(--masthead-button-text)", role(surface));
  });

  // The tints and the hovered tint of style.css's .quality-buttons; the interval under a grade's name is muted.
  it.each(EACH_BLOCK)(
    "keeps an answer button's text at the ratio text needs on its grade's tint in %s",
    (_, block) => {
      for (let grade = 0; grade <= 5; grade++) {
        const tint = (percent: number) =>
          `color-mix(in srgb, var(--grade-${grade}) ${percent}%, var(--surface))`;
        expectContrast(block, "var(--text)", tint(12));
        expectContrast(block, "var(--text)", tint(24));
        expectContrast(block, "var(--text-muted)", tint(12));
        expectContrast(block, "var(--text-muted)", tint(24));
      }
    },
  );

  // WCAG 1.4.11: a chart's marks are held as an edge is, on the surfaces a chart and its empty days sit on (a section, a track).
  it.each(EACH_BLOCK)(
    "keeps every step of a chart at the ratio an edge needs in %s",
    (_, block) => {
      for (let step = 1; step <= 4; step++)
        for (const surface of ["--surface", "--surface-sunken"])
          expectContrast(
            block,
            `var(--series-${step})`,
            role(surface),
            contrastTargets(block.palette).edge,
          );
    },
  );

  // Last, once the tests above have measured their pairs.
  it("measures in a palette of one's own every pair it measures here of the roles that palette paints", () => {
    const checked = new Set(
      CHECKED_PAIRS.map(({ front, back, tint }) => `${front} ${back} ${tint ?? ""}`),
    );
    expect(paintedPair("var(--masthead-text)", "var(--masthead-bg)")).toBeNull();
    expect(MEASURED.size).toBeGreaterThan(0);
    expect([...MEASURED].filter((pair) => !checked.has(pair))).toEqual([]);
  });

  // The colors a palette of the user's own has where it sets none (domain/customPalette.ts).
  it.each(EACH_BLOCK)(
    "gives a palette of one's own based on it the colors of %s, opaque",
    (_, block) => {
      const colors = Object.fromEntries(
        PAINTED_ROLES.map((role) => {
          const color = colorOf(`var(${role})`, block.roles);
          expect({ role, opaque: color.a === 1 }).toEqual({ role, opaque: true });
          return [role, hexOf(color)];
        }),
      );
      expect(builtInColors(block.palette as never, block.theme)).toEqual(colors);
    },
  );

  it.each(EACH_BLOCK)(
    "mixes a chart's steps for a palette of one's own as %s mixes them",
    (_, block) => {
      const steps = Object.fromEntries(
        SERIES_ROLES.map((role) => [role, hexOf(colorOf(`var(${role})`, block.roles))]),
      );
      const settings = { basedOn: block.palette as never, light: {}, dark: {} };
      expect(seriesColors(settings, block.theme)).toEqual(steps);
    },
  );

  it("tells colors apart as each deficiency sees them, Machado's model in OKLab", () => {
    // Standard's grades 3 and 4: a yellow and a green, far apart to most, close to the red-blind.
    const yellow = colorOf("#d9b11c", {});
    const green = colorOf("#7fb13c", {});
    expect(difference(yellow, yellow)).toBe(0);
    expect(difference(colorOf("#000000", {}), colorOf("#ffffff", {}))).toBeCloseTo(1, 3);
    expect(difference(yellow, green)).toBeGreaterThan(0.1);
    expect(difference(yellow, green, "protanopia")).toBeLessThan(0.05);
    // Blue-blindness confuses blue and green, not these.
    expect(difference(yellow, green, "tritanopia")).toBeGreaterThan(0.1);
  });

  it.each(EACH_BLOCK.filter(([, block]) => block.palette === "color-vision"))(
    "keeps the answer buttons' neighboring grades apart to every color vision in %s",
    (_, block) => {
      for (let grade = 0; grade < 5; grade++) {
        const [one, two] = [grade, grade + 1].map((g) => colorOf(`var(--grade-${g})`, block.roles));
        for (const deficiency of [undefined, ...DEFICIENCIES]) {
          const apart = difference(one!, two!, deficiency);
          expect({ grade, deficiency, apart: apart >= 0.08 }).toEqual({
            grade,
            deficiency,
            apart: true,
          });
        }
      }
    },
  );

  it.each(["input", "textarea"])("edges a resting %s with the control border", (tag) => {
    document.body.innerHTML = `<${tag}></${tag}>`;
    expect(getComputedStyle(document.querySelector(tag)!).borderColor).toBe(
      STANDARD.roles["--control-border"],
    );
  });

  it("draws placeholders in muted text at full opacity", () => {
    const rule = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find(
        (r): r is CSSStyleRule =>
          r instanceof CSSStyleRule && r.selectorText.includes("::placeholder"),
      )!;
    expect(rule.style.getPropertyValue("color")).toBe("var(--text-muted)");
    expect(rule.style.getPropertyValue("opacity")).toBe("1");
  });
});

// The statistics' charts draw their marks in the roles the contrast tests above measure.
describe("charts", () => {
  const drawn = (html: string, property: string) => {
    document.body.innerHTML = html;
    return lastMatching(document.body.firstElementChild!, property);
  };

  it.each([
    [`<span class="calendar-day level-1"></span>`, "var(--series-1)"],
    [`<span class="calendar-day level-2"></span>`, "var(--series-2)"],
    [`<span class="calendar-day level-3"></span>`, "var(--series-3)"],
    [`<span class="calendar-day level-4"></span>`, "var(--series-4)"],
    [`<span class="grade-segment grade-hard"></span>`, "var(--series-1)"],
    [`<span class="grade-segment grade-good"></span>`, "var(--series-2)"],
    [`<span class="grade-segment grade-easy"></span>`, "var(--series-3)"],
    [`<span class="maturity-segment maturity-relearning"></span>`, "var(--series-1)"],
    [`<span class="maturity-segment maturity-young"></span>`, "var(--series-2)"],
    [`<span class="maturity-segment maturity-mature"></span>`, "var(--series-3)"],
  ])("fills %s with %s", (html, role) => {
    expect(drawn(html, "background")).toBe(role);
  });

  it("strokes the young cards' line in a step of the green", () => {
    document.body.innerHTML = `<svg class="line-chart"><path class="line-young"></path></svg>`;
    expect(lastMatching(document.querySelector(".line-young")!, "stroke")).toBe("var(--series-1)");
  });

  it("edges the empty steps, Again and new cards, as a field is", () => {
    for (const html of [
      `<span class="grade-segment grade-again"></span>`,
      `<span class="maturity-segment maturity-new"></span>`,
    ])
      expect(drawn(html, "box-shadow")).toBe("inset 0 0 0 1px var(--control-border)");
  });
});

/*
 * Target size (WCAG 2.5.8): a small control inside a row that is a link
 * all over gets a target of its own, above the link, so a near miss
 * does not leave the screen.
 */
describe("target size", () => {
  it("gives a library deck's checkbox a 44px target above the row's link", () => {
    document.body.innerHTML = `
      <ul class="library-list"><li>
        <label class="library-pick"><input type="checkbox"></label>
        <a class="library-deck-name" href="#/">x</a>
      </li></ul>`;
    const pick = getComputedStyle(document.querySelector(".library-pick")!);
    expect(parseFloat(pick.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(pick.minHeight)).toBeGreaterThanOrEqual(44);
    expect(pick.position).toBe("relative");
    expect(Number(pick.zIndex)).toBeGreaterThan(0);

    // The link's stretched area, laid over the row (the link itself is
    // not positioned) with no stacking of its own, so the target is above it.
    const link = document.querySelector(".library-deck-name")!;
    expect(lastMatching(link, "position")).toBeUndefined();
    const stretch = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find(
        (r): r is CSSStyleRule =>
          r instanceof CSSStyleRule && r.selectorText === ".library-list .library-deck-name::after",
      )!;
    expect(stretch.style.getPropertyValue("position")).toBe("absolute");
    expect(stretch.style.getPropertyValue("z-index")).toBe("");
  });

  it("gives a deck's menu button a 44px target above the row's link, last in the row", () => {
    document.body.innerHTML = `
      <ul class="deck-list"><li class="deck-row">
        <a class="deck-open" href="#/">x</a>
        <button class="icon row-menu">m</button>
      </li></ul>`;
    const menu = getComputedStyle(document.querySelector(".row-menu")!);
    expect(parseFloat(menu.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(menu.minHeight)).toBeGreaterThanOrEqual(44);
    expect(menu.position).toBe("relative");
    expect(Number(menu.zIndex)).toBeGreaterThan(0);
    expect(menu.gridColumn).toBe("3");
  });

  it("makes a course question's whole option its radio's target, 44px tall", () => {
    document.body.innerHTML = `
      <div class="choices"><label class="choice"><input type="radio"><span class="choice-text">x</span></label></div>`;
    const option = getComputedStyle(document.querySelector(".choice")!);
    expect(parseFloat(option.minHeight)).toBeGreaterThanOrEqual(44);
    expect(option.display).toBe("flex");
    expect(option.cursor).toBe("pointer");
  });

  it("gives a group's menu button a 44px target, right-aligned", () => {
    document.body.innerHTML = `<div class="deck-group-header"><button class="icon row-menu">x</button></div>`;
    const button = getComputedStyle(document.querySelector("button")!);
    expect(parseFloat(button.minWidth)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(button.minHeight)).toBeGreaterThanOrEqual(44);
    expect(button.marginInlineStart).toBe("auto");
  });

  it("lays a row's menu over the page, within the viewport, its items 44px tall and not to select", () => {
    document.body.innerHTML = `
      <div class="actions-menu" role="menu">
        <a role="menuitem" href="#/">p</a>
        <button role="menuitem">r</button>
        <button role="menuitem" class="danger">d</button>
      </div>`;
    const menu = getComputedStyle(document.querySelector(".actions-menu")!);
    expect(menu.position).toBe("fixed");
    expect(Number(menu.zIndex)).toBeGreaterThan(1);
    // Its size is capped by the script, by the viewport as shown (ActionsMenu.tsx).
    expect(menu.overflowY).toBe("auto");
    expect(menu.backgroundColor).toBe("#ffffff");
    for (const item of document.querySelectorAll("[role=menuitem]")) {
      const style = getComputedStyle(item);
      expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(style.userSelect).toBe("none");
    }
    expect(getComputedStyle(document.querySelector(".danger")!).color).toBe("#c42d18");
  });

  it("gives a group's fold button a 44px target", () => {
    document.body.innerHTML = `<div class="deck-group-header"><button class="group-toggle">x</button></div>`;
    expect(
      parseFloat(getComputedStyle(document.querySelector("button")!).minHeight),
    ).toBeGreaterThanOrEqual(44);
  });
});

describe("dragging the deck list", () => {
  it("keeps the dragged copy and the drop line out of the pointer's way, the copy above all", () => {
    document.body.innerHTML = `<div class="deck-tree"><div class="drop-line"></div></div><div class="drag-ghost"></div>`;
    const ghost = getComputedStyle(document.querySelector(".drag-ghost")!);
    expect(ghost.position).toBe("fixed");
    expect(ghost.pointerEvents).toBe("none");
    expect(Number(ghost.zIndex)).toBeGreaterThanOrEqual(100);
    expect(getComputedStyle(document.querySelector(".drop-line")!).pointerEvents).toBe("none");
    expect(getComputedStyle(document.querySelector(".deck-tree")!).position).toBe("relative");
  });

  it("indents the drop line as the lists are, level by level", () => {
    document.body.innerHTML = `<div class="drop-line"></div>`;
    // Compared with its spaces collapsed: Biome may break a long value over lines.
    expect(
      lastMatching(document.querySelector(".drop-line")!, "inset-inline")?.replace(/\s+/g, " "),
    ).toBe(
      "calc(min(var(--line-depth, 0), 4) * 1.25rem + var(--line-depth, 0) * (0.5rem + 2px)) 0",
    );
  });

  // The contrast tests hold the text on a primary fill to the ratio text needs, not the text on the primary color.
  it("draws the group's name on the drop line on a primary fill", () => {
    const label = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule && rule.selectorText === ".drop-line[data-label]::after",
      )!;
    expect(label.style.getPropertyValue("background")).toBe("var(--primary-fill)");
    expect(label.style.getPropertyValue("color")).toBe("var(--on-primary)");
  });

  it("gives the focus proxy a 16px font, so focusing it does not zoom a phone's page", () => {
    document.body.innerHTML = `<input class="focus-proxy">`;
    expect(getComputedStyle(document.querySelector("input")!).fontSize).toBe("16px");
  });

  it.each([
    [
      "a group's",
      `<div class="deck-group-header"><form class="name-form"><input></form></div>`,
      ".deck-group-header",
    ],
    [
      "a deck's",
      `<ul class="deck-list"><li class="deck-row"><form class="name-form"><input></form></li></ul>`,
      ".deck-row",
    ],
  ])("lets %s name be typed into, though its row cannot be selected", (_, html, selector) => {
    document.body.innerHTML = html;
    expect(lastMatching(document.querySelector(selector)!, "user-select")).toBe("none");
    expect(lastMatching(document.querySelector("input")!, "user-select")).toBe("text");
  });

  it("puts a deck's name field where its name was", () => {
    document.body.innerHTML = `<ul class="deck-list"><li class="deck-row"><form class="name-form"><input></form></li></ul>`;
    const form = getComputedStyle(document.querySelector("form")!);
    expect([form.gridColumn, form.gridRow]).toEqual(["1", "1"]);
  });

  it("keeps the new-group highlight of a row in a group inside the group's clip", () => {
    document.body.innerHTML = `<div class="drop-combine"></div><div class="deck-group-clip"><div class="drop-combine"></div></div>`;
    const [top, nested] = document.querySelectorAll(".drop-combine");
    expect(lastMatching(top!, "scale")).toBe("1.02");
    expect(lastMatching(top!, "outline-offset")).toBe("2px");
    expect(lastMatching(nested!, "scale")).toBe("none");
    expect(lastMatching(nested!, "outline-offset")).toBe("0");
  });

  it("makes room at an open group's end while a row is lifted, none when folded shut", () => {
    const html = (collapsed: string) =>
      `<div class="deck-tree" data-dragging><div class="deck-group-body" ${collapsed}><div class="deck-group-clip"></div></div></div>`;
    document.body.innerHTML = html("");
    expect(lastMatching(document.querySelector(".deck-group-clip")!, "padding-bottom")).toBe(
      "calc(0.25rem + 20px)",
    );
    document.body.innerHTML = html("data-collapsed");
    expect(lastMatching(document.querySelector(".deck-group-clip")!, "padding-bottom")).toBe(
      "0.25rem",
    );
  });
});

describe("moving the deck list's rows", () => {
  it("brings in a header or an empty group's note an edit adds", () => {
    document.body.innerHTML = `<div class="deck-tree" data-arranged><ul class="deck-list"><li class="deck-group">
      <div class="deck-group-header row-enter"></div><p class="deck-group-empty row-enter"></p></li></ul></div>`;
    for (const element of document.querySelectorAll(".row-enter")) {
      expect(lastMatching(element, "animation")).toMatch(/^bounce-in /);
    }
  });

  it("folds a deleted group's header away, keeps it folded till the group goes, and out of the pointer's way", () => {
    document.body.innerHTML = `<ul class="deck-list"><li class="deck-group leaving"><div class="deck-group-header"></div></li></ul>`;
    expect(lastMatching(document.querySelector(".deck-group-header")!, "animation")).toMatch(
      /^group-leave .* forwards$/,
    );
    expect(getComputedStyle(document.querySelector("li")!).pointerEvents).toBe("none");
  });
});

describe("Markdown from data", () => {
  it("scrolls a code block sideways, its white space as written, in the mono stack on the sunken surface", () => {
    document.body.innerHTML = `<div class="md"><div class="md-code"><pre class="md-region" tabindex="0"><code>x</code></pre></div></div>`;
    const pre = document.querySelector("pre")!;
    expect(lastMatching(pre, "white-space")).toBe("pre");
    expect(lastMatching(pre, "overflow-x")).toBe("auto");
    expect(lastMatching(pre, "background")).toBe("var(--surface-sunken)");
    expect(lastMatching(document.querySelector("code")!, "font-family")).toBe("var(--font-mono)");
    document.body.innerHTML = `<p><code class="md-inline-code">x</code></p><details class="error-detail"><code>y</code></details>`;
    const [span, detail] = document.querySelectorAll("code");
    expect(lastMatching(span!, "font-family")).toBe("var(--font-mono)");
    expect(lastMatching(span!, "background")).toBe("var(--surface-sunken)");
    expect(lastMatching(detail!, "font-family")).toBeUndefined();
  });

  it("scrolls a table sideways in its region, the table itself no longer clipped", () => {
    document.body.innerHTML = `<div class="md"><div class="md-table md-region" tabindex="0"><table><tr><th class="md-align-right">x</th></tr></table></div></div>`;
    expect(lastMatching(document.querySelector(".md-table")!, "overflow-x")).toBe("auto");
    expect(lastMatching(document.querySelector("table")!, "overflow")).toBe("visible");
    expect(lastMatching(document.querySelector("th")!, "text-align")).toBe("right");
    expect(lastMatching(document.querySelector("th")!, "text-transform")).toBe("none");
  });

  it("rings a code block or table region taking the focus", () => {
    const style = focused(
      `<div class="md"><pre class="md-region" tabindex="0"><code>x</code></pre></div>`,
      "pre",
    );
    expect(style.outlineStyle).toBe("solid");
  });

  it("sizes a face's own paragraph as the face, and Markdown blocks in it at a reading size", () => {
    document.body.innerHTML = `<div class="card-face card-front card-question"><p>big</p><div class="md"><p>read</p></div></div>`;
    const [own, inBlocks] = document.querySelectorAll("p");
    expect(lastMatching(own!, "font-weight")).toBe("700");
    expect(lastMatching(inBlocks!, "font-weight")).toBeUndefined();
    expect(lastMatching(document.querySelector(".md")!, "font-size")).toBe("1.15rem");
    expect(lastMatching(document.querySelector(".md")!, "text-align")).toBe("start");
  });

  it("keeps a note's blocks as quiet as its paragraph, aligned where its lines start", () => {
    document.body.innerHTML = `<div class="card-face card-back"><p class="card-note">one</p><div class="md card-note"><ul><li>two</li></ul></div></div>`;
    const [paragraph, blocks] = document.querySelectorAll(".card-note");
    expect(lastMatching(paragraph!, "text-align")).toBe("center");
    expect(lastMatching(blocks!, "text-align")).toBe("start");
    expect(lastMatching(blocks!, "font-size")).toBe("0.95rem");
  });

  it("leaves Markdown outside a card's face at the size of the place it is in", () => {
    document.body.innerHTML = `<div class="course-why"><div class="md"><p>why</p></div></div>`;
    expect(lastMatching(document.querySelector(".md")!, "font-size")).toBeUndefined();
  });

  it("spans a chapter's description in blocks across its card, as a paragraph does", () => {
    document.body.innerHTML = `<li class="course-chapter"><h3>One</h3><span class="course-state">Done</span><div class="md"><ul><li>a</li></ul></div></li>`;
    const blocks = document.querySelector(".md")!;
    expect(lastMatching(blocks, "grid-column")).toBe("1 / -1");
    expect(lastMatching(blocks, "font-size")).toBeUndefined();
  });
});

/*
 * The course for newcomers moves only as it comes in (WCAG 2.2.2), and
 * not at all with motion reduced: each part's own style is where its
 * animation ends, so taking the animations away leaves it at rest.
 */
describe("the course for newcomers", () => {
  /** The rules, at the top level or in the media query `condition`, whose selector is `selector` (spaced as one line). */
  function rules(selector: string, condition?: string): CSSStyleRule[] {
    return [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .flatMap((rule) =>
        condition === undefined
          ? [rule]
          : rule instanceof CSSMediaRule && rule.conditionText === condition
            ? [...rule.cssRules]
            : [],
      )
      .filter(
        (rule): rule is CSSStyleRule =>
          rule instanceof CSSStyleRule && rule.selectorText.replace(/\s+/g, " ") === selector,
      );
  }

  it("sweeps its glint across twice and no more, off the card when it rests", () => {
    const [glint] = rules(".newcomer-course::after");
    expect(glint!.style.getPropertyValue("animation")).toMatch(/^newcomer-shine .* 2$/);
    expect(glint!.style.getPropertyValue("transform")).toBe("translateX(-150%)");
    expect(glint!.style.getPropertyValue("pointer-events")).toBe("none");
    document.body.innerHTML = `<aside class="newcomer-course"></aside>`;
    expect(getComputedStyle(document.querySelector("aside")!).overflow).toBe("hidden");
  });

  it("rests with its fan open", () => {
    document.body.innerHTML = `<aside class="newcomer-course"><span class="newcomer-course-fan"><span></span><span></span><span></span></span></aside>`;
    for (const card of document.querySelectorAll(".newcomer-course-fan>span")) {
      expect(lastMatching(card, "transform")).toBe("rotate(var(--fan))");
    }
  });

  it("is still with motion reduced: no animation or transition, its glint included", () => {
    const [still] = rules("*, *::before, *::after", "(prefers-reduced-motion: reduce)");
    expect(still!.style.getPropertyValue("animation")).toBe("none");
    expect(still!.style.getPropertyPriority("animation")).toBe("important");
    expect(still!.style.getPropertyValue("transition")).toBe("none");
    expect(still!.style.getPropertyPriority("transition")).toBe("important");
  });

  it("leaves out the fan on a narrow screen", () => {
    const [narrow] = rules(".newcomer-course-fan", "(max-width: 26rem)");
    expect(narrow!.style.getPropertyValue("display")).toBe("none");
  });
});

/*
 * Korean (lang="ko", on the page or on a card's text): Korean fonts, lines
 * broken between words, display text bold and nothing tracked apart.
 */
describe("Korean", () => {
  /** Puts `html` in the page and returns the computed style of `selector`. */
  function styled(html: string, selector: string): CSSStyleDeclaration {
    document.body.innerHTML = html;
    return getComputedStyle(document.querySelector(selector)!);
  }

  /** Where `font` comes in `family`, a font stack. */
  const place = (family: string, font: string) => family.indexOf(font);

  it("puts the Korean fonts after Fredoka and before the Japanese ones, and breaks between words", () => {
    const style = styled(`<p lang="ko">사람</p>`, "p");
    expect(style.fontFamily).toMatch(/^"Fredoka Variable", "Apple SD Gothic Neo"/);
    expect(place(style.fontFamily, "Noto Sans CJK KR")).toBeLessThan(
      place(style.fontFamily, "Noto Sans CJK JP"),
    );
    expect(style.wordBreak).toBe("keep-all");
    expect(styled(`<p>x</p>`, "p").wordBreak).not.toBe("keep-all");
  });

  it("still breaks a Korean word too long for its card", () => {
    expect(styled(`<div class="card-face"><p lang="ko">사람</p></div>`, "p").overflowWrap).toBe(
      "anywhere",
    );
  });

  it.each([
    ["a Korean heading", `<h1 lang="ko">사람</h1>`, "h1"],
    ["Korean text in a heading", `<h2><span lang="ko">사람</span></h2>`, "span"],
    [
      "the newcomer card's title",
      `<div class="newcomer-course-body"><p class="newcomer-course-title" lang="ko">사람</p></div>`,
      "p",
    ],
  ])("draws %s in Bangers, then a Korean font, bold and untracked", (_, html, selector) => {
    const style = styled(html, selector);
    expect(style.fontFamily).toMatch(/^"?Bangers"?, "Fredoka Variable", "Apple SD Gothic Neo"/);
    expect(style.fontWeight).toBe("700");
    expect(style.letterSpacing).toBe("0px");
  });

  it.each([
    ["a code span", `<p lang="ko"><code class="md-inline-code">x</code></p>`],
    [
      "the Markdown help's samples",
      `<div class="markdown-help"><pre><code lang="ko">**굵게**</code></pre></div>`,
    ],
    ["code no rule of ours styles", `<p><code lang="ko">x</code></p>`],
  ])("keeps %s in a monospace font", (_, html) => {
    expect(styled(html, "code").fontFamily).toMatch(/^ui-monospace/);
  });

  it.each([
    ["a fact's label", `<dl class="facts"><dt lang="ko">사람</dt></dl>`, "dt"],
    ["the account's label", `<dl class="account"><dt lang="ko">사람</dt></dl>`, "dt"],
    ["a legend", `<fieldset><legend lang="ko">사람</legend></fieldset>`, "legend"],
    ["a table header", `<table><tr><th lang="ko">사람</th></tr></table>`, "th"],
    [
      "Korean text in a table header",
      `<table><tr><th><span lang="ko">사람</span></th></tr></table>`,
      "span",
    ],
    [
      "the newcomer card's eyebrow",
      `<div class="newcomer-course-body"><p class="newcomer-course-eyebrow" lang="ko">사람</p></div>`,
      "p",
    ],
  ])("does not track %s apart", (_, html, selector) => {
    expect(styled(html, selector).letterSpacing).toBe("0px");
  });

  it("keeps the tracking and the display weight in other languages", () => {
    expect(styled(`<table><tr><th>x</th></tr></table>`, "th").letterSpacing).not.toBe("0px");
    const heading = styled(`<h1>x</h1>`, "h1");
    expect(heading.letterSpacing).not.toBe("0px");
    expect(heading.fontWeight).toBe("400");
  });
});

describe("a course's celebrations", () => {
  it("throws confetti over the viewport, clipped to it and out of the pointer's way, gone when it rests", () => {
    document.body.innerHTML = `<div class="confetti" aria-hidden="true">
      <div class="confetti-shooter"><span></span><span></span></div></div>`;
    const confetti = getComputedStyle(document.querySelector(".confetti")!);
    expect(confetti.position).toBe("fixed");
    expect(confetti.overflow).toBe("hidden");
    expect(confetti.pointerEvents).toBe("none");
    const shooter = getComputedStyle(document.querySelector(".confetti-shooter")!);
    expect(shooter.position).toBe("absolute");
    expect(shooter.bottom).toBe("0px");
    for (const piece of document.querySelectorAll(".confetti-shooter>span")) {
      // With motion reduced, every animation stops: a piece at rest shows nothing,
      // and it shows nothing either while it waits for its shooter to pop.
      expect(getComputedStyle(piece).opacity).toBe("0");
      // Its flight and its flutter run as two animations, so a sway never stops its fall.
      expect(lastMatching(piece, "animation")?.replace(/\s+/g, " ")).toBe(
        "confetti-shoot var(--time) calc(var(--delay) + var(--jitter)), confetti-flutter var(--time) linear calc(var(--delay) + var(--jitter))",
      );
    }
  });

  it("bursts sparkles from a chapter just completed, out of the pointer's way, gone when they rest", () => {
    document.body.innerHTML = `<ol class="course-chapters"><li class="course-chapter done just-completed">
      <span class="course-state done">Done<span class="course-sparkles" aria-hidden="true"><span></span></span></span></li></ol>`;
    expect(getComputedStyle(document.querySelector(".course-state")!).position).toBe("relative");
    const sparkles = getComputedStyle(document.querySelector(".course-sparkles")!);
    expect(sparkles.position).toBe("absolute");
    expect(sparkles.pointerEvents).toBe("none");
    expect(getComputedStyle(document.querySelector(".course-sparkles>span")!).opacity).toBe("0");
  });
});

describe("what's new", () => {
  it("bursts sparkles from within the card, out of the pointer's way, gone when they rest", () => {
    document.body.innerHTML = `<aside class="whats-new"><span class="whats-new-sparkles" aria-hidden="true"><span></span></span></aside>`;
    expect(getComputedStyle(document.querySelector(".whats-new")!).position).toBe("relative");
    const sparkles = getComputedStyle(document.querySelector(".whats-new-sparkles")!);
    expect(sparkles.position).toBe("absolute");
    expect(sparkles.pointerEvents).toBe("none");
    expect(getComputedStyle(document.querySelector(".whats-new-sparkles>span")!).opacity).toBe("0");
  });
});

describe("German", () => {
  it("hyphenates German words at line ends, and no other language's", () => {
    document.body.innerHTML = `<p lang="de">Lernfortschritt</p><p lang="en">x</p>`;
    const [german, english] = document.querySelectorAll("p");
    expect(getComputedStyle(german).hyphens).toBe("auto");
    expect(getComputedStyle(english).hyphens).not.toBe("auto");
  });
});

describe("text written right to left", () => {
  /** Puts `html` in the page and returns the computed style of `selector`. */
  function styled(html: string, selector: string): CSSStyleDeclaration {
    document.body.innerHTML = html;
    return getComputedStyle(document.querySelector(selector)!);
  }

  it.each(["ar", "fa", "ur", "he", "ar-eg"])(
    "runs %s right to left, isolated from the text around it",
    (tag) => {
      const style = styled(`<p>x <span lang="${tag}">x</span></p>`, "span");
      expect(style.direction).toBe("rtl");
      expect(style.unicodeBidi).toBe("isolate");
    },
  );

  it("keeps the page and other languages left to right", () => {
    const style = styled(`<p lang="en">x</p>`, "p");
    expect(style.direction).not.toBe("rtl");
    expect(style.unicodeBidi).not.toBe("isolate");
  });

  it.each([
    ["Markdown blocks", `<div class="md" lang="ar"><p>x</p></div>`, ".md"],
    [
      "a note's blocks",
      `<div class="card-face"><div class="card-note md" lang="ar">x</div></div>`,
      ".md",
    ],
    ["a table cell", `<table><tr><td lang="ar">x</td></tr></table>`, "td"],
    [
      "a course's question",
      `<div class="course-question"><div class="card-question"><p lang="ar">x</p></div></div>`,
      "p",
    ],
    [
      "a course's right answer",
      `<div class="course-right-answer"><div class="card-answer"><p lang="ar">x</p></div></div>`,
      "p",
    ],
  ])("starts %s where their lines start, not at the left", (_, html, selector) => {
    expect(styled(html, selector).textAlign).toBe("start");
  });
});

describe("Arabic", () => {
  /** Puts `html` in the page and returns the computed style of `selector`. */
  function styled(html: string, selector: string): CSSStyleDeclaration {
    document.body.innerHTML = html;
    return getComputedStyle(document.querySelector(selector)!);
  }

  it("puts Noto Naskh Arabic after Fredoka, before the systems' Arabic fonts", () => {
    expect(styled(`<p lang="ar">x</p>`, "p").fontFamily).toMatch(
      /^"Fredoka Variable", "Noto Naskh Arabic Variable", "Geeza Pro"/,
    );
    expect(styled(`<p lang="fa">x</p>`, "p").fontFamily).not.toMatch(/Naskh/);
  });

  it.each([
    ["an Arabic heading", `<h1 lang="ar">x</h1>`, "h1"],
    ["Arabic text in a heading", `<h2><span lang="ar">x</span></h2>`, "span"],
  ])("draws %s in Bangers, then the Arabic font, bold and untracked", (_, html, selector) => {
    const style = styled(html, selector);
    expect(style.fontFamily).toMatch(
      /^"?Bangers"?, "Fredoka Variable", "Noto Naskh Arabic Variable"/,
    );
    expect(style.fontWeight).toBe("700");
    expect(style.letterSpacing).toBe("0px");
  });

  it.each([
    ["the card's question", `<div class="card-question"><p lang="ar">x</p></div>`, "p"],
    [
      "Arabic text in the card's question",
      `<div class="card-question"><p><span lang="ar">x</span></p></div>`,
      "span",
    ],
    ["a table header", `<table><tr><th lang="ar">x</th></tr></table>`, "th"],
    ["a legend", `<fieldset><legend lang="ar">x</legend></fieldset>`, "legend"],
  ])("does not track %s apart", (_, html, selector) => {
    expect(styled(html, selector).letterSpacing).toBe("0px");
  });

  it("keeps code in a monospace font", () => {
    expect(styled(`<p><code lang="ar">x</code></p>`, "code").fontFamily).toMatch(/^ui-monospace/);
  });

  it("still tightens the card's question in other languages", () => {
    expect(styled(`<div class="card-question"><p>x</p></div>`, "p").letterSpacing).not.toBe("0px");
  });
});
