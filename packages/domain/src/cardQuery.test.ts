import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card } from "./deck";
import { shown, type LangText } from "./langText";
import {
  cardLanguages,
  DEFAULT_CARD_QUERY,
  isDefaultQuery,
  nextCardSort,
  queryCards,
  queryFromParams,
  queryToParams,
  type CardQuery,
  type DeckReviews,
} from "./cardQuery";
import type { ReviewState } from "./review";

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    url: `https://pod.example/a/decks/d.ttl#${id}`,
    front: { en: id },
    back: { en: id },
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 5,
    ...extra,
  };
}

function state(cardId: string, extra: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    due: "2026-10-12",
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-06T10:00:00.000Z",
    formatVersion: 2,
    ...extra,
  };
}

const TODAY = "2026-10-09";

/** Markdown as plain text, as far as these cards need: emphasis marks dropped. */
const plain = (text: string) => text.replace(/\*/g, "");

/** The text an English reader is shown. */
const englishReader = (text: LangText) => shown(text, ["en"]);

const house = card("c-house", {
  front: { sv: "Hus" },
  back: { en: "House" },
  backLabel: { en: "Noun" },
  frontNote: { en: "Ett hus" },
  createdAt: "2026-10-03T10:00:00.000Z",
});
const cafe = card("c-cafe", {
  front: { fr: "Café" },
  back: { en: "**Coffee** shop" },
  textFormat: SM.markdown,
  distractors: [{ id: "d1", text: { en: "Tea room" }, note: { en: "Not quite" } }],
});
const iron = card("c-iron", {
  front: { zxx: "Fe" },
  back: { "en-gb": "Iron" },
  backImageUrl: "https://img.example/fe.png",
  backImageDescription: { en: "A bar of metal" },
  createdAt: "2026-09-01T10:00:00.000Z",
});
const old = card("c-old", { front: { "": "Gammal" }, back: { en: "Old" }, retired: true, backNote: { en: "Retired" } });
const fresh = card("c-fresh", { front: {}, frontImageUrl: "https://img.example/x.png", back: { en: "Picture" } });
const cards = [house, cafe, iron, old, fresh];

const reviews: DeckReviews = {
  direction: "front-to-back",
  states: [
    state("c-house", { intervalDays: 30, due: "2026-11-01", easeFactor: 2.6 }),
    state("c-cafe", { repetitions: 0, intervalDays: 1, due: "2026-10-09", easeFactor: 1.8 }),
    state("c-iron", { intervalDays: 6, due: "2026-10-08", easeFactor: 2.2 }),
    // Of a direction the deck is not studied in: left out.
    state("c-fresh", { direction: "back-to-front" }),
  ],
};

const ids = (query: Partial<CardQuery>, given: DeckReviews = reviews) =>
  queryCards(cards, given, { ...DEFAULT_CARD_QUERY, ...query }, TODAY, plain, englishReader, "en").map((row) => row.card.id);

describe("the card query in the URL", () => {
  it("round-trips through the query, leaving out what is by default", () => {
    const queries: CardQuery[] = [
      DEFAULT_CARD_QUERY,
      { ...DEFAULT_CARD_QUERY, text: "hus", field: "front", lang: "sv" },
      { ...DEFAULT_CARD_QUERY, lang: "unstated", state: "due", has: "picture", sort: { key: "due", descending: true }, page: 3, size: 200 },
      { ...DEFAULT_CARD_QUERY, sort: { key: "front", descending: false }, size: 10 },
    ];
    for (const query of queries) {
      expect(queryFromParams(new URLSearchParams(queryToParams(query)))).toEqual(query);
    }
    expect(queryToParams(DEFAULT_CARD_QUERY)).toEqual({});
    expect(isDefaultQuery(DEFAULT_CARD_QUERY)).toBe(true);
    expect(isDefaultQuery(queries[1]!)).toBe(false);
  });

  it("drops what it does not know, and canonicalizes a language tag", () => {
    const params = new URLSearchParams("field=colour&state=sleepy&has=wings&sort=size&page=-2&size=7&lang=SV-fi");
    expect(queryFromParams(params)).toEqual({ ...DEFAULT_CARD_QUERY, lang: "sv-fi" });
    expect(queryFromParams(new URLSearchParams("lang=Swedish&page=2.5"))).toEqual(DEFAULT_CARD_QUERY);
  });

  it("sorts by a key ascending, then descending, then not, each time from the first page", () => {
    const paged = { ...DEFAULT_CARD_QUERY, page: 4 };
    const up = nextCardSort(paged, "ease");
    expect(up).toEqual({ ...DEFAULT_CARD_QUERY, sort: { key: "ease", descending: false } });
    const down = nextCardSort({ ...up, page: 2 }, "ease");
    expect(down).toEqual({ ...DEFAULT_CARD_QUERY, sort: { key: "ease", descending: true } });
    expect(nextCardSort(down, "ease")).toEqual(DEFAULT_CARD_QUERY);
    expect(nextCardSort(down, "id")).toEqual({ ...DEFAULT_CARD_QUERY, sort: { key: "id", descending: false } });
  });
});

describe("queryCards", () => {
  it("lists every card in the deck's order, each with the states of its directions and what needs the most work", () => {
    const rows = queryCards(cards, reviews, DEFAULT_CARD_QUERY, TODAY, plain, englishReader, "en");
    expect(rows.map((row) => row.card.id)).toEqual(["c-house", "c-cafe", "c-iron", "c-old", "c-fresh"]);
    expect(rows[0]).toEqual({ card: house, states: [reviews.states[0]], due: "2026-11-01", intervalDays: 30, easeFactor: 2.6 });
    expect(rows[4]).toEqual({ card: fresh, states: [] });
  });

  it("takes, for a card studied both ways, its earliest due day, shortest interval and lowest ease", () => {
    const both: DeckReviews = {
      direction: "bidirectional",
      states: [
        state("c-house", { intervalDays: 30, due: "2026-10-20", easeFactor: 2.1 }),
        state("c-house", { direction: "back-to-front", intervalDays: 2, due: "2026-10-30", easeFactor: 2.7 }),
      ],
    };
    const [row] = queryCards([house], both, DEFAULT_CARD_QUERY, TODAY, plain, englishReader, "en");
    expect(row).toMatchObject({ due: "2026-10-20", intervalDays: 2, easeFactor: 2.1 });
    expect(row!.states).toHaveLength(2);
  });

  it("finds text in any field, case and diacritics aside, reading Markdown as plain text", () => {
    expect(ids({ text: "HUS" })).toEqual(["c-house"]);
    expect(ids({ text: "cafe" })).toEqual(["c-cafe"]);
    // "**Coffee** shop" reads "Coffee shop".
    expect(ids({ text: "coffee shop" })).toEqual(["c-cafe"]);
    expect(ids({ text: "  tea room " })).toEqual(["c-cafe"]);
    expect(ids({ text: "metal" })).toEqual(["c-iron"]);
    expect(ids({ text: "nothing like it" })).toEqual([]);
  });

  it("searches only the field named", () => {
    expect(ids({ text: "hus", field: "front" })).toEqual(["c-house"]);
    expect(ids({ text: "ett hus", field: "front" })).toEqual([]);
    expect(ids({ text: "ett hus", field: "note" })).toEqual(["c-house"]);
    expect(ids({ text: "retired", field: "note" })).toEqual(["c-old"]);
    expect(ids({ text: "noun", field: "label" })).toEqual(["c-house"]);
    expect(ids({ text: "quite", field: "distractor" })).toEqual(["c-cafe"]);
    expect(ids({ text: "house", field: "back" })).toEqual(["c-house"]);
    expect(ids({ text: "metal", field: "back" })).toEqual([]);
  });

  it("keeps the cards with text in a language, a regional one too, or with text whose language is unstated", () => {
    expect(ids({ lang: "sv" })).toEqual(["c-house"]);
    expect(ids({ lang: "en", field: "back" })).toEqual(["c-house", "c-cafe", "c-iron", "c-old", "c-fresh"]);
    expect(ids({ lang: "zxx" })).toEqual(["c-iron"]);
    expect(ids({ lang: "unstated" })).toEqual(["c-old"]);
    // The text is looked for in that language only.
    expect(ids({ lang: "sv", text: "house" })).toEqual([]);
    expect(ids({ lang: "en", text: "ett hus" })).toEqual(["c-house"]);
  });

  it("offers the languages of the cards' sides, an unstated one last", () => {
    expect(cardLanguages(cards)).toEqual(["en", "en-gb", "fr", "sv", "zxx", "unstated"]);
    expect(cardLanguages([house])).toEqual(["en", "sv"]);
  });

  it("keeps the cards in a state", () => {
    expect(ids({ state: "live" })).toEqual(["c-house", "c-cafe", "c-iron", "c-fresh"]);
    expect(ids({ state: "retired" })).toEqual(["c-old"]);
    // A retired card is never new, however it was studied.
    expect(ids({ state: "new" })).toEqual(["c-fresh"]);
    expect(ids({ state: "learning" })).toEqual(["c-cafe"]);
    expect(ids({ state: "young" })).toEqual(["c-iron"]);
    expect(ids({ state: "mature" })).toEqual(["c-house"]);
    expect(ids({ state: "due" })).toEqual(["c-cafe", "c-iron"]);
  });

  it("counts a card studied both ways as new while one way is not yet reviewed", () => {
    expect(ids({ state: "new" }, { ...reviews, direction: "bidirectional" })).toEqual(["c-house", "c-cafe", "c-iron", "c-fresh"]);
  });

  it("keeps the cards with a picture, distractors, Markdown or notes", () => {
    expect(ids({ has: "picture" })).toEqual(["c-iron", "c-fresh"]);
    expect(ids({ has: "distractors" })).toEqual(["c-cafe"]);
    // Only distractors in use count: a card whose only one is retired has none to offer.
    const retiredOnly = card("c-retired", { distractors: [{ id: "c-retired-d1", text: { en: "x" }, retired: true }] });
    const only = queryCards([retiredOnly], reviews, { ...DEFAULT_CARD_QUERY, has: "distractors" }, TODAY, plain, englishReader, "en");
    expect(only).toEqual([]);
    expect(ids({ has: "markdown" })).toEqual(["c-cafe"]);
    expect(ids({ has: "notes" })).toEqual(["c-house", "c-old"]);
  });

  it("sorts by each key either way, cards without it last, ties in the deck's order", () => {
    const sorted = (key: NonNullable<CardQuery["sort"]>["key"], descending = false) => ids({ sort: { key, descending } });
    expect(sorted("id")).toEqual(["c-cafe", "c-fresh", "c-house", "c-iron", "c-old"]);
    expect(sorted("created")).toEqual(["c-iron", "c-cafe", "c-old", "c-fresh", "c-house"]);
    expect(sorted("created", true)).toEqual(["c-house", "c-cafe", "c-old", "c-fresh", "c-iron"]);
    // A picture-only front has no text to sort by.
    expect(sorted("front")).toEqual(["c-cafe", "c-iron", "c-old", "c-house", "c-fresh"]);
    expect(sorted("back")).toEqual(["c-cafe", "c-house", "c-iron", "c-old", "c-fresh"]);
    expect(sorted("due")).toEqual(["c-iron", "c-cafe", "c-house", "c-old", "c-fresh"]);
    expect(sorted("due", true)).toEqual(["c-house", "c-cafe", "c-iron", "c-old", "c-fresh"]);
    expect(sorted("interval")).toEqual(["c-cafe", "c-iron", "c-house", "c-old", "c-fresh"]);
    expect(sorted("ease")).toEqual(["c-cafe", "c-iron", "c-house", "c-old", "c-fresh"]);
  });

  it("sorts a side by the text the reader is shown, as the reader's language sorts it", () => {
    const fruit = [
      card("c-apple", { front: { en: "Apple", sv: "Äpple" } }),
      card("c-zebra", { front: { en: "Zebra", sv: "Zebra" } }),
      card("c-orange", { front: { en: "Orange", sv: "Apelsin" } }),
    ];
    const query: CardQuery = { ...DEFAULT_CARD_QUERY, sort: { key: "front", descending: false } };
    const sorted = (text: (text: LangText) => string, locale: string) =>
      queryCards(fruit, reviews, query, TODAY, plain, text, locale).map((row) => row.card.id);
    const swedishReader = (text: LangText) => shown(text, ["sv"]);
    expect(sorted(englishReader, "en")).toEqual(["c-apple", "c-orange", "c-zebra"]);
    // In Swedish, ä comes after z.
    expect(sorted(swedishReader, "sv")).toEqual(["c-orange", "c-zebra", "c-apple"]);
    expect(sorted(swedishReader, "en")).toEqual(["c-orange", "c-apple", "c-zebra"]);
  });

  it("puts a card without the key last, whichever comes first", () => {
    const query: CardQuery = { ...DEFAULT_CARD_QUERY, sort: { key: "due", descending: false } };
    const sorted = (given: Card[]) => queryCards(given, reviews, query, TODAY, plain, englishReader, "en").map((row) => row.card.id);
    expect(sorted([fresh, iron])).toEqual(["c-iron", "c-fresh"]);
    expect(sorted([iron, fresh])).toEqual(["c-iron", "c-fresh"]);
  });

  it("stays fast over 5,000 cards", () => {
    const many = Array.from({ length: 5_000 }, (_, i) =>
      card(`c-${i}`, {
        front: { sv: `Ord nummer ${i}`, en: `Word number ${i}` },
        back: { en: `**Meaning** ${i}` },
        frontNote: { en: `Note ${i}` },
        textFormat: SM.markdown,
        distractors: [{ id: `d-${i}`, text: { en: `Wrong ${i}` } }],
      }),
    );
    const states: DeckReviews = {
      direction: "bidirectional",
      states: many.map((c, i) => state(c.id, { intervalDays: i % 40, due: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` })),
    };
    const query: CardQuery = { ...DEFAULT_CARD_QUERY, text: "méaning 4", state: "due", sort: { key: "back", descending: true } };
    const started = performance.now();
    const rows = queryCards(many, states, query, TODAY, plain, englishReader, "en");
    const took = performance.now() - started;
    expect(rows.length).toBeGreaterThan(0);
    expect(took).toBeLessThan(500);
  });
});
