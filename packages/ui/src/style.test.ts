import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/*
 * The focus indicators in style.css, checked through the cascade itself,
 * since a later or more specific rule can silently take a ring away. The
 * font imports are left out: the test DOM has no packages to fetch. Nor
 * does it know :lang(), so it reads an element marked lang="ko" itself
 * (of the same specificity) for it.
 */
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = readFileSync(join(import.meta.dirname, "style.css"), "utf8")
    .replace(/^@import .*$/gm, "")
    .replaceAll(":lang(ko)", '[lang|="ko"]');
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
    .filter((rule) => element.matches(rule.selectorText) && rule.style.getPropertyValue(property) !== "")
    .map((rule) => rule.style.getPropertyValue(property))
    .at(-1);
}

describe("focus styles", () => {
  it.each(["radio", "checkbox"])("rings a focused %s in the primary colour", (type) => {
    const style = focused(`<input type="${type}">`, "input");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
    expect(style.outlineOffset).toBe("2px");
  });

  it("shows a text field's focus with its border, and keeps an outline for forced colours", () => {
    const style = focused(`<input type="text">`, "input");
    expect(style.borderColor).toBe("#2c6b3d");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("transparent");
  });

  it("fades the other language's flag, not its button, and shows it in full when focused", () => {
    document.body.innerHTML = `
      <div class="language-selector">
        <button aria-pressed="true"><img alt="en"></button>
        <button aria-pressed="false"><img alt="sv"></button>
      </div>`;
    const [current, other] = document.querySelectorAll("button");
    expect(getComputedStyle(other).opacity).not.toBe("0.45");
    expect(getComputedStyle(current.querySelector("img")!).opacity).not.toBe("0.45");
    expect(getComputedStyle(other.querySelector("img")!).opacity).toBe("0.45");
    other.focus();
    // The test DOM's cascade skips a focused ancestor, so read the rules the flag now matches.
    expect(lastMatching(other.querySelector("img")!, "opacity")).toBe("1");
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
    ["the wordmark", `<header class="masthead"><h1><a class="wordmark" href="#/">x</a></h1></header>`, "a"],
    ["the WebID link", `<header class="masthead"><p class="session-line"><a href="https://x">x</a></p></header>`, "a"],
    ["a button", `<header class="masthead"><button>x</button></header>`, "button"],
  ])("rings %s in the masthead's text colour, which shows on its navy", (_, html, selector) => {
    expect(focused(html, selector).outlineColor).toBe("#f7f6f1");
  });

  it.each([
    ["a deck's menu button", `<ul class="deck-list"><li class="deck-row"><button class="icon row-menu">x</button></li></ul>`, "button"],
    ["a group's fold button", `<div class="deck-group-header"><button class="group-toggle">x</button></div>`, "button"],
    ["a group's menu button", `<div class="deck-group-header"><button class="icon row-menu">x</button></div>`, "button"],
    ["a menu's item", `<div class="actions-menu" role="menu"><button role="menuitem">x</button></div>`, "button"],
    ["a menu's link", `<div class="actions-menu" role="menu"><a role="menuitem" href="#/">x</a></div>`, "a"],
  ])("rings %s in the primary colour", (_, html, selector) => {
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
      .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === "(hover: hover)")
      .flatMap((rule) => [...rule.cssRules])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes("row-menu"));
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
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes(":hover"))
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

  it("rings a course question's radio in the primary colour", () => {
    const style = focused(`<div class="choices"><label class="choice"><input type="radio"></label></div>`, "input");
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineColor).toBe("#2c6b3d");
  });

  it("rings a menu's item inside it, clear of its clipping", () => {
    const style = focused(`<div class="actions-menu" role="menu"><button role="menuitem">x</button></div>`, "button");
    expect(style.outlineOffset).toBe("-2px");
  });

  it("draws a card table link's ring inside its cell, clear of the table's clipping", () => {
    const style = focused(`<table><tr><td class="clickable"><a href="#/">x</a></td></tr></table>`, "a");
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
    ["the wordmark", `<div class="masthead"><h1><a class="brand" href="#/"><span class="wordmark">x</span></a></h1></div>`, "h1"],
    ["the session line", `<div class="masthead"><p class="session-line">x</p></div>`, "p"],
    ["a breadcrumb", `<nav class="breadcrumbs"><ol><li><a href="#/">x</a></li></ol></nav>`, "a"],
    ["a deck's name", `<ul class="deck-list"><li class="deck-row"><a class="deck-open" href="#/">x</a></li></ul>`, "a"],
    ["a group's name", `<div class="deck-group-header"><button class="group-toggle"><span class="group-name">x</span></button></div>`, "span"],
    ["a group to move into", `<div class="move-into"><button>x</button></div>`, "button"],
    ["a library deck's name", `<ul class="library-list"><li><a class="library-deck-name" href="#/">x</a></li></ul>`, "a"],
    ["the instance's name", `<div class="instance-bar-identity"><strong>x</strong></div>`, "strong"],
    ["the instance's address", `<div class="instance-bar-identity"><span class="hint">x</span></div>`, "span"],
    ["a storage's address", `<ul class="storage-list"><li><span class="hint">x</span></li></ul>`, "span"],
    ["an instance's address", `<ul class="instance-list"><li><span class="hint">x</span></li></ul>`, "span"],
  ])("wraps %s instead of cutting it off", (_, html, selector) => {
    const style = styled(html, selector);
    expect(style.whiteSpace).not.toBe("nowrap");
    expect(style.textOverflow).not.toBe("ellipsis");
  });

  it.each([
    ["the session line", `<div class="masthead"><p class="session-line">x</p></div>`, "p"],
    ["a deck's name", `<ul class="deck-list"><li class="deck-row"><a class="deck-open" href="#/">x</a></li></ul>`, "a"],
    ["a group's name", `<div class="deck-group-header"><button class="group-toggle"><span class="group-name">x</span></button></div>`, "span"],
    ["a storage's address", `<ul class="storage-list"><li><span class="hint">x</span></li></ul>`, "span"],
  ])("breaks %s anywhere, so a long WebID or name fits the width", (_, html, selector) => {
    expect(styled(html, selector).overflowWrap).toBe("anywhere");
  });

  it("lets a group's header wrap its actions under its name", () => {
    expect(styled(`<div class="deck-group-header"></div>`, "div").flexWrap).toBe("wrap");
    expect(parseFloat(styled(`<div class="deck-group-header"><button class="group-toggle">x</button></div>`, "button").minWidth)).toBe(0);
  });

  it("gives a group no row's box: its header and members are rows of their own", () => {
    const style = styled(`<ul class="deck-list"><li class="deck-group"></li></ul>`, "li");
    expect(style.display).toBe("block");
    expect(style.borderTopStyle).not.toBe("solid");
  });

  it("indents a level of the deck list, but no further from the fifth level on", () => {
    const css = readFileSync(join(import.meta.dirname, "style.css"), "utf8");
    const start = css.indexOf(".deck-group-clip>.deck-list {");
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

/** The custom properties a theme block in style.css declares, by name. */
function tokens(selector: string): Record<string, string> {
  const css = readFileSync(join(import.meta.dirname, "style.css"), "utf8");
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
}

/** WCAG's contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("contrast", () => {
  const light = tokens(":root");
  const themes = { light, dark: { ...light, ...tokens(':root[data-theme="dark"]') } };
  const surfaces = ["--bg", "--surface", "--surface-sunken", "--surface-hover"];

  it.each(Object.entries(themes))("gives text fields an edge of at least 3:1 in the %s theme", (_, theme) => {
    for (const surface of surfaces) {
      expect(contrast(theme["--control-border"], theme[surface])).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(themes))("keeps muted text at 4.5:1 or more in the %s theme", (_, theme) => {
    for (const surface of surfaces) {
      expect(contrast(theme["--text-muted"], theme[surface])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps muted text readable over the light background's blue disc", () => {
    // --paper-blue, rgba(177, 207, 227, 0.5), laid over --bg.
    expect(contrast(light["--text-muted"], "#d4e2ea")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(themes))("keeps text on the course for newcomers' card at 4.5:1 or more in the %s theme", (_, theme) => {
    for (const text of ["--text", "--text-muted"]) {
      expect(contrast(theme[text], theme["--primary-soft"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps muted text readable under the course for newcomers' yellow glow", () => {
    // --paper-yellow, rgba(232, 171, 20, 0.16) and 0.05 in the dark, laid over --primary-soft.
    expect(contrast(light["--text-muted"], "#e6e6c6")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(themes.dark["--text-muted"], "#253923")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["input", "textarea"])("edges a resting %s with the control border", (tag) => {
    document.body.innerHTML = `<${tag}></${tag}>`;
    expect(getComputedStyle(document.querySelector(tag)!).borderColor).toBe(light["--control-border"]);
  });

  it("draws placeholders in muted text at full opacity", () => {
    const rule = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText.includes("::placeholder"))!;
    expect(rule.style.getPropertyValue("color")).toBe("var(--text-muted)");
    expect(rule.style.getPropertyValue("opacity")).toBe("1");
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
      .find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === ".library-list .library-deck-name::after")!;
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
    expect(parseFloat(getComputedStyle(document.querySelector("button")!).minHeight)).toBeGreaterThanOrEqual(44);
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
    expect(lastMatching(document.querySelector(".drop-line")!, "inset-inline")).toBe(
      "calc(min(var(--line-depth, 0), 4) * 1.25rem + var(--line-depth, 0) * (0.5rem + 2px)) 0",
    );
  });

  it("gives the focus proxy a 16px font, so focusing it does not zoom a phone's page", () => {
    document.body.innerHTML = `<input class="focus-proxy">`;
    expect(getComputedStyle(document.querySelector("input")!).fontSize).toBe("16px");
  });

  it.each([
    ["a group's", `<div class="deck-group-header"><form class="name-form"><input></form></div>`, ".deck-group-header"],
    ["a deck's", `<ul class="deck-list"><li class="deck-row"><form class="name-form"><input></form></li></ul>`, ".deck-row"],
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
    expect(lastMatching(document.querySelector(".deck-group-clip")!, "padding-bottom")).toBe("calc(0.25rem + 20px)");
    document.body.innerHTML = html("data-collapsed");
    expect(lastMatching(document.querySelector(".deck-group-clip")!, "padding-bottom")).toBe("0.25rem");
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
    expect(lastMatching(document.querySelector(".deck-group-header")!, "animation")).toMatch(/^group-leave .* forwards$/);
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
    const style = focused(`<div class="md"><pre class="md-region" tabindex="0"><code>x</code></pre></div>`, "pre");
    expect(style.outlineStyle).toBe("solid");
  });

  it("sizes a face's own paragraph as the face, and Markdown blocks in it at a reading size", () => {
    document.body.innerHTML = `<div class="card-face card-front card-question"><p>big</p><div class="md"><p>read</p></div></div>`;
    const [own, inBlocks] = document.querySelectorAll("p");
    expect(lastMatching(own!, "font-weight")).toBe("700");
    expect(lastMatching(inBlocks!, "font-weight")).toBeUndefined();
    expect(lastMatching(document.querySelector(".md")!, "font-size")).toBe("1.15rem");
    expect(lastMatching(document.querySelector(".md")!, "text-align")).toBe("left");
  });

  it("keeps a note's blocks as quiet as its paragraph, but left-aligned", () => {
    document.body.innerHTML = `<div class="card-face card-back"><p class="card-note">one</p><div class="md card-note"><ul><li>two</li></ul></div></div>`;
    const [paragraph, blocks] = document.querySelectorAll(".card-note");
    expect(lastMatching(paragraph!, "text-align")).toBe("center");
    expect(lastMatching(blocks!, "text-align")).toBe("left");
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
    expect(place(style.fontFamily, "Noto Sans CJK KR")).toBeLessThan(place(style.fontFamily, "Noto Sans CJK JP"));
    expect(style.wordBreak).toBe("keep-all");
    expect(styled(`<p>x</p>`, "p").wordBreak).not.toBe("keep-all");
  });

  it("still breaks a Korean word too long for its card", () => {
    expect(styled(`<div class="card-face"><p lang="ko">사람</p></div>`, "p").overflowWrap).toBe("anywhere");
  });

  it.each([
    ["a Korean heading", `<h1 lang="ko">사람</h1>`, "h1"],
    ["Korean text in a heading", `<h2><span lang="ko">사람</span></h2>`, "span"],
    ["the newcomer card's title", `<div class="newcomer-course-body"><p class="newcomer-course-title" lang="ko">사람</p></div>`, "p"],
  ])("draws %s in Bangers, then a Korean font, bold and untracked", (_, html, selector) => {
    const style = styled(html, selector);
    expect(style.fontFamily).toMatch(/^"?Bangers"?, "Fredoka Variable", "Apple SD Gothic Neo"/);
    expect(style.fontWeight).toBe("700");
    expect(style.letterSpacing).toBe("0px");
  });

  it.each([
    ["a code span", `<p lang="ko"><code class="md-inline-code">x</code></p>`],
    ["the Markdown help's samples", `<div class="markdown-help"><pre><code lang="ko">**굵게**</code></pre></div>`],
    ["code no rule of ours styles", `<p><code lang="ko">x</code></p>`],
  ])("keeps %s in a monospace font", (_, html) => {
    expect(styled(html, "code").fontFamily).toMatch(/^ui-monospace/);
  });

  it.each([
    ["a fact's label", `<dl class="facts"><dt lang="ko">사람</dt></dl>`, "dt"],
    ["the account's label", `<dl class="account"><dt lang="ko">사람</dt></dl>`, "dt"],
    ["a legend", `<fieldset><legend lang="ko">사람</legend></fieldset>`, "legend"],
    ["a table header", `<table><tr><th lang="ko">사람</th></tr></table>`, "th"],
    ["Korean text in a table header", `<table><tr><th><span lang="ko">사람</span></th></tr></table>`, "span"],
    ["the newcomer card's eyebrow", `<div class="newcomer-course-body"><p class="newcomer-course-eyebrow" lang="ko">사람</p></div>`, "p"],
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
    document.body.innerHTML = `<div class="confetti" aria-hidden="true"><span></span><span></span></div>`;
    const confetti = getComputedStyle(document.querySelector(".confetti")!);
    expect(confetti.position).toBe("fixed");
    expect(confetti.overflow).toBe("hidden");
    expect(confetti.pointerEvents).toBe("none");
    for (const piece of document.querySelectorAll(".confetti>span")) {
      // With motion reduced, every animation stops: a piece at rest shows nothing.
      expect(getComputedStyle(piece).opacity).toBe("0");
      expect(lastMatching(piece, "animation")).toMatch(/^confetti-fall 2\.2s .* var\(--delay\) backwards$/);
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
