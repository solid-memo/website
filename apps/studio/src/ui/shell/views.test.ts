import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_QUERY, queryFromParams, type CardQuery } from "@solid-memo/domain/cardQuery";
import {
  cardParams,
  cardViewOf,
  CARD_VIEWS,
  homeParams,
  homeQueryOf,
  HOME_VIEWS,
  inView,
  paramsText,
  renamedView,
  showFromParam,
  viewOf,
  withCardView,
  withoutView,
  withSavedView,
  withView,
  type DeckFacts,
  type HomeQuery,
  type HomeView,
  type SavedView,
} from "./views";

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

describe("homeParams and homeQueryOf", () => {
  it.each<HomeQuery>([
    {},
    { show: "due" },
    { view: { filter: "kanji" } },
    { view: { filter: "", sort: { column: "due", descending: true } }, show: "courses" },
  ])("round-trip Home's query %j through the URL's parameters", (query) => {
    expect(homeQueryOf(new URLSearchParams(homeParams(query)))).toEqual(query);
  });

  it("leave out what is as by default, and what they do not know", () => {
    expect(homeParams({ view: { filter: "" } })).toEqual({});
    expect(homeQueryOf(new URLSearchParams("q=&sort=size&show=everything"))).toEqual({});
  });
});

describe("the workbench's views", () => {
  const query: CardQuery = { ...DEFAULT_CARD_QUERY, text: "cat", page: 3 };

  it("are every card, those due, the new ones and the leeches", () => {
    expect(CARD_VIEWS).toEqual(["all", "due", "new", "leech"]);
  });

  it.each<[CardQuery["state"], ReturnType<typeof cardViewOf>]>([
    [undefined, "all"],
    ["due", "due"],
    ["leech", "leech"],
    ["mature", null],
  ])("take a query in the state %s to be in the view %s", (state, view) => {
    expect(cardViewOf({ ...query, ...(state === undefined ? {} : { state }) })).toBe(view);
  });

  it("set the state, from the first page, the rest of the query kept", () => {
    expect(withCardView(query, "new")).toEqual({ ...query, page: 1, state: "new" });
    expect(withCardView({ ...query, state: "due" }, "all")).toEqual({ ...query, page: 1 });
  });

  it("are saved without the page, as a view opens at the first", () => {
    const sorted: CardQuery = { ...query, state: "leech", sort: { key: "lapses", descending: true }, size: 200 };
    expect(cardParams(sorted)).toEqual({ q: "cat", state: "leech", sort: "lapses", order: "desc", size: "200" });
    expect(queryFromParams(new URLSearchParams(cardParams(sorted)))).toEqual({ ...sorted, page: 1 });
  });
});

describe("the saved views", () => {
  const due: SavedView = { name: "Due", params: "show=due" };
  const kanji: SavedView = { name: "Kanji", params: "q=kanji" };

  it("hold a query's parameters as text", () => {
    expect(paramsText({ q: "a b", show: "due" })).toBe("q=a+b&show=due");
  });

  it("add a view at the end, under its name trimmed, or replace the one of that name where it is", () => {
    expect(withSavedView([due], " Kanji ", "q=kanji")).toEqual([due, kanji]);
    expect(withSavedView([due, kanji], "Due", "show=courses")).toEqual([{ name: "Due", params: "show=courses" }, kanji]);
  });

  it("rename a view where it is, another of the new name giving way", () => {
    expect(renamedView([due, kanji], "Due", " Today ")).toEqual([{ ...due, name: "Today" }, kanji]);
    expect(renamedView([due, kanji], "Kanji", "Due")).toEqual([{ ...kanji, name: "Due" }]);
  });

  it("remove a view", () => {
    expect(withoutView([due, kanji], "Due")).toEqual([kanji]);
  });
});
