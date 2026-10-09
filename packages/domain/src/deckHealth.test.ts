import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { agentUrlOf } from "./agentRecord";
import { distributionUrlOf } from "./dcat";
import type { Card, Deck } from "./deck";
import {
  cardMarkdownProblems,
  cardSpotOf,
  deckHealth,
  deckReport,
  duplicateCardsOf,
  healthProblemCount,
  unstatedSides,
  type DeckTextCheck,
} from "./deckHealth";
import { summarize, type DocumentReport, type Violation } from "./validation";

const CATALOG = "https://pod.example/a/catalog.ttl";
const CARDS = "https://pod.example/a/decks/d.ttl";
const REVIEWS = "https://pod.example/a/reviews/d.ttl";
const deck: Deck = {
  id: "deck-1",
  url: `${CATALOG}#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: ["Ada"],
  description: { en: "Capitals." },
};

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    url: `${CARDS}#${id}`,
    front: { en: id },
    back: { sv: id },
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 5,
    ...extra,
  };
}

const violation: Violation = { message: { en: "Wrong." }, severity: "violation", constraint: "MinCount" };
const checked = (url: string, violations: Violation[] = [violation]) => ({
  url,
  status: "checked" as const,
  shape: "card" as const,
  version: 5,
  violations,
});
const document = (url: string, subjects: DocumentReport["subjects"]): DocumentReport => ({ url, status: "checked", subjects });

/** A check that finds "link" in any text holding "[", saying the rule it was held to. */
const text: DeckTextCheck<{ code: string; rule: string }> = {
  plain: (value) => value.replace(/\*/g, ""),
  check: (value, rule) => (value.includes("[") ? [{ code: "link", rule }] : []),
};

describe("deckReport", () => {
  it("keeps the deck's entry, distribution and authors in the catalog, and its cards and reviews documents", () => {
    const report = summarize("https://pod.example/a/", [
      document(CATALOG, [
        checked(deck.url),
        checked(distributionUrlOf(deck.url)),
        checked(`${CATALOG}#deck-2`),
        checked(distributionUrlOf(`${CATALOG}#deck-2`)),
        checked(agentUrlOf(deck.url, "Ada")),
      ]),
      document(CARDS, [checked(`${CARDS}#c1`)]),
      document(REVIEWS, [checked(`${REVIEWS}#c1`, [])]),
      document("https://pod.example/a/decks/other.ttl", [checked("https://pod.example/a/decks/other.ttl#c1")]),
    ]);
    const scoped = deckReport(report, deck);
    expect(scoped.documents.map((each) => [each.url, each.subjects.map((subject) => subject.url)])).toEqual([
      [CATALOG, [deck.url, distributionUrlOf(deck.url), agentUrlOf(deck.url, "Ada")]],
      [CARDS, [`${CARDS}#c1`]],
      [REVIEWS, [`${REVIEWS}#c1`]],
    ]);
    expect(scoped.violationCount).toBe(4);
    expect(scoped.instanceUrl).toBe("https://pod.example/a/");
  });
});

describe("cardSpotOf", () => {
  const cards = [card("c1", { distractors: [{ id: "c1-d1", text: { sv: "x" } }] }), card("c1-2")];

  it("finds a card's text by its predicate, or the card alone", () => {
    expect(cardSpotOf(deck, cards, `${CARDS}#c1`, SM.backNote)).toEqual({ card: cards[0], place: { tab: "content", part: "backNote" } });
    expect(cardSpotOf(deck, cards, `${CARDS}#c1`, SM.textFormat)).toEqual({ card: cards[0], place: { tab: "content" } });
    expect(cardSpotOf(deck, cards, `${CARDS}#c1`)).toEqual({ card: cards[0], place: { tab: "content" } });
  });

  it("finds a wrong option's card, and its text or note", () => {
    const at = `${CARDS}#c1-d1`;
    expect(cardSpotOf(deck, cards, at, SM.distractorText)).toEqual({ card: cards[0], place: { tab: "distractors", distractor: "c1-d1", part: "text" } });
    expect(cardSpotOf(deck, cards, at, SM.distractorNote)).toEqual({ card: cards[0], place: { tab: "distractors", distractor: "c1-d1", part: "note" } });
    expect(cardSpotOf(deck, cards, at, SM.distractor)).toEqual({ card: cards[0], place: { tab: "distractors", distractor: "c1-d1" } });
  });

  it("finds a review state's card, either way", () => {
    expect(cardSpotOf(deck, cards, `${REVIEWS}#c1`)).toEqual({ card: cards[0], place: { tab: "schedule" } });
    expect(cardSpotOf(deck, cards, `${REVIEWS}#c1-2@back-to-front`)).toEqual({ card: cards[1], place: { tab: "schedule" } });
  });

  it("finds nothing for another subject", () => {
    expect(cardSpotOf(deck, cards, deck.url)).toBeNull();
    expect(cardSpotOf(deck, cards, `${CARDS}#gone`)).toBeNull();
    expect(cardSpotOf(deck, cards, `${REVIEWS}#gone`)).toBeNull();
  });
});

describe("duplicateCardsOf", () => {
  it("groups the cards in use with the same sides in the same languages", () => {
    const cards = [
      card("a", { front: { en: "Paris", fr: "Paris" }, back: { sv: "Frankrike" } }),
      card("b", { front: { fr: "Paris", en: " Paris " }, back: { sv: "Frankrike" } }),
      card("c", { front: { en: "Paris" }, back: { sv: "Frankrike" } }),
      card("d", { front: { de: "Paris" }, back: { sv: "Frankrike" } }),
      card("e", { front: { en: "paris" }, back: { sv: "Frankrike" } }),
      card("f", { front: { en: "Paris" }, back: { sv: "Frankrike" }, retired: true }),
      card("g", { front: { en: "Paris" }, back: { sv: "Frankrike" } }),
    ];
    expect(duplicateCardsOf(cards, text.plain).map((group) => group.map((each) => each.id))).toEqual([
      ["a", "b"],
      ["c", "g"],
    ]);
  });

  it("reads a card in Markdown as its plain text, and tells pictures apart", () => {
    const cards = [
      card("a", { front: { en: "**Paris**" }, textFormat: SM.markdown }),
      card("b", { front: { en: "Paris" } }),
      card("c", { front: { en: "**Paris**" } }),
      card("d", { front: {}, frontImageUrl: "https://example.org/1.png", back: { sv: "x" } }),
      card("e", { front: {}, frontImageUrl: "https://example.org/2.png", back: { sv: "x" } }),
    ];
    expect(duplicateCardsOf(cards.map((each) => ({ ...each, back: { sv: "x" } })), text.plain).map((group) => group.map((each) => each.id))).toEqual([
      ["a", "b"],
    ]);
  });
});

describe("cardMarkdownProblems", () => {
  it("checks each text of a card in Markdown by the rule of its field, its wrong options' too", () => {
    const marked = card("m", {
      textFormat: SM.markdown,
      front: { en: "[a](https://x)", sv: "fine" },
      back: { en: "[b]" },
      backLabel: { en: "[l]" },
      frontNote: { en: "[n]" },
      backNote: { en: "  " },
      distractors: [{ id: "m-d1", text: { en: "[o]" }, note: { en: "[why]" } }, { id: "m-d2", text: { en: "ok" } }],
    });
    const plain = card("p", { front: { en: "[a]" } });
    const retired = card("r", { textFormat: SM.markdown, front: { en: "[a]" }, retired: true });
    expect(cardMarkdownProblems([plain, marked, retired], text.check).map(({ card, place, language, finding }) => [card.id, place, language, finding.rule])).toEqual([
      ["m", { tab: "content", part: "front" }, "en", "side"],
      ["m", { tab: "content", part: "back" }, "en", "option"],
      ["m", { tab: "content", part: "backLabel" }, "en", "side"],
      ["m", { tab: "content", part: "frontNote" }, "en", "prose"],
      ["m", { tab: "distractors", distractor: "m-d1", part: "text" }, "en", "option"],
      ["m", { tab: "distractors", distractor: "m-d1", part: "note" }, "en", "prose"],
    ]);
  });

  it("holds the back of a card without wrong options as a side", () => {
    const marked = card("m", { textFormat: SM.markdown, back: { en: "[b]" } });
    expect(cardMarkdownProblems([marked], text.check).map(({ finding }) => finding.rule)).toEqual(["side"]);
  });
});

describe("unstatedSides", () => {
  it("lists the untagged sides, but not of a card still as its release has it", () => {
    const cards = [card("a", { front: { "": "x" }, back: { "": "y" } }), card("b", { back: { "": "z" } }), card("c", { front: { "": "w" } })];
    const release = [card("c", { front: { "": "w" } })];
    expect(unstatedSides(cards, release).map(({ card, place }) => [card.id, place])).toEqual([
      ["a", { tab: "content", part: "front" }],
      ["a", { tab: "content", part: "back" }],
      ["b", { tab: "content", part: "back" }],
    ]);
    expect(unstatedSides(cards)).toHaveLength(4);
  });
});

describe("deckHealth", () => {
  const report = summarize("https://pod.example/a/", [document(CARDS, [checked(`${CARDS}#a`)])]);
  const cards = [
    card("a", { front: { "": "x" }, back: { sv: "y" } }),
    card("b", { front: { "": "x" }, back: { sv: "y" } }),
    card("c", { textFormat: SM.markdown, front: { en: "[x]" } }),
  ];

  it("gathers every problem of the deck, and counts them", () => {
    const health = deckHealth(deck, report, cards, [], text);
    expect(health.report.violationCount).toBe(1);
    expect(health.unstated).toHaveLength(2);
    expect(health.duplicates.map((group) => group.map((each) => each.id))).toEqual([["a", "b"]]);
    expect(health.markdown).toHaveLength(1);
    expect(healthProblemCount(health)).toBe(5);
  });

  it("does not know which sides to settle when the release could not be read", () => {
    const health = deckHealth(deck, report, cards, undefined, text);
    expect(health.unstated).toBeNull();
    expect(healthProblemCount(health)).toBe(3);
  });
});
