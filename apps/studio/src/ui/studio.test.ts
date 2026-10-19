// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/*
 * The Studio's stylesheet over the site's, as the page has them once
 * the Studio's chunk is in (style.css first, then studio.css), checked
 * through the cascade: it holds under data-surface="studio" alone, so
 * Solid Memo's screens look as they did. The font imports are left out:
 * the test DOM has no packages to fetch.
 */
beforeAll(() => {
  const site = createRequire(import.meta.url).resolve("@solid-memo/ui/style.css");
  for (const path of [site, join(import.meta.dirname, "studio.css")]) {
    const style = document.createElement("style");
    // On one line each, a selector or a value broken over lines: happy-dom
    // drops a rule whose selector list breaks inside `:not(…)`.
    style.textContent = readFileSync(path, "utf8")
      .replace(/^@import .*$/gm, "")
      .replace(/\n\s*/g, " ");
    document.head.append(style);
  }
});

const root = document.documentElement;

/** The test DOM's window this wide, as its own (happy-dom's) way has it: the cascade's @media reads it. */
const viewport = (width: number) =>
  (
    window as unknown as { happyDOM: { setViewport: (size: { width: number }) => void } }
  ).happyDOM.setViewport({ width });

afterEach(() => {
  document.body.innerHTML = "";
  root.removeAttribute("data-surface");
  root.removeAttribute("data-density");
  root.removeAttribute("data-aside");
});

/** Puts `html` in the page, and the computed style of the element `selector` names. */
function styleOf(html: string, selector: string): CSSStyleDeclaration {
  document.body.innerHTML = html;
  return getComputedStyle(document.querySelector(selector)!);
}

const PAGE = `
  <div id="app">
    <header class="site-header"><p class="header-link"><a href="#/">Back</a></p></header>
    <main class="workspace">
      <h2>Decks</h2>
      <section><button>Save</button><input type="text"><input type="checkbox"></section>
      <table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Kanji</td></tr></tbody></table>
    </main>
  </div>`;

describe("the Studio's stylesheet", () => {
  it("leaves Solid Memo's screens as they are", () => {
    expect(styleOf(PAGE, "main").maxWidth).toBe("736px");
    expect(styleOf(PAGE, "header.site-header").maxWidth).toBe("736px");
    expect(styleOf(PAGE, "h2").transform).toBe("rotate(-2deg)");
    expect(styleOf(PAGE, "h2").fontWeight).toBe("400");
    expect(styleOf(PAGE, "section").boxShadow).not.toBe("none");
    expect(styleOf(PAGE, "button").minHeight).toBe("40px");
    expect(styleOf(PAGE, "thead th").position).not.toBe("sticky");
  });

  it("gives the graph's pointer to its nodes, hollow ones whole, never to its edges", () => {
    root.setAttribute("data-surface", "studio");
    const plot = (inner: string) => `<svg class="graph-plot">${inner}</svg>`;
    expect(
      styleOf(plot('<g class="graph-focus"><path class="graph-edges"/></g>'), "path").pointerEvents,
    ).toBe("none");
    expect(
      styleOf(plot('<rect class="graph-node kind-document absent"/>'), "rect").pointerEvents,
    ).toBe("visible");
    expect(styleOf(plot('<circle class="graph-node kind-missing"/>'), "circle").pointerEvents).toBe(
      "visible",
    );
  });

  // The test DOM knows no dvh, so not the grid's height.
  it("lays the Studio out as a grid the window's width, its main content scrolling on its own", () => {
    root.setAttribute("data-surface", "studio");
    expect(styleOf(PAGE, "#app").display).toBe("grid");
    expect(styleOf(PAGE, "main").maxWidth).toBe("none");
    expect(styleOf(PAGE, "main").overflow).toBe("auto");
    expect(styleOf(PAGE, "header.site-header").maxWidth).toBe("none");
  });

  it("gives the Studio calm headings and flat sections, and keeps a table's header row in sight", () => {
    root.setAttribute("data-surface", "studio");
    expect(styleOf(PAGE, "h2").transform).toBe("none");
    expect(styleOf(PAGE, "h2").fontWeight).toBe("600");
    expect(styleOf(PAGE, "h2").textShadow).toBe("none");
    expect(styleOf(PAGE, "h2").animation).toContain("none");
    expect(styleOf(PAGE, "section").boxShadow).toBe("none");
    expect(styleOf(PAGE, "thead th").position).toBe("sticky");
    expect(styleOf(PAGE, "table").borderCollapse).toBe("collapse");
  });

  it("packs the Studio's controls compactly, unless it is comfortable", () => {
    root.setAttribute("data-surface", "studio");
    expect(styleOf(PAGE, "button").minHeight).toBe("28px");
    expect(styleOf(PAGE, "input[type=text]").minHeight).toBe("28px");
    expect(styleOf(PAGE, "td").height).toBe("28px");
    // A checkbox keeps its own size.
    expect(styleOf(PAGE, "input[type=checkbox]").minHeight).toBe("0");
    root.setAttribute("data-density", "comfortable");
    expect(styleOf(PAGE, "button").minHeight).toBe("44px");
    expect(styleOf(PAGE, "td").height).toBe("44px");
  });

  it("makes the panes that scroll on their own the containing block of what is placed absolutely in them, so that never widens or lengthens the page", () => {
    root.setAttribute("data-surface", "studio");
    const page = `
      <div id="app">
        <nav class="studio-sidebar"></nav>
        <main class="workspace"><span class="visually-hidden">Open</span><div class="error"></div></main>
      </div>`;
    expect(styleOf(page, "main").position).toBe("relative");
    expect(styleOf(page, ".studio-sidebar").position).toBe("relative");
    // As a drawer, on a narrow screen, the sidebar stays fixed over the page.
    viewport(600);
    expect(styleOf(page, ".studio-sidebar").position).toBe("fixed");
    expect(styleOf(page, "main").position).toBe("relative");
    viewport(1024);
  });

  it("puts the sidebar beside the main content, scrolling on its own, the item shown marked, and hides it as asked", () => {
    root.setAttribute("data-surface", "studio");
    const page = (hidden: string) => `
      <div id="app">
        <header class="site-header"></header>
        <nav class="studio-sidebar"${hidden}><ul><li><a href="#" aria-current="page">Decks</a></li><li><a href="#">Groups</a></li></ul></nav>
        <main class="workspace"></main>
      </div>`;
    expect(styleOf(page(""), ".studio-sidebar").overflow).toBe("auto");
    expect(styleOf(page(""), ".studio-sidebar").width).toBe("240px");
    expect(styleOf(page(""), ".studio-sidebar ul").listStyle).toContain("none");
    expect(styleOf(page(""), "a[aria-current]").fontWeight).toBe("600");
    expect(styleOf(page(""), "a:not([aria-current])").fontWeight).not.toBe("600");
    expect(styleOf(page(" hidden"), ".studio-sidebar").display).toBe("none");
  });

  it("gives the aside a column of its own while it is beside the main content, its content and the dock's scrolling on their own", () => {
    root.setAttribute("data-surface", "studio");
    const page = (hidden: string) => `
      <div id="app">
        <main class="workspace"></main>
        <aside class="studio-aside"${hidden}><div class="studio-aside-content"></div></aside>
        <section class="studio-dock"><div class="studio-dock-panel"></div></section>
      </div>`;
    expect(styleOf(page(""), "#app").gridTemplateAreas).not.toContain("aside");
    root.setAttribute("data-aside", "");
    expect(styleOf(page(""), "#app").gridTemplateAreas).toContain('"sidebar main main aside"');
    root.removeAttribute("data-aside");
    expect(styleOf(page(""), ".studio-aside-content").overflow).toBe("auto");
    expect(styleOf(page(""), ".studio-dock-panel").overflow).toBe("auto");
    // The dock is a pane of the page, not a card on it.
    expect(styleOf(page(""), ".studio-dock").boxShadow).toBe("none");
    expect(styleOf(page(" hidden"), ".studio-aside").display).toBe("none");
  });

  it("draws a cell edited in place as its text, and a sidebar's pin faint unless the item is pinned", () => {
    root.setAttribute("data-surface", "studio");
    const page = `
      <main class="workspace">
        <table class="studio-data-table"><tbody><tr><td><span class="studio-cell"><button class="studio-cell-edit">20</button></span></td></tr></tbody></table>
      </main>
      <nav class="studio-sidebar"><ul><li><a href="#">Kanji</a><button class="studio-pin" aria-pressed="false"></button></li></ul></nav>
      <nav class="studio-sidebar"><ul><li><a href="#">Verbs</a><button class="studio-pin pinned" aria-pressed="true"></button></li></ul></nav>`;
    expect(styleOf(page, ".studio-cell-edit").minHeight).toBe("0");
    expect(styleOf(page, ".studio-cell-edit").backgroundImage).toBe("none");
    expect(styleOf(page, ".studio-cell-edit").cursor).toBe("text");
    expect(styleOf(page, ".studio-pin").opacity).toBe("0.35");
    expect(styleOf(page, ".studio-pin.pinned").opacity).toBe("1");
  });

  it("keeps a data table's first column in sight, and marks its cursor's row, the rows selected and the row shown beside it", () => {
    root.setAttribute("data-surface", "studio");
    const page = `
      <main class="workspace">
        <table class="studio-list studio-data-table selectable">
          <thead><tr><th>Select</th><th>Front</th><th>Back</th></tr></thead>
          <tbody>
            <tr class="cursor"><td><input type="checkbox"></td><th>water</th><td>mizu</td></tr>
            <tr class="selected"><td><input type="checkbox"></td><th>fire</th><td>hi</td></tr>
            <tr aria-current="true"><td><input type="checkbox"></td><th>tree</th><td>ki</td></tr>
          </tbody>
        </table>
      </main>`;
    expect(styleOf(page, "tbody tr.cursor > td").position).toBe("sticky");
    expect(styleOf(page, "tbody tr.cursor > th").position).toBe("sticky");
    expect(styleOf(page, "tbody tr.cursor > th").left).toBe("32px");
    expect(styleOf(page, "tbody tr.cursor > td:last-child").position).not.toBe("sticky");
    expect(styleOf(page, "thead th:first-child").zIndex).toBe("2");
    expect(styleOf(page, "tbody tr.cursor > td:first-child").boxShadow).toContain("inset");
    expect(styleOf(page, "tbody tr.selected > td:first-child").boxShadow).not.toContain("inset");
    expect(styleOf(page, "tbody tr.selected > td:last-child").backgroundColor).toBe(
      styleOf(page, "tbody tr[aria-current] > td:last-child").backgroundColor,
    );
    expect(styleOf(page, "tbody tr.selected > td:last-child").backgroundColor).not.toBe(
      styleOf(page, "tbody tr.cursor > td:last-child").backgroundColor,
    );
    expect(styleOf(page, "tbody tr[aria-current] > td:first-child").boxShadow).toContain("inset");
    // The row's name, though it stays in sight on a color of its own, takes the row's.
    expect(styleOf(page, "tbody tr.cursor > th").backgroundColor).toBe(
      styleOf(page, "tbody tr.cursor > td:last-child").backgroundColor,
    );
    expect(styleOf(page, "tbody tr.selected > th").backgroundColor).toBe(
      styleOf(page, "tbody tr.selected > td:last-child").backgroundColor,
    );
  });

  // Read from the file: the test DOM computes no scroll-padding.
  it("scrolls what has the focus clear of the parts of a table that stick, by the room the table gives", () => {
    const css = readFileSync(join(import.meta.dirname, "studio.css"), "utf8");
    const rule = (selector: string) => {
      const start = css.indexOf(`:root[data-surface="studio"] ${selector} {\n  scroll-padding`);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule("main.workspace")).toContain(
      "scroll-padding: var(--s-sticky-top, 0) 0 var(--s-sticky-bottom, 0) var(--s-sticky-start, 0);",
    );
    expect(rule("main .studio-table")).toContain("scroll-padding-left: var(--s-sticky-start, 0);");
  });

  it("packs a table's filters into one row, each label beside its field, and keeps the bar of the rows selected in sight", () => {
    root.setAttribute("data-surface", "studio");
    const page = `
      <main class="workspace">
        <div class="studio-filters">
          <label class="studio-filter">Search <input type="search"></label>
          <label>State <select><option>Any</option></select></label>
          <p class="hint">3 of 4 cards</p>
        </div>
        <div class="studio-bulk-bar" role="group"><p>2 cards selected</p><div class="actions"><button>Retire</button></div></div>
      </main>`;
    expect(styleOf(page, ".studio-filters").display).toBe("flex");
    expect(styleOf(page, ".studio-filters label:not(.studio-filter)").display).toBe("inline-flex");
    expect(styleOf(page, ".studio-filters select").marginTop).toBe("0px");
    expect(styleOf(page, ".studio-filters > p").marginLeft).toBe("auto");
    expect(styleOf(page, ".studio-bulk-bar").position).toBe("sticky");
    expect(styleOf(page, ".studio-bulk-bar").bottom).toBe("0px");
    expect(styleOf(page, ".studio-bulk-bar .actions").display).toBe("flex");
  });

  it("keeps its screens' own rules to the Studio, weighing less than the workspace's", () => {
    const page = `
      <main class="workspace">
        <span class="studio-badge">Course</span>
        <div class="studio-filters"><label>State <select><option>Any</option></select></label></div>
        <nav class="studio-tabs"><ul><li><a href="#" aria-current="page">Cards</a></li></ul></nav>
      </main>`;
    expect(styleOf(page, ".studio-badge").display).not.toBe("inline-block");
    expect(styleOf(page, ".studio-tabs ul").display).not.toBe("flex");
    root.setAttribute("data-surface", "studio");
    expect(styleOf(page, ".studio-badge").display).toBe("inline-block");
    expect(styleOf(page, ".studio-tabs ul").display).toBe("flex");
    expect(styleOf(page, ".studio-tabs a").borderBottomStyle).toBe("solid");
    // The filter's own height gives way to the density's.
    expect(styleOf(page, ".studio-filters select").minHeight).toBe("28px");
  });

  it("sizes a text and its language as the density says, the corners inside their box their own", () => {
    const page = `
      <main class="workspace">
        <div class="text-with-language"><input type="text"><button type="button">Swedish</button></div>
      </main>`;
    root.setAttribute("data-surface", "studio");
    expect(styleOf(page, ".text-with-language > input").minHeight).toBe("28px");
    expect(styleOf(page, ".text-with-language > button").minHeight).toBe("28px");
    expect(styleOf(page, ".text-with-language > input").borderRadius).toBe("0px");
    // Not the density's 8px all round: square at the divider (jsdom computes no logical corners).
    expect(styleOf(page, ".text-with-language > button").borderRadius).toBe("0px");
  });

  it("makes the card inspector's card small, its faces side by side", () => {
    const page = `
      <main class="workspace">
        <section class="card-inspector"><div class="practice-card"><div class="card-face card-front card-question"><p>水</p></div></div></section>
      </main>`;
    expect(styleOf(page, ".practice-card").flexDirection).toBe("column");
    root.setAttribute("data-surface", "studio");
    expect(styleOf(page, ".practice-card").flexDirection).toBe("row");
    expect(styleOf(page, ".practice-card").minHeight).toBe("0");
    expect(styleOf(page, ".card-question > p").fontSize).toBe("20px");
  });

  it("puts an editor's preview beside its form on a wide screen, under it on a narrower one", () => {
    root.setAttribute("data-surface", "studio");
    const page = `
      <main class="workspace">
        <div class="studio-editor"><p class="warning"></p><fieldset></fieldset><section class="course-player"></section></div>
        <div class="prose-field"><div class="lang-text-field"></div><div class="markdown-toggle"></div><section class="prose-preview"></section></div>
      </main>`;
    viewport(1024);
    expect(styleOf(page, ".studio-editor").display).toBe("block");
    expect(styleOf(page, ".prose-field").display).toBe("block");
    viewport(1440);
    expect(styleOf(page, ".studio-editor").display).toBe("grid");
    expect(styleOf(page, ".studio-editor > .course-player").position).toBe("sticky");
    // A released draft's notice above the form leaves the preview on the right.
    expect(styleOf(page, ".studio-editor > .warning").gridColumn).toContain("1");
    expect(styleOf(page, ".studio-editor > .course-player").gridColumn).toContain("2");
    expect(styleOf(page, ".prose-field").display).toBe("grid");
    expect(styleOf(page, ".prose-preview").gridColumn).toContain("2");
    viewport(1024);
  });
});

/*
 * The colors studio.css draws with, all the site's tokens (style.css),
 * in each theme: every text color it uses on every surface it uses, as
 * any of them may meet. The surfaces that hold no text are left out.
 */
describe("the Studio's contrast", () => {
  const site = readFileSync(
    createRequire(import.meta.url).resolve("@solid-memo/ui/style.css"),
    "utf8",
  );
  const sheet = readFileSync(join(import.meta.dirname, "studio.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  /** The rules for forced colors, kept apart: they draw with the system's colors, not the site's. */
  const forcedStart = sheet.indexOf("@media (forced-colors: active) {");
  const forcedEnd = (() => {
    let depth = 0;
    for (let at = sheet.indexOf("{", forcedStart); at < sheet.length; at++) {
      if (sheet[at] === "{") depth++;
      if (sheet[at] === "}" && --depth === 0) return at + 1;
    }
    return sheet.length;
  })();
  const studio = sheet.slice(0, forcedStart) + sheet.slice(forcedEnd);
  const forced = sheet.slice(forcedStart, forcedEnd);

  /** The #rrggbb custom properties the block `selector` in style.css declares, by name. */
  const tokens = (selector: string): Record<string, string> => {
    const start = site.indexOf(`${selector} {`);
    const block = site.slice(start, site.indexOf("}", start));
    return Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]),
    );
  };
  const light = tokens(":root");
  const themes = { light, dark: { ...light, ...tokens(':root[data-theme="dark"]') } };

  /** A stylesheet's rules, as each selector and the declarations it sets. */
  const rulesOf = (css: string) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1]!.replace(/\s+/g, " ").trim(),
      body: m[2]!,
    }));
  /** studio.css's rules but those for forced colors, the comments left out. */
  const rules = rulesOf(studio);
  /** The tokens the rules give `property` (color, background), each once. */
  const used = (property: string) => [
    ...new Set(
      rules.flatMap(({ body }) =>
        [...body.matchAll(new RegExp(`(?:^|[;\\s])${property}:\\s*var\\((--[\\w-]+)\\)`, "g"))].map(
          (m) => m[1]!,
        ),
      ),
    ),
  ];

  /** The surfaces that hold no text: the splitter's bar as it is pointed at, and a dialog's backdrop. */
  const TEXTLESS: Record<string, string> = {
    "--primary": ".studio-splitter:is(:hover, :focus-visible)",
    "--zoom-backdrop": ".studio-dialog::backdrop",
  };

  /** WCAG's contrast ratio of two #rrggbb colors. */
  const contrast = (a: string, b: string): number => {
    const luminance = (hex: string) => {
      const [r, g, bl] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
    };
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high! + 0.05) / (low! + 0.05);
  };

  /** The values `body` gives the properties that color: text, backgrounds, and an SVG shape's fill and line. */
  const colorsOf = (body: string) =>
    [...body.matchAll(/(?:^|[;\s])(?:color|background(?:-color)?|fill|stroke):\s*([^;]+);/g)].map(
      (m) => m[1]!,
    );

  it("draws only with the site's tokens, or a mix of two", () => {
    const token = String.raw`var\(--[\w-]+\)`;
    const mix = String.raw`color-mix\(\s*in srgb,\s*${token}\s+calc\(var\(--[\w-]+, 1\) \* 100%\),\s*${token}\s*\)`;
    for (const { body } of rules) {
      for (const value of colorsOf(body))
        expect(value).toMatch(new RegExp(`^(${token}|${mix}|inherit|none|transparent)$`));
    }
  });

  it("mixes paler only the edges drawn by the thousand: a term's own, and those bundled along the tree", () => {
    const mixed = rules.filter(({ body }) =>
      colorsOf(body).some((value) => value.startsWith("color-mix(")),
    );
    expect(mixed.map(({ selector }) => selector)).toEqual([
      ':root[data-surface="studio"] .graph-always .edges-bundled.edges-containment',
      ':root[data-surface="studio"] .graph-always .edges-bundled.edges-link',
      ':root[data-surface="studio"] .graph-plot .graph-focus.graph-hub .graph-edges',
    ]);
  });

  it("draws in forced colors only with the system's colors", () => {
    const forcedRules = rulesOf(forced);
    expect(forcedRules.length).toBeGreaterThan(0);
    for (const { body } of forcedRules) {
      for (const value of colorsOf(body))
        expect(value).toMatch(/^(Canvas|CanvasText|GrayText|Highlight|none)$/);
    }
  });

  /** A selector's specificity, as one number: its ids a million each, its classes, attributes and pseudo-classes a thousand, its elements one; an :is() as its most specific. */
  const specificity = (selector: string): number => {
    let inner = 0;
    const rest = selector.replace(/:is\(([^()]*)\)/g, (_, list: string) => {
      inner += Math.max(...list.split(",").map(specificity));
      return "";
    });
    const ids = rest.match(/#[\w-]+/g)?.length ?? 0;
    const classes = rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)?.length ?? 0;
    const elements =
      rest.replace(/\[[^\]]*\]/g, "").match(/(?:^|[\s>+~])[a-z][\w-]*/g)?.length ?? 0;
    return inner + ids * 1e6 + classes * 1e3 + elements;
  };

  it("lets the system's colors win over each color mixed paler, in forced colors", () => {
    expect(specificity(':root[data-surface="studio"] .a:is(.b, #c) svg')).toBe(1e6 + 3e3 + 1);
    const classes = (selector: string) => selector.match(/\.[\w-]+/g)!;
    const forcedRules = rulesOf(forced).filter(({ body }) => colorsOf(body).length > 0);
    const mixed = rules.filter(({ body }) =>
      colorsOf(body).some((value) => value.startsWith("color-mix(")),
    );
    expect(mixed.length).toBeGreaterThan(0);
    for (const { selector } of mixed) {
      const winner = forcedRules.find(
        (rule) =>
          classes(selector).every((name) => rule.selector.includes(name)) &&
          specificity(rule.selector) >= specificity(selector),
      );
      expect(winner, selector).toBeDefined();
    }
  });

  it.each(Object.entries(themes))(
    "keeps every line and shape the graph draws at 3:1 or more on its surface in the %s theme",
    (_, theme) => {
      // A fill an outline in --text bounds, and the gap a node's own line leaves about it (--surface), need none.
      // A term's own edges mixed paler (a mix, unmatched here) are so only by the thousand, an area more than lines; fewer are --warning-text.
      // So are the edges bundled along the tree, drawn again in full, in these, as their node is selected or pointed at.
      const outlined = new Set(["--surface", "--surface-sunken", "--accent-yellow"]);
      const drawn = new Set(
        rules
          .filter(({ selector }) => selector.includes(".graph-") || selector.includes(".edges-"))
          .flatMap(({ body }) => [
            ...body.matchAll(/(?:^|[;\s])(?:fill|stroke):\s*var\((--[\w-]+)\)/g),
          ])
          .map((m) => m[1]!)
          .filter((token) => !outlined.has(token)),
      );
      expect([...drawn]).toEqual(
        expect.arrayContaining(["--primary", "--text-muted", "--warning-text"]),
      );
      for (const token of drawn) {
        expect({ token, enough: contrast(theme[token]!, theme["--surface"]!) >= 3 }).toEqual({
          token,
          enough: true,
        });
      }
    },
  );

  it("puts no text on the surfaces that hold none", () => {
    for (const [surface, selector] of Object.entries(TEXTLESS)) {
      const on = rules.filter(({ body }) => body.includes(`background: var(${surface})`));
      expect(on.map((rule) => rule.selector)).toEqual([`:root[data-surface="studio"] ${selector}`]);
      expect(on[0]!.body).not.toMatch(/(?:^|[;\s])color:/);
    }
  });

  it.each(Object.entries(themes))(
    "keeps every text color at 4.5:1 or more on every surface in the %s theme",
    (_, theme) => {
      const texts = used("color");
      const surfaces = used("background").filter((surface) => !(surface in TEXTLESS));
      expect(texts).toContain("--text-muted");
      expect(surfaces).toContain("--surface-sunken");
      for (const text of texts) {
        for (const surface of surfaces) {
          expect({ text, surface, enough: contrast(theme[text]!, theme[surface]!) >= 4.5 }).toEqual(
            {
              text,
              surface,
              enough: true,
            },
          );
        }
      }
    },
  );
});
