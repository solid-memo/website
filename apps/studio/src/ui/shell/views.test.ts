import { describe, expect, it } from "vitest";
import { HOME_VIEWS, inView, showFromParam, viewOf, withView, type DeckFacts, type HomeView } from "./views";

const plain: DeckFacts = { due: 0, badges: [] };

describe("inView", () => {
  it.each<[string, DeckFacts, HomeView[]]>([
    ["a deck of the user's own, nothing due", plain, ["all"]],
    ["one with cards due", { due: 3, badges: [] }, ["all", "due"]],
    ["one whose cards are still counted", { due: "loading", badges: [] }, ["all", "due"]],
    ["one whose cards could not be counted", { due: "unreadable", badges: [] }, ["all"]],
    ["a copy of a library course", { due: 0, badges: ["course"] }, ["all", "courses"]],
    ["a copy of a library deck", { due: 0, badges: ["library"] }, ["all", "copies"]],
    ["a copy of a course from a link", { due: 0, badges: ["course", { from: "pod.example" }] }, ["all", "courses", "copies"]],
    ["one with invalid data", { due: 0, badges: ["invalid"] }, ["all", "attention"]],
    ["one whose cards could not be read", { due: 0, badges: ["unreadable"] }, ["all", "attention"]],
  ])("keeps %s in its views", (_, facts, views) => {
    expect(HOME_VIEWS.filter((view) => inView(view, facts))).toEqual(views);
  });
});

describe("viewOf and showFromParam", () => {
  it("is every deck without a view, else the view named", () => {
    expect(viewOf({})).toBe("all");
    expect(viewOf({ show: "courses" })).toBe("courses");
  });

  it.each([
    ["due", "due"],
    ["attention", "attention"],
    ["all", undefined],
    ["everything", undefined],
    [null, undefined],
  ])("reads %s from the URL as %s", (param, show) => {
    expect(showFromParam(param)).toBe(show);
  });
});

describe("withView", () => {
  it("keeps the filter's text and the sort, in every view", () => {
    const sorted = { view: { filter: "kanji", sort: { column: "title" as const, descending: false } } };
    expect(withView(sorted, "due")).toEqual({ ...sorted, show: "due" });
    expect(withView({ ...sorted, show: "due" }, "courses")).toEqual({ ...sorted, show: "courses" });
  });

  it("leaves every deck, and a query as it starts, out of the URL", () => {
    expect(withView({ view: { filter: "kanji" }, show: "copies" }, "all")).toEqual({ view: { filter: "kanji" } });
    expect(withView({ show: "due" }, "all")).toEqual({});
  });
});
