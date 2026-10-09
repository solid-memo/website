import { describe, expect, it } from "vitest";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card, type Deck } from "./deck";
import {
  deckFileBaseOf,
  deckFileFormatOf,
  deckFileName,
  hasProgress,
  importedDeck,
  type DeckFileContent,
} from "./deckFile";
import type { ReviewState } from "./review";

const POD = "https://pod.example/solid-memo/";
const INSTANCE = "https://other.example/memo/";

function deck(id: string, extra: Partial<Deck> = {}): Deck {
  return {
    id,
    url: `${POD}catalog.ttl#${id}`,
    title: { en: "Capitals" },
    cardsDocumentUrl: `${POD}decks/${id}.ttl`,
    reviewsDocumentUrl: `${POD}reviews/${id}.ttl`,
    createdAt: "2025-01-02T03:04:05.000Z",
    formatVersion: 3,
    direction: "front-to-back",
    authors: [],
    ...extra,
  };
}

const card: Card = {
  id: "card-1",
  url: `${POD}decks/deck-a.ttl#card-1`,
  front: { en: "Sweden" },
  back: { en: "Stockholm" },
  createdAt: "2025-01-03T00:00:00.000Z",
  formatVersion: 2,
  retired: true,
};

const state: ReviewState = {
  cardId: "card-1",
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 3,
  repetitions: 2,
  due: "2025-02-01",
  firstReviewedAt: "2025-01-04T00:00:00.000Z",
  lastReviewedAt: "2025-01-29T00:00:00.000Z",
  formatVersion: 2,
};

function content(extra: Partial<DeckFileContent> = {}): DeckFileContent {
  return { deck: deck("deck-a", { completedChapters: ["https://lib.example/c.ttl#ch1"] }), cards: [card], reviews: [state], upgraded: [], dropped: [], ...extra };
}

const options = { withProgress: true, decks: [], freshId: "deck-fresh", now: "2026-10-10T00:00:00.000Z" };

describe("deckFileFormatOf", () => {
  it("goes by the extension, whatever its case", () => {
    expect(deckFileFormatOf("a.TTL", "{")).toBe("turtle");
    expect(deckFileFormatOf("a.jsonld", "@prefix")).toBe("jsonld");
    expect(deckFileFormatOf("a.json", "")).toBe("jsonld");
  });

  it("goes by the text when the name says nothing", () => {
    expect(deckFileFormatOf("deck", '  {"@graph": []}')).toBe("jsonld");
    expect(deckFileFormatOf("deck", "[]")).toBe("jsonld");
    expect(deckFileFormatOf("deck", "@prefix sm: <x#> .")).toBe("turtle");
  });
});

describe("deckFileBaseOf", () => {
  it("puts the file's name under the base, escaped", () => {
    expect(deckFileBaseOf("my deck.ttl")).toBe("https://file.solid-memo.invalid/my%20deck.ttl");
  });
});

describe("deckFileName", () => {
  it("names the file after the deck's English title, accents dropped", () => {
    expect(deckFileName(deck("d", { title: { sv: "Städer", en: "Capitals of Europe!" } }), "turtle")).toBe("capitals-of-europe.ttl");
    expect(deckFileName(deck("d", { title: { sv: "Städer i Sverige" } }), "jsonld")).toBe("stader-i-sverige.jsonld");
  });

  it("keeps it short, and names it deck when nothing is left", () => {
    expect(deckFileName(deck("d", { title: { ja: "日本" } }), "turtle")).toBe("deck.ttl");
    const long = deckFileName(deck("d", { title: { en: `${"a".repeat(59)} b` } }), "turtle");
    expect(long).toBe(`${"a".repeat(59)}.ttl`);
  });
});

describe("importedDeck", () => {
  it("keeps the file's deck id, with the instance's own documents, and the progress when asked", () => {
    const { deck: imported, cards, reviews } = importedDeck(INSTANCE, content(), options);
    expect(imported).toMatchObject({
      id: "deck-a",
      url: `${INSTANCE}catalog.ttl#deck-a`,
      cardsDocumentUrl: `${INSTANCE}decks/deck-a.ttl`,
      reviewsDocumentUrl: `${INSTANCE}reviews/deck-a.ttl`,
      createdAt: "2025-01-02T03:04:05.000Z",
      formatVersion: DECK_FORMAT_VERSION,
      completedChapters: ["https://lib.example/c.ttl#ch1"],
    });
    expect(cards).toEqual([{ ...card, url: `${INSTANCE}decks/deck-a.ttl#card-1`, formatVersion: CARD_FORMAT_VERSION }]);
    expect(reviews).toEqual([state]);
  });

  it("leaves the progress out unless asked", () => {
    const { deck: imported, reviews } = importedDeck(INSTANCE, content(), { ...options, withProgress: false });
    expect(imported.completedChapters).toBeUndefined();
    expect(reviews).toEqual([]);
    const withNone = importedDeck(INSTANCE, content({ deck: deck("deck-a"), reviews: undefined }), options);
    expect(withNone.deck.completedChapters).toBeUndefined();
    expect(withNone.reviews).toEqual([]);
  });

  it("gives the deck a fresh id when the instance has one by its id, or uses a document of its name", () => {
    const same = deck("deck-a", { url: `${INSTANCE}catalog.ttl#deck-a` });
    expect(importedDeck(INSTANCE, content(), { ...options, decks: [same] }).deck.id).toBe("deck-fresh");
    const other = deck("deck-b", { reviewsDocumentUrl: `${INSTANCE}reviews/deck-a.ttl` });
    const imported = importedDeck(INSTANCE, content(), { ...options, decks: [other] }).deck;
    expect(imported).toMatchObject({ id: "deck-fresh", cardsDocumentUrl: `${INSTANCE}decks/deck-fresh.ttl` });
  });

  it("gives the deck a fresh id when its own is none this app would give", () => {
    expect(importedDeck(INSTANCE, content({ deck: deck("a b") }), options).deck.id).toBe("deck-fresh");
  });

  it("gives the deck a fresh id when its id is another subject of the catalog document", () => {
    for (const id of ["catalog", "group-g", "agent-1", "card-1"]) {
      expect(importedDeck(INSTANCE, content({ deck: deck(id) }), options).deck.id).toBe("deck-fresh");
    }
    // A deck's distribution, and a deck whose id is the file deck's distribution.
    const owner = deck("deck-b");
    expect(importedDeck(INSTANCE, content({ deck: deck("deck-b-cards") }), { ...options, decks: [owner] }).deck.id).toBe(
      "deck-fresh",
    );
    const named = deck("deck-a-cards");
    expect(importedDeck(INSTANCE, content(), { ...options, decks: [named] }).deck.id).toBe("deck-fresh");
  });

  it("creates a deck the file gives no creation time of now", () => {
    expect(importedDeck(INSTANCE, content({ deck: deck("deck-a", { createdAt: "" }) }), options).deck.createdAt).toBe(options.now);
  });
});

describe("hasProgress", () => {
  it("is review states or completed chapters", () => {
    expect(hasProgress(content())).toBe(true);
    expect(hasProgress(content({ reviews: undefined }))).toBe(true);
    expect(hasProgress(content({ deck: deck("deck-a"), reviews: [] }))).toBe(false);
    expect(hasProgress(content({ deck: deck("deck-a", { completedChapters: [] }), reviews: undefined }))).toBe(false);
  });
});
