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
    style.textContent = readFileSync(path, "utf8").replace(/^@import .*$/gm, "");
    document.head.append(style);
  }
});

const root = document.documentElement;

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
    expect(styleOf(page, "tbody tr.selected > td:last-child").backgroundColor).toBe(styleOf(page, "tbody tr[aria-current] > td:last-child").backgroundColor);
    expect(styleOf(page, "tbody tr.selected > td:last-child").backgroundColor).not.toBe(styleOf(page, "tbody tr.cursor > td:last-child").backgroundColor);
    expect(styleOf(page, "tbody tr[aria-current] > td:first-child").boxShadow).toContain("inset");
  });
});
