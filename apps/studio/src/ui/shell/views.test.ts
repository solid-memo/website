import { describe, expect, it } from "vitest";
import { HOME_VIEWS, inView, showFromParam, viewOf, withView, type DeckFacts, type HomeView } from "./views";

const plain: DeckFacts = { due: 0, badges: [] };

describe("inView", () => {
  it.each<[string, DeckFacts, HomeView[]]>([
    ["a deck of the user's own, nothing due", plain, ["all"]],
    ["one with cards due", { due: 3, badges: [] }, ["all", "due"]],
    ["one whose cards are still counted", { due: undefined, badges: [] }, ["all"]],
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
  it("sorts the decks due by their cards due, the most first, keeping the filter's text", () => {
    expect(withView({ view: { filter: "kanji" } }, "due")).toEqual({
      view: { filter: "kanji", sort: { column: "due", descending: true } },
      show: "due",
    });
  });

  it("leaves another view in the user's order, and every deck out of the URL", () => {
    const sorted = { view: { filter: "", sort: { column: "title" as const, descending: false } }, show: "due" as const };
    expect(withView(sorted, "courses")).toEqual({ show: "courses" });
    expect(withView({ view: { filter: "kanji" }, show: "copies" }, "all")).toEqual({ view: { filter: "kanji" } });
    expect(withView({}, "all")).toEqual({});
  });
});
