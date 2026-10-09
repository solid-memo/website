import { describe, expect, it } from "vitest";
import type { Card, Deck } from "./deck";
import type { LibraryCard } from "./library";
import type { LibraryUpgradePlan } from "./libraryUpgrade";
import type { ReviewState } from "./review";
import {
  decodeDeckUpgradeNote,
  encodeDeckUpgradeNote,
  isAbandoned,
  sameCardChanges,
  sameCards,
  sameDeckState,
  sameReviewStates,
  isCardsDocumentOf,
  stagedDocumentUrl,
  upgradedCardList,
  withDeckChanges,
} from "./deckUpgrade";

const CARDS = "https://pod.example/a/decks/deck-1.ttl";

const podCard = (id: string, back: string, retired?: true): Card => ({
  id,
  url: `${CARDS}#${id}`,
  front: { "": id },
  back: { "": back },
  createdAt: "",
  formatVersion: 4,
  ...(retired === undefined ? {} : { retired }),
});
const libraryCard = (id: string, back: string): LibraryCard => ({ id, front: { "": id }, back: { "": back }, formatVersion: 4 });

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/a/catalog.ttl#deck-1",
  title: { en: "Capitals" },
  description: { en: "Capitals of the world." },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: "https://pod.example/a/reviews/deck-1.ttl",
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: [],
  sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
};

const plan: LibraryUpgradePlan = {
  fromVersion: "1",
  toVersion: "2",
  releaseUrl: "https://solid-memo.com/decks/capitals/v2.ttl",
  notes: [],
  add: [libraryCard("no", "Oslo")],
  change: [libraryCard("se", "Stockholm")],
  retire: [podCard("dk", "Copenhagen")],
  restore: [podCard("is", "Reykjavik", true)],
  remove: [podCard("lv", "Riga")],
  kept: [],
};

describe("stagedDocumentUrl", () => {
  it("names a new document beside the old one by the deck and the upgrade, however often it was upgraded", () => {
    expect(stagedDocumentUrl(CARDS, "deck-1", "u1")).toBe("https://pod.example/a/decks/deck-1-u1.ttl");
    expect(stagedDocumentUrl("https://pod.example/a/decks/deck-1-u1.ttl", "deck-1", "u2")).toBe(
      "https://pod.example/a/decks/deck-1-u2.ttl",
    );
  });
});

describe("isCardsDocumentOf", () => {
  const deck = { id: "deck-1", cardsDocumentUrl: "https://pod.example/a/decks/deck-1-u2.ttl" };

  it("is the deck's cards document, or one beside it an upgrade or the deck's creation named", () => {
    expect(isCardsDocumentOf(deck.cardsDocumentUrl, deck)).toBe(true);
    expect(isCardsDocumentOf(CARDS, deck)).toBe(true);
    expect(isCardsDocumentOf("https://pod.example/a/decks/deck-1-u1.ttl", deck)).toBe(true);
  });

  it("is not another deck's, one elsewhere, or one in a container below", () => {
    expect(isCardsDocumentOf("https://pod.example/a/decks/deck-10.ttl", deck)).toBe(false);
    expect(isCardsDocumentOf("https://pod.example/a/decks/deck-2.ttl", deck)).toBe(false);
    expect(isCardsDocumentOf("https://pod.example/b/decks/deck-1.ttl", deck)).toBe(false);
    expect(isCardsDocumentOf("https://pod.example/a/decks/deck-1-x/y.ttl", deck)).toBe(false);
    expect(isCardsDocumentOf("https://pod.example/a/decks/deck-1-u1.json", deck)).toBe(false);
  });
});

describe("deck upgrade notes", () => {
  const startedAt = "2026-10-03T10:00:00.000Z";

  it("round-trip, with or without a reviews move", () => {
    const note = { startedAt, cards: { from: "a", to: "b" }, reviews: { from: "c", to: "d" } };
    expect(decodeDeckUpgradeNote(encodeDeckUpgradeNote(note))).toEqual(note);
    expect(decodeDeckUpgradeNote(encodeDeckUpgradeNote({ startedAt, cards: note.cards }))).toEqual({ startedAt, cards: note.cards });
  });

  it("are null when missing or not a note", () => {
    expect(decodeDeckUpgradeNote(null)).toBeNull();
    expect(decodeDeckUpgradeNote("{")).toBeNull();
    expect(decodeDeckUpgradeNote("null")).toBeNull();
    const cards = { from: "a", to: "b" };
    expect(decodeDeckUpgradeNote(JSON.stringify({ cards }))).toBeNull();
    expect(decodeDeckUpgradeNote(JSON.stringify({ startedAt, cards: { from: "a" } }))).toBeNull();
    expect(decodeDeckUpgradeNote(JSON.stringify({ startedAt, cards, reviews: 1 }))).toBeNull();
  });

  it("count as left behind once an upgrade would long be over, or when they say no time", () => {
    const note = { startedAt, cards: { from: "a", to: "b" } };
    expect(isAbandoned(note, new Date("2026-10-03T10:09:59.000Z"))).toBe(false);
    expect(isAbandoned(note, new Date("2026-10-03T10:10:00.000Z"))).toBe(true);
    expect(isAbandoned({ ...note, startedAt: "soon" }, new Date(startedAt))).toBe(true);
  });
});

describe("upgradedCardList", () => {
  it("applies every change of the plan to the deck's cards, leaving the rest", () => {
    const cards = [
      podCard("se", "Stockholm?"),
      podCard("dk", "Copenhagen"),
      podCard("is", "Reykjavik", true),
      podCard("lv", "Riga"),
      podCard("fi", "Helsinki"),
    ];
    const list = upgradedCardList(cards, plan);
    expect(list.map((card) => card.id).sort()).toEqual(["dk", "fi", "is", "no", "se"]);
    expect(sameCards(list, [
      podCard("se", "Stockholm"),
      podCard("dk", "Copenhagen", true),
      podCard("is", "Reykjavik"),
      podCard("fi", "Helsinki"),
      podCard("no", "Oslo"),
    ])).toBe(true);
  });
});

describe("sameCards", () => {
  const cards = [podCard("se", "Stockholm"), podCard("dk", "Copenhagen", true)];

  it("holds for the same cards in any order", () => {
    expect(sameCards(cards, [...cards].reverse())).toBe(true);
  });

  it("fails on a card missing, extra, other, of other content or retirement", () => {
    expect(sameCards(cards, cards.slice(1))).toBe(false);
    expect(sameCards(cards, [cards[0], podCard("no", "Oslo")])).toBe(false);
    expect(sameCards(cards, [podCard("se", "Stockholm!"), cards[1]])).toBe(false);
    expect(sameCards(cards, [cards[0], podCard("dk", "Copenhagen")])).toBe(false);
  });
});

describe("sameReviewStates", () => {
  const state = (cardId: string, due: string): ReviewState => ({
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: "2026-10-01T00:00:00.000Z",
    lastReviewedAt: "2026-10-01T00:00:00.000Z",
    formatVersion: 2,
  });

  it("holds for the same states in any order, their keys in any order", () => {
    const { due, ...rest } = state("b", "2026-10-02");
    expect(sameReviewStates([state("a", "2026-10-02"), state("b", "2026-10-02")], [{ due, ...rest }, state("a", "2026-10-02")])).toBe(true);
    expect(sameReviewStates([], [])).toBe(true);
  });

  it("fails when a state differs, or one is missing", () => {
    expect(sameReviewStates([state("a", "2026-10-02")], [state("a", "2026-10-03")])).toBe(false);
    expect(sameReviewStates([state("a", "2026-10-02")], [])).toBe(false);
  });
});

describe("sameCardChanges", () => {
  it("holds for plans changing the same cards alike, whatever they say of the deck's texts", () => {
    expect(sameCardChanges(plan, { ...plan, title: { en: "Capitals", sv: "Huvudstäder" }, add: [...plan.add] })).toBe(true);
  });

  it("fails on another release, direction or set of cards", () => {
    expect(sameCardChanges(plan, { ...plan, releaseUrl: "other" })).toBe(false);
    expect(sameCardChanges(plan, { ...plan, direction: "bidirectional" })).toBe(false);
    expect(sameCardChanges(plan, { ...plan, remove: [] })).toBe(false);
    expect(sameCardChanges(plan, { ...plan, add: [libraryCard("ax", "Mariehamn"), ...plan.add] })).toBe(false);
  });
});

describe("sameDeckState", () => {
  it("holds when only what an upgrade leaves alone changed", () => {
    expect(sameDeckState(deck, { ...deck, keywords: { en: ["geography"] } })).toBe(true);
  });

  it("fails when where its documents are, its release, direction, title or description changed", () => {
    for (const changed of [
      { url: "other" },
      { cardsDocumentUrl: "other" },
      { reviewsDocumentUrl: "other" },
      { sourceUrl: undefined },
      { direction: "bidirectional" as const },
      { title: { en: "Mine" } },
      { description: undefined },
    ]) {
      expect(sameDeckState(deck, { ...deck, ...changed })).toBe(false);
    }
  });
});

describe("withDeckChanges", () => {
  it("writes what the upgrade changes onto the deck as stored, keeping changes made meanwhile", () => {
    const next = { ...deck, sourceUrl: plan.releaseUrl, cardsDocumentUrl: "new", title: { en: "Capitals" } };
    const stored = { ...deck, keywords: { en: ["geography"] } };
    expect(withDeckChanges(stored, deck, next)).toEqual({
      ...deck,
      keywords: { en: ["geography"] },
      sourceUrl: plan.releaseUrl,
      cardsDocumentUrl: "new",
    });
  });
});
