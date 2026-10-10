import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card, Deck } from "../deck.ts";
import { DRAFT, NOW } from "../testing/releaseDraft.ts";
import { deckToDraft } from "./deckToDraft.ts";

const INSTANCE = "https://pod.example/solid-memo/main/";

const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE}catalog.ttl#deck-1`,
  title: { en: "Capitals", "": "Old" },
  description: { en: "Capitals of the world.", "": "untagged" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  createdAt: "2026-01-01T00:00:00.000Z",
  formatVersion: 6,
  direction: "bidirectional",
  authors: ["Alice <alice@example.org>", "Bob"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
  themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
  keywords: { en: ["capitals"], "": ["kept"] },
  newCardsPerDay: 5,
  maxReviewsPerDay: 50,
  completedChapters: ["https://solid-memo.com/decks/capitals/v1.ttl#ch-a"],
};

const cards: Card[] = [
  {
    id: "turtle",
    url: `${deck.cardsDocumentUrl}#turtle`,
    front: { en: "Sweden" },
    back: { en: "Stockholm" },
    createdAt: "2026-01-02T00:00:00.000Z",
    formatVersion: 5,
    distractors: [{ id: "turtle-d1", text: { en: "Oslo" }, retired: true }],
  },
  { id: "c2", url: `${deck.cardsDocumentUrl}#c2`, front: { en: "Norway" }, back: { en: "Oslo" }, createdAt: "", formatVersion: 4, retired: true },
];

describe("deckToDraft", () => {
  it("keeps what a release says the deck does too, in a stated language", () => {
    const { draft } = deckToDraft(deck, cards, DRAFT, NOW);
    expect(draft.course).toBe(false);
    expect(draft.root).toEqual({
      title: { en: "Capitals" },
      description: { en: "Capitals of the world." },
      created: NOW,
      creator: [`${DRAFT}#agent-alice-alice-example-org`, `${DRAFT}#agent-bob`],
      publisher: `${DRAFT}#agent-alice-alice-example-org`,
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      studyDirection: SM.bidirectional,
      theme: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
      keyword: { en: ["capitals"] },
      language: [],
      version: "1",
      inSeries: `${DRAFT}#series`,
      isVersionOf: `${DRAFT}#series`,
      distribution: [`${DRAFT}#turtle-2`],
      wasDerivedFrom: [],
    });
    expect(draft.agents).toEqual([
      { id: "agent-alice-alice-example-org", data: { name: "Alice", mbox: "mailto:alice@example.org" } },
      { id: "agent-bob", data: { name: "Bob" } },
    ]);
  });

  it("keeps every card under its id, retired ones too, with its wrong options", () => {
    const { draft } = deckToDraft(deck, cards, DRAFT, NOW);
    expect(draft.cards).toEqual([
      {
        id: "turtle",
        data: { front: { en: "Sweden" }, back: { en: "Stockholm" }, created: "2026-01-02T00:00:00.000Z", distractor: [`${DRAFT}#turtle-d1`] },
      },
      { id: "c2", data: { front: { en: "Norway" }, back: { en: "Oslo" }, deprecated: true, distractor: [] } },
    ]);
    expect(draft.distractors).toEqual([{ id: "turtle-d1", data: { text: { en: "Oslo" }, deprecated: true } }]);
    expect(draft.distributions[0]!.id).toBe("turtle-2");
  });

  it("never makes the release a deck was copied from a source of the draft: it is what the deck is based on", () => {
    const { draft, basedOn } = deckToDraft(deck, cards, DRAFT, NOW);
    expect(basedOn).toBe("https://solid-memo.com/decks/capitals/v1.ttl");
    expect(draft.root.wasDerivedFrom).toEqual([]);
    expect(draft.triples).toEqual([]);
  });

  it("names no publisher, nothing a deck does not state, and nothing it is based on, for a deck of the user's own", () => {
    const own: Deck = { ...deck, authors: [], sourceUrl: undefined, description: undefined, license: undefined, themes: undefined, keywords: undefined, direction: "front-to-back" };
    const result = deckToDraft(own, [], DRAFT, NOW);
    expect(result).toEqual({ draft: expect.anything() });
    expect(result.draft.root).not.toHaveProperty("publisher");
    expect(result.draft.root).not.toHaveProperty("description");
    expect(result.draft.root).toMatchObject({ creator: [], theme: [], keyword: {}, studyDirection: SM.frontToBack });
  });
});
