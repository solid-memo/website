// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card, type Deck } from "./deck";
import {
  isDeckOutdated,
  isInstanceOutdated,
  isOutdated,
  isPlanEmpty,
  isPreferencesOutdated,
  isReviewStateOutdated,
  planMigration,
  upgradeCard,
  upgradeDeck,
  upgradeReviewState,
} from "./migration";
import { DEFAULT_PREFERENCES, PREFERENCES_FORMAT_VERSION } from "./preferences";
import { REVIEW_STATE_FORMAT_VERSION, type ReviewState } from "./review";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: DECK_FORMAT_VERSION,
  authors: [],
};
const oldDeck: Deck = { ...deck, formatVersion: 1 };

function card(id: string, formatVersion: number): Card {
  return {
    id,
    url: `${deck.cardsDocumentUrl}#${id}`,
    front: { "": id },
    back: { "": `${id} back` },
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion,
  };
}

describe("isOutdated", () => {
  it("is true below the current card format only", () => {
    expect(isOutdated(card("a", 1))).toBe(true);
    expect(isOutdated(card("a", CARD_FORMAT_VERSION))).toBe(false);
    expect(isOutdated(card("a", CARD_FORMAT_VERSION + 1))).toBe(false);
  });
});

describe("upgradeCard", () => {
  it("moves a format-1 card to the current format without touching its content", () => {
    expect(upgradeCard(card("a", 1))).toEqual({
      ...card("a", 1),
      formatVersion: CARD_FORMAT_VERSION,
    });
  });

  it("returns a current or newer card unchanged", () => {
    const current = card("a", CARD_FORMAT_VERSION);
    expect(upgradeCard(current)).toBe(current);
    const newer = card("a", CARD_FORMAT_VERSION + 1);
    expect(upgradeCard(newer)).toBe(newer);
  });
});

describe("isDeckOutdated", () => {
  it("is true below the current deck format only", () => {
    expect(isDeckOutdated(oldDeck)).toBe(true);
    expect(isDeckOutdated(deck)).toBe(false);
    expect(isDeckOutdated({ ...deck, formatVersion: DECK_FORMAT_VERSION + 1 })).toBe(false);
  });
});

describe("upgradeDeck", () => {
  it("moves a format-1 deck to the current format, keeping its direction", () => {
    expect(upgradeDeck(oldDeck)).toEqual({
      ...oldDeck,
      formatVersion: DECK_FORMAT_VERSION,
    });
    expect(upgradeDeck({ ...oldDeck, direction: "bidirectional" }).direction).toBe("bidirectional");
  });

  it("returns a current or newer deck unchanged", () => {
    expect(upgradeDeck(deck)).toBe(deck);
    const newer = { ...deck, formatVersion: DECK_FORMAT_VERSION + 1 };
    expect(upgradeDeck(newer)).toBe(newer);
  });
});

function review(cardId: string, formatVersion: number): ReviewState {
  return {
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-09-22",
    firstReviewedAt: "2026-09-21T10:00:00.000Z",
    lastReviewedAt: "2026-09-21T10:00:00.000Z",
    formatVersion,
  };
}

describe("review states, preferences and the instance record", () => {
  it("are outdated below the current format only", () => {
    expect(isReviewStateOutdated(review("a", 1))).toBe(true);
    expect(isReviewStateOutdated(review("a", 2))).toBe(false);
    expect(upgradeReviewState(review("a", 1))).toEqual(review("a", 2));
    const current = review("a", 3);
    expect(upgradeReviewState(current)).toBe(current);
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 1 })).toBe(
      true,
    );
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 2 })).toBe(
      true,
    );
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 3 })).toBe(
      true,
    );
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 4 })).toBe(
      true,
    );
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 5 })).toBe(
      true,
    );
    expect(isPreferencesOutdated({ preferences: DEFAULT_PREFERENCES, formatVersion: 6 })).toBe(
      false,
    );
    expect(isInstanceOutdated({ name: "Main", createdAt: "", formatVersion: 0 })).toBe(true);
    expect(isInstanceOutdated({ name: "Main", createdAt: "", formatVersion: 1 })).toBe(true);
    expect(isInstanceOutdated({ name: "Main", createdAt: "", formatVersion: 2 })).toBe(false);
  });
});

const catalog = {
  title: "Main",
  description: "Mine.",
  publisher: { webId: "https://a.example/#me", name: "A" },
};
const nothingElse = { instance: null, preferences: null, catalog };

describe("planMigration", () => {
  it("lists the decks with an outdated entry, cards or review states, counting each", () => {
    const other: Deck = { ...deck, id: "deck-2", url: `${deck.url}2` };
    const oldEntry: Deck = { ...oldDeck, id: "deck-3", url: `${deck.url}3` };
    const upToDate: Deck = { ...deck, id: "deck-4", url: `${deck.url}4` };
    const oldReviews: Deck = { ...deck, id: "deck-5", url: `${deck.url}5` };
    expect(
      planMigration({
        ...nothingElse,
        entries: [
          {
            deck,
            cards: [card("a", 5), card("b", CARD_FORMAT_VERSION), card("c", 1)],
            reviews: [review("a", 1)],
          },
          { deck: other, cards: [card("d", 1)], reviews: [] },
          { deck: oldEntry, cards: [card("e", CARD_FORMAT_VERSION)], reviews: [review("e", 2)] },
          { deck: upToDate, cards: [card("f", CARD_FORMAT_VERSION)], reviews: [] },
          { deck: oldReviews, cards: [], reviews: [review("g", 1), review("h", 1)] },
        ],
      }),
    ).toEqual({
      decks: [
        { deck, deckOutdated: false, cardCount: 2, reviewCount: 1 },
        { deck: other, deckOutdated: false, cardCount: 1, reviewCount: 0 },
        { deck: oldEntry, deckOutdated: true, cardCount: 0, reviewCount: 0 },
        { deck: oldReviews, deckOutdated: false, cardCount: 0, reviewCount: 2 },
      ],
      deckCount: 1,
      cardCount: 3,
      reviewCount: 3,
      preferencesOutdated: false,
      instanceOutdated: false,
      catalogMissing: false,
      oldestFormat: {
        deck: oldDeck.formatVersion,
        card: 1,
        reviewState: 1,
        preferences: PREFERENCES_FORMAT_VERSION,
      },
    });
  });

  it("names the oldest outdated format of each kind, whatever newer data sits beside it", () => {
    const newer: Deck = { ...deck, formatVersion: DECK_FORMAT_VERSION + 1 };
    const plan = planMigration({
      instance: null,
      preferences: { preferences: DEFAULT_PREFERENCES, formatVersion: 4 },
      catalog,
      entries: [
        {
          deck: newer,
          cards: [card("a", CARD_FORMAT_VERSION + 1), card("b", 6), card("c", 4)],
          reviews: [],
        },
      ],
    });
    expect(plan.oldestFormat).toEqual({
      deck: DECK_FORMAT_VERSION,
      card: 4,
      reviewState: REVIEW_STATE_FORMAT_VERSION,
      preferences: 4,
    });
  });

  it("notices outdated preferences and instance records", () => {
    const plan = planMigration({
      instance: { name: "Main", createdAt: "", formatVersion: 0 },
      preferences: { preferences: DEFAULT_PREFERENCES, formatVersion: 1 },
      catalog,
      entries: [],
    });
    expect(plan).toMatchObject({ preferencesOutdated: true, instanceOutdated: true });
    expect(isPlanEmpty(plan)).toBe(false);
    expect(
      isPlanEmpty(
        planMigration({
          instance: { name: "Main", createdAt: "", formatVersion: 2 },
          preferences: { preferences: DEFAULT_PREFERENCES, formatVersion: 6 },
          catalog,
          entries: [],
        }),
      ),
    ).toBe(true);
  });

  it("is empty when everything is current or absent", () => {
    const plan = planMigration({
      ...nothingElse,
      entries: [{ deck, cards: [card("a", CARD_FORMAT_VERSION)], reviews: [review("a", 2)] }],
    });
    expect(plan).toEqual({
      decks: [],
      deckCount: 0,
      cardCount: 0,
      reviewCount: 0,
      preferencesOutdated: false,
      instanceOutdated: false,
      catalogMissing: false,
      oldestFormat: {
        deck: DECK_FORMAT_VERSION,
        card: CARD_FORMAT_VERSION,
        reviewState: REVIEW_STATE_FORMAT_VERSION,
        preferences: PREFERENCES_FORMAT_VERSION,
      },
    });
    expect(isPlanEmpty(plan)).toBe(true);
    expect(isPlanEmpty(planMigration({ ...nothingElse, entries: [] }))).toBe(true);
  });

  it("notices an instance without a catalog", () => {
    const plan = planMigration({ ...nothingElse, catalog: null, entries: [] });
    expect(plan.catalogMissing).toBe(true);
    expect(isPlanEmpty(plan)).toBe(false);
  });
});
