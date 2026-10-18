// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSticky, unclearSticky } from "./stickyClearance";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Where `element` is, as the test DOM, which lays nothing out, cannot say. */
const place = (element: Element, rect: Partial<DOMRect>) =>
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect as DOMRect);

/**
 * A table in the main content, which is 40px down the window and 250px
 * in, to 640px down; the header row ends 76px down, the first column
 * (with a row's checkbox, when `selectable`) 410px in, and the bar of the
 * rows selected, when there is one, starts 580px down.
 */
function page({ selectable = false, bar = false, inMain = true } = {}) {
  const box = inMain ? "main" : "div";
  document.body.innerHTML = `
    <${box}>
      <div class="studio-table">
        <table class="${selectable ? "selectable" : ""}">
          <caption><a href="#/help">Cards</a></caption>
          <thead><tr>${selectable ? "<th><input type=checkbox></th>" : ""}<th><button>Name</button></th><th>Due</th></tr></thead>
          <tbody><tr>${selectable ? "<td><input type=checkbox></td>" : ""}<th><a href="#/x">Kanji</a></th><td><button>Edit</button></td></tr></tbody>
        </table>
      </div>
      ${bar ? `<div class="studio-bulk-bar"><button>Clear</button></div>` : ""}
    </${box}>`;
  const main = document.querySelector<HTMLElement>(box)!;
  place(main, { top: 40, bottom: 640, left: 250 });
  place(document.querySelector("thead")!, { bottom: 76 });
  const headers = document.querySelectorAll("thead th");
  place(headers[0]!, { right: selectable ? 290 : 410 });
  if (selectable) place(headers[1]!, { right: 410 });
  if (bar) place(document.querySelector(".studio-bulk-bar")!, { top: 580 });
  const table = document.querySelector("table")!;
  const room = () =>
    ["top", "start", "bottom"].map((side) => main.style.getPropertyValue(`--s-sticky-${side}`));
  return { table, main, room };
}

describe("clearSticky", () => {
  it("gives the main content the room the header row and the first column reach into it, then scrolls what has the focus clear of them", () => {
    const { table, room } = page();
    const edit = document.querySelector<HTMLElement>("tbody button")!;
    const scroll = vi.spyOn(edit, "scrollIntoView");
    clearSticky(table, edit);
    expect(room()).toEqual(["36px", "160px", "0px"]);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("counts a row's checkbox as part of the first column, and gives the bar of the rows selected its room", () => {
    const { table, room } = page({ selectable: true, bar: true });
    clearSticky(table, document.querySelector("tbody button")!);
    expect(room()).toEqual(["36px", "160px", "60px"]);
  });

  it("makes no room from a part for what is in it", () => {
    const { table, room } = page({ selectable: true });
    clearSticky(table, document.querySelector("tbody a")!);
    expect(room()).toEqual(["36px", "0px", "0px"]);
    clearSticky(table, document.querySelector("tbody input")!);
    expect(room()).toEqual(["36px", "0px", "0px"]);
    clearSticky(table, document.querySelector("thead th:last-child")!);
    expect(room()).toEqual(["0px", "160px", "0px"]);
    clearSticky(table, document.querySelector("caption a")!);
    expect(room()).toEqual(["36px", "160px", "0px"]);
  });

  it("measures the first column from the table's own box while that scrolls sideways, as on a narrow screen", () => {
    const { table, room } = page();
    const box = document.querySelector(".studio-table")!;
    Object.defineProperty(box, "scrollWidth", { value: 900 });
    Object.defineProperty(box, "clientWidth", { value: 400 });
    place(box, { left: 266 });
    clearSticky(table, document.querySelector("tbody button")!);
    expect(room()[1]).toBe("144px");
  });

  it("gives no room from a part that has scrolled out of sight", () => {
    const { table, room } = page();
    place(document.querySelector("thead")!, { bottom: 10 });
    clearSticky(table, document.querySelector("tbody button")!);
    expect(room()[0]).toBe("0px");
  });

  it("leaves a table outside the main content as it is", () => {
    const { table, main, room } = page({ inMain: false });
    clearSticky(table, document.querySelector("tbody button")!);
    unclearSticky(table);
    expect(room()).toEqual(["", "", ""]);
    expect(main.getAttribute("style")).toBeNull();
  });
});

describe("unclearSticky", () => {
  it("takes the room away", () => {
    const { table, room } = page({ bar: true });
    clearSticky(table, document.querySelector("tbody button")!);
    unclearSticky(table);
    expect(room()).toEqual(["", "", ""]);
  });
});
