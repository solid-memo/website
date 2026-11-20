// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Deck } from "./deck";
import {
  arrangeDeckRows,
  deckGroupPaths,
  deckRowRanks,
  deckSortTexts,
  deckTableViewFromParams,
  deckTextRanks,
  deckTableViewToParams,
  groupPath,
  groupsOfDecks,
  groupTrails,
  matchesFilter,
  nextSort,
  type DeckColumn,
  type DeckTableRow,
  type DeckTableView,
} from "./deckTable";
import type { DeckGroup, DeckTree } from "./deckTree";
import { shown, type LangText } from "./langText";
import { growth } from "./testing/growth";

function deck(id: string, title: LangText, extra: Partial<Deck> = {}): Deck {
  return {
    id,
    url: `https://pod.example/a/catalog.ttl#${id}`,
    title,
    cardsDocumentUrl: `https://pod.example/a/decks/${id}.ttl`,
    reviewsDocumentUrl: `https://pod.example/a/reviews/${id}.ttl`,
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 6,
    direction: "front-to-back",
    authors: [],
    ...extra,
  };
}

const languages: DeckGroup = {
  url: "https://pod.example/a/catalog.ttl#group-1",
  title: { en: "Languages" },
};
const scripts: DeckGroup = {
  url: "https://pod.example/a/catalog.ttl#group-2",
  title: { en: "Scripts", sv: "Skrifter" },
};

function row(of: Deck, extra: Partial<DeckTableRow> = {}): DeckTableRow {
  return { deck: of, groups: [], figures: {}, newCardsPerDay: 20, maxReviewsPerDay: 200, ...extra };
}

const kanji = row(
  deck(
    "kanji",
    { en: "Kanji 10", ja: "漢字" },
    { direction: "bidirectional", modifiedAt: "2026-10-05T10:00:00.000Z" },
  ),
  {
    groups: [languages, scripts],
    figures: { cards: 30, due: 4 },
    newCardsPerDay: 5,
  },
);
const verbs = row(deck("verbs", { en: "Verbs", sv: "Verb" }), {
  groups: [languages],
  figures: { cards: 12, due: 0, new: 3 },
});
const capitals = row(deck("capitals", { en: "Kanji 2" }, { direction: "back-to-front" }), {
  figures: { due: 4 },
  maxReviewsPerDay: 50,
});
const rows = [kanji, verbs, capitals];

const english = (text: LangText) => shown(text, ["en"]);
const rowRanks = (of: readonly DeckTableRow[], view: DeckTableView, locale = "en") =>
  deckRowRanks(of, deckTextRanks(deckSortTexts(of, view.sort?.column, english), locale));
const arranged = (view: DeckTableView) =>
  arrangeDeckRows(
    rows.filter((r) => matchesFilter(r, view.filter)),
    view.sort,
    rowRanks(rows, view),
  ).map((r) => r.deck.id);
const sorted = (column: DeckColumn, descending = false) =>
  arranged({ filter: "", sort: { column, descending } });

describe("the deck table's view in the URL", () => {
  it("round-trips a filter and a sort through the query, leaving out what is by default", () => {
    const views: DeckTableView[] = [
      { filter: "" },
      { filter: "kanji" },
      { filter: "", sort: { column: "due", descending: false } },
      { filter: "å", sort: { column: "modified", descending: true } },
    ];
    for (const view of views) {
      expect(deckTableViewFromParams(new URLSearchParams(deckTableViewToParams(view)))).toEqual(
        view,
      );
    }
    expect(deckTableViewToParams({ filter: "" })).toEqual({});
    expect(
      deckTableViewToParams({ filter: "", sort: { column: "title", descending: false } }),
    ).toEqual({ sort: "title" });
  });

  it("ignores a column it does not know, and any order but descending", () => {
    expect(deckTableViewFromParams(new URLSearchParams("sort=color&order=desc&q=x"))).toEqual({
      filter: "x",
    });
    expect(deckTableViewFromParams(new URLSearchParams("sort=cards&order=up"))).toEqual({
      filter: "",
      sort: { column: "cards", descending: false },
    });
  });

  it("sorts by a column ascending, then descending, then in the user's own order", () => {
    const view: DeckTableView = { filter: "x" };
    const up = nextSort(view, "due");
    expect(up).toEqual({ filter: "x", sort: { column: "due", descending: false } });
    const down = nextSort(up, "due");
    expect(down).toEqual({ filter: "x", sort: { column: "due", descending: true } });
    expect(nextSort(down, "due")).toEqual({ filter: "x" });
    expect(nextSort(down, "title")).toEqual({
      filter: "x",
      sort: { column: "title", descending: false },
    });
  });
});

describe("the groups in a tree", () => {
  const tree: DeckTree = {
    readOnly: false,
    children: [
      { kind: "deck", deck: capitals.deck },
      {
        kind: "group",
        group: languages,
        children: [
          { kind: "group", group: scripts, children: [{ kind: "deck", deck: kanji.deck }] },
          { kind: "deck", deck: verbs.deck },
        ],
      },
    ],
  };

  it("are each deck's, outermost first", () => {
    const groups = groupsOfDecks(tree);
    expect(groups.get(capitals.deck.url)).toEqual([]);
    expect(groups.get(kanji.deck.url)).toEqual([languages, scripts]);
    expect(groups.get(verbs.deck.url)).toEqual([languages]);
  });

  it("are listed in the tree's order, each with its trail", () => {
    expect(groupTrails(tree)).toEqual([
      { group: languages, trail: [languages] },
      { group: scripts, trail: [languages, scripts] },
    ]);
  });
});

describe("the deck table's filter", () => {
  it("matches a deck's title in any language, or a group's name, case and diacritics aside", () => {
    expect(matchesFilter(kanji, "")).toBe(true);
    expect(matchesFilter(kanji, "  KANJI ")).toBe(true);
    expect(matchesFilter(kanji, "漢")).toBe(true);
    expect(matchesFilter(kanji, "skrifter")).toBe(true);
    expect(matchesFilter(verbs, "scripts")).toBe(false);
    expect(matchesFilter(row(deck("o", { sv: "Öl" })), "ol")).toBe(true);
    expect(arranged({ filter: "language" })).toEqual(["kanji", "verbs"]);
  });

  it("folds a title once, however many renders ask", () => {
    const normalize = vi.spyOn(String.prototype, "normalize");
    onTestFinished(() => normalize.mockRestore());
    const row = { ...kanji, deck: { ...kanji.deck, title: { en: "Ägg", sv: "Örn" } } };
    expect(matchesFilter(row, "orn")).toBe(true);
    normalize.mockClear();
    // Made anew, as on every render; the same title. Only the filter itself is folded.
    expect(matchesFilter({ ...row }, "agg")).toBe(true);
    expect(normalize).toHaveBeenCalledOnce();
  });

  it("searches each group's titles once a filter, however many decks are below it", () => {
    // A chain of 15 groups, then a group at the 16th level for each of
    // 985 decks, every title as long as a term: 1000 groups, as many as
    // an instance is read with.
    const group = (title: string, at: number): DeckGroup => ({
      url: `https://pod.example/a/catalog.ttl#group-${at}`,
      title: { en: title },
    });
    const length = 16_383;
    const chain = Array.from({ length: 15 }, (_, at) => group(String(at % 10).repeat(length), at));
    const leaves = Array.from({ length: 985 }, (_, at) =>
      group(`${"x".repeat(length - 8)}leaf${String(at).padStart(4, "0")}`, 15 + at),
    );
    const decks = leaves.map((leaf, at) =>
      row(deck(`d${at}`, { en: `Deck ${at}` }), { groups: [...chain, leaf] }),
    );
    const includes = vi.spyOn(String.prototype, "includes");
    onTestFinished(() => includes.mockRestore());
    const searched = () => {
      const total = includes.mock.contexts.reduce<number>(
        (sum, text) => sum + String(text).length,
        0,
      );
      includes.mockClear();
      return total;
    };
    const titles =
      1000 * length + decks.reduce((sum, of) => sum + shown(of.deck.title, ["en"]).length, 0);

    expect(decks.filter((of) => matchesFilter(of, "nowhere"))).toEqual([]);
    expect(searched()).toBe(titles);
    expect(decks.filter((of) => matchesFilter(of, "LEAF0042")).map((of) => of.deck.id)).toEqual([
      "d42",
    ]);
    expect(searched()).toBeLessThanOrEqual(titles);
    expect(decks.every((of) => matchesFilter(of, "0000"))).toBe(true);
    expect(searched()).toBeLessThanOrEqual(titles);
    // Rows made anew, as on every render, with the same filter: nothing is searched again.
    expect(decks.map((of) => ({ ...of })).every((of) => matchesFilter(of, "0000"))).toBe(true);
    expect(searched()).toBe(0);
  });
});

describe("the deck table's order", () => {
  it("is the order given when there is no sort", () => {
    expect(arranged({ filter: "" })).toEqual(["kanji", "verbs", "capitals"]);
  });

  it("sorts text as the reader's language does, numbers by value", () => {
    expect(sorted("title")).toEqual(["capitals", "kanji", "verbs"]);
    expect(sorted("title", true)).toEqual(["verbs", "kanji", "capitals"]);
    // At the top level first, then by the groups' names in turn.
    expect(sorted("group")).toEqual(["capitals", "verbs", "kanji"]);
  });

  it("sorts by direction, pace and when a deck was last changed", () => {
    expect(sorted("direction")).toEqual(["verbs", "capitals", "kanji"]);
    expect(sorted("newCardsPerDay")).toEqual(["kanji", "verbs", "capitals"]);
    expect(sorted("maxReviewsPerDay", true)).toEqual(["kanji", "verbs", "capitals"]);
    // Kanji was changed last; the others only made, at the same time, so they keep their order.
    expect(sorted("modified", true)).toEqual(["kanji", "verbs", "capitals"]);
  });

  it("has no texts to rank without a sort, or for a column of numbers", () => {
    expect(deckSortTexts(rows, undefined, english)).toEqual([]);
    expect(deckSortTexts(rows, "due", english)).toEqual([]);
    expect(deckSortTexts(rows, "title", english)).toEqual(
      rows.map((row) => english(row.deck.title)),
    );
  });

  it("ranks texts in the reader's order, those equal but for case at one place", () => {
    expect(deckTextRanks(["Kanji 10", "kanji 2", "KANJI 2", "Äpple"], "sv")).toEqual([1, 0, 0, 2]);
  });

  it("keeps rows of texts equal but for case in the order given, either way", () => {
    const upper = { ...verbs, deck: { ...verbs.deck, title: { en: "KANJI 10" } } };
    const pair = [kanji, upper];
    for (const descending of [false, true]) {
      const sort = { column: "title", descending } as const;
      const view = { filter: "", sort };
      expect(arrangeDeckRows(pair, view.sort, rowRanks(pair, view))).toEqual(pair);
    }
  });

  it("finds a row's rank by the row, so rows of the same text keep their own", () => {
    const twin = { ...kanji, deck: { ...kanji.deck, id: "twin" } };
    const pair = [kanji, twin];
    const view = { filter: "", sort: { column: "title", descending: false } } as const;
    expect(arrangeDeckRows(pair, view.sort, deckRowRanks(pair, [1, 0]))).toEqual([twin, kanji]);
  });

  it("ranks paths of groups by the names they show", () => {
    const parent = { url: "https://x.example/#g", title: { en: "p".repeat(16_383) } } as DeckGroup;
    const inGroup = (head: string) => ({
      ...kanji,
      groups: [parent, { ...parent, title: { en: head + "l".repeat(16_370) } }],
    });
    const paths = [inGroup("10"), inGroup("2"), inGroup("3")];
    const view = { filter: "", sort: { column: "group", descending: false } } as const;
    expect(deckSortTexts(paths, "group", english)[0]).toHaveLength(2 * 200 + 3);
    expect(arrangeDeckRows(paths, view.sort, rowRanks(paths, view))).toEqual([
      paths[1],
      paths[2],
      paths[0],
    ]);
  });

  it("names a list of groups the decks share once", () => {
    const shared = kanji.groups;
    const titles = vi.fn(english);
    const paths = deckGroupPaths([kanji, { ...verbs, groups: shared }], titles);
    expect([...paths.keys()]).toEqual([shared]);
    expect(titles).toHaveBeenCalledTimes(shared.length);
  });

  it("has no rank by row for a column of numbers", () => {
    expect(deckRowRanks(rows, []).size).toBe(0);
  });

  it("keeps ties in order, and puts a figure not known yet last, either way", () => {
    expect(sorted("due")).toEqual(["verbs", "kanji", "capitals"]);
    expect(sorted("due", true)).toEqual(["kanji", "capitals", "verbs"]);
    expect(sorted("cards")).toEqual(["verbs", "kanji", "capitals"]);
    expect(sorted("cards", true)).toEqual(["kanji", "verbs", "capitals"]);
    expect(sorted("new")).toEqual(["verbs", "kanji", "capitals"]);
  });
});

describe("a path of groups", () => {
  const group = (title: string, at = 0): DeckGroup => ({
    url: `https://pod.example/a/catalog.ttl#group-${at}`,
    title: { en: title },
  });

  it("joins the groups' titles in the reader's language, a short title whole", () => {
    expect(groupPath([languages, scripts], (text) => shown(text, ["sv", "en"]))).toBe(
      "Languages › Skrifter",
    );
    expect(groupPath([], english)).toBe("");
    expect(groupPath([group("a".repeat(200))], english)).toBe("a".repeat(200));
  });

  it("cuts a long title to 200 code points, the last an ellipsis", () => {
    expect(groupPath([group("a".repeat(201)), languages], english)).toBe(
      `${"a".repeat(199)}… › Languages`,
    );
  });

  it("counts and cuts characters outside the BMP as one each, never within one", () => {
    const smile = "\u{1F600}";
    expect(groupPath([group(smile.repeat(200))], english)).toBe(smile.repeat(200));
    const cut = groupPath([group(`${smile.repeat(250)}b`)], english);
    expect(cut).toBe(`${smile.repeat(199)}…`);
  });

  it("stays bounded with groups 16 deep and titles as long as a term", () => {
    // A chain of 15 groups, then a group at the 16th level for each of
    // 985 decks: 1000 groups, as many as an instance is read with.
    const layout = (length: number) => {
      const chain = Array.from({ length: 15 }, (_, at) =>
        group(String(at % 10).repeat(length), at),
      );
      return Array.from({ length: 985 }, (_, at) =>
        row(deck(`d${at}`, { en: `Deck ${at}` }), {
          groups: [...chain, group(String(at % 10).repeat(length), 15 + at)],
        }),
      );
    };
    const paths = deckGroupPaths(layout(16_383), english);
    expect(paths.size).toBe(985);
    for (const path of paths.values()) expect(path.length).toBeLessThanOrEqual(16 * 200 + 15 * 3);
    // A path names each group by at most 200 code points, so titles eight
    // times as long take no longer to name; titles named whole would
    // take eight times as long.
    const ratio = growth(
      (length) => {
        const rows = layout(length);
        return () => deckGroupPaths(rows, english);
      },
      2_000,
      8,
      0.5,
    );
    expect(ratio).toBeLessThan(0.5);
  });
});
