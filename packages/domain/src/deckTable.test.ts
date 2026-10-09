import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  arrangeDeckRows,
  deckTableViewFromParams,
  deckTableViewToParams,
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

const languages: DeckGroup = { url: "https://pod.example/a/catalog.ttl#group-1", title: { en: "Languages" } };
const scripts: DeckGroup = { url: "https://pod.example/a/catalog.ttl#group-2", title: { en: "Scripts", sv: "Skrifter" } };

function row(of: Deck, extra: Partial<DeckTableRow> = {}): DeckTableRow {
  return { deck: of, groups: [], figures: {}, newCardsPerDay: 20, maxReviewsPerDay: 200, ...extra };
}

const kanji = row(deck("kanji", { en: "Kanji 10", ja: "漢字" }, { direction: "bidirectional", modifiedAt: "2026-10-05T10:00:00.000Z" }), {
  groups: [languages, scripts],
  figures: { cards: 30, due: 4 },
  newCardsPerDay: 5,
});
const verbs = row(deck("verbs", { en: "Verbs", sv: "Verb" }), { groups: [languages], figures: { cards: 12, due: 0, new: 3 } });
const capitals = row(deck("capitals", { en: "Kanji 2" }, { direction: "back-to-front" }), { figures: { due: 4 }, maxReviewsPerDay: 50 });
const rows = [kanji, verbs, capitals];

const english = (text: LangText) => shown(text, ["en"]);
const arranged = (view: DeckTableView) => arrangeDeckRows(rows, view, english, "en").map((r) => r.deck.id);
const sorted = (column: DeckColumn, descending = false) => arranged({ filter: "", sort: { column, descending } });

describe("the deck table's view in the URL", () => {
  it("round-trips a filter and a sort through the query, leaving out what is by default", () => {
    const views: DeckTableView[] = [
      { filter: "" },
      { filter: "kanji" },
      { filter: "", sort: { column: "due", descending: false } },
      { filter: "å", sort: { column: "modified", descending: true } },
    ];
    for (const view of views) {
      expect(deckTableViewFromParams(new URLSearchParams(deckTableViewToParams(view)))).toEqual(view);
    }
    expect(deckTableViewToParams({ filter: "" })).toEqual({});
    expect(deckTableViewToParams({ filter: "", sort: { column: "title", descending: false } })).toEqual({ sort: "title" });
  });

  it("ignores a column it does not know, and any order but descending", () => {
    expect(deckTableViewFromParams(new URLSearchParams("sort=colour&order=desc&q=x"))).toEqual({ filter: "x" });
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
    expect(nextSort(down, "title")).toEqual({ filter: "x", sort: { column: "title", descending: false } });
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

  it("keeps ties in order, and puts a figure not known yet last, either way", () => {
    expect(sorted("due")).toEqual(["verbs", "kanji", "capitals"]);
    expect(sorted("due", true)).toEqual(["kanji", "capitals", "verbs"]);
    expect(sorted("cards")).toEqual(["verbs", "kanji", "capitals"]);
    expect(sorted("cards", true)).toEqual(["kanji", "verbs", "capitals"]);
    expect(sorted("new")).toEqual(["verbs", "kanji", "capitals"]);
  });
});
