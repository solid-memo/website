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
