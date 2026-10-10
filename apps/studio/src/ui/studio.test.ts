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
});
