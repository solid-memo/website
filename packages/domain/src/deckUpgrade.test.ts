import { describe, expect, it } from "vitest";
import type { Card, Deck } from "./deck";
import type { LibraryCard } from "./library";
import type { LibraryUpgradePlan } from "./libraryUpgrade";
import {
  DECK_UPGRADE_STEPS,
  sameCardChanges,
  sameDeckState,
  isCardsDocumentOf,
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
  applied: [],
  gone: [],
  appliedAbout: [],
};

describe("DECK_UPGRADE_STEPS", () => {
  it("are the steps the user sees, in the order the upgrade writes: its cards, its review states, its entry last", () => {
    expect(DECK_UPGRADE_STEPS).toEqual(["read", "cards", "reviews", "entry"]);
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
  it("takes a text in several languages, listed in another order, as unchanged", () => {
    const current = { ...deck, title: { en: "Capitals", sv: "Huvudstäder" } };
    const stored = { ...current, title: { en: "Capitals", sv: "Huvudstäder", fi: "Pääkaupungit" } };
    expect(withDeckChanges(stored, current, { ...current, title: { sv: "Huvudstäder", en: "Capitals" } })).toEqual(stored);
  });

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
