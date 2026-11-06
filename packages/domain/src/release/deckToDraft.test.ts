// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card, Deck } from "../deck.ts";
import { growth } from "../testing/growth.ts";
import { LONG_SUBJECT, longNames, namesOf } from "../testing/longAgents.ts";
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
  cardLanguage: "sv",
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
    subjects: ["http://www.wikidata.org/entity/Q34"],
  },
  {
    id: "c2",
    url: `${deck.cardsDocumentUrl}#c2`,
    front: { en: "Norway" },
    back: { en: "Oslo" },
    createdAt: "",
    formatVersion: 4,
    retired: true,
  },
];

describe("deckToDraft", () => {
  describe("with an agent IRI longer than a term may be (GHSA-4mgg-5xpp-3jx5)", () => {
    const LONG_URL = LONG_SUBJECT.slice(0, LONG_SUBJECT.indexOf("#"));
    const refused = expect.objectContaining({ code: "termTooLong", vars: { limit: 16_383 } });
    /** A name that makes the agent's IRI in the draft `length` characters long. */
    const nameFor = (length: number) => "a".repeat(length - `${DRAFT}#agent-`.length);

    it("keeps the longest a document holds, and refuses one more", () => {
      const named = (authors: string[]) => deckToDraft({ ...deck, authors }, [], DRAFT, NOW);
      expect(named([nameFor(16_381)]).draft.root.creator[0]).toHaveLength(16_381);
      expect(() => named([nameFor(16_382)])).toThrow(refused);
    });

    it.each([
      { variant: "a long draft address", url: LONG_URL, authors: (n: number) => namesOf(n, 24) },
      { variant: "long names", url: DRAFT, authors: longNames },
      {
        variant: "names that make long ids",
        url: DRAFT,
        authors: (n: number) => namesOf(n, 16_381),
      },
    ])(
      "refuses it, in time that grows with the authors, not their square, with $variant",
      {
        timeout: 180_000,
      },
      ({ url, authors }) => {
        expect(() => deckToDraft({ ...deck, authors: authors(3) }, [], url, NOW)).toThrow(refused);
        const ratio = growth(
          (count) => {
            const long = { ...deck, authors: authors(count) };
            return () => {
              try {
                deckToDraft(long, [], url, NOW);
              } catch {
                return;
              }
            };
          },
          250,
          8,
        );
        expect(ratio).toBeLessThan(4);
      },
    );
  });

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
      theme: [
        "https://solid-memo.com/ns/vocab/topics.ttl#geography",
        "http://publications.europa.eu/resource/authority/data-theme/EDUC",
      ],
      keyword: { en: ["capitals"] },
      language: [],
      version: "1",
      inSeries: `${DRAFT}#series`,
      isVersionOf: `${DRAFT}#series`,
      distribution: [`${DRAFT}#turtle-2`],
      wasDerivedFrom: [],
    });
    expect(draft.agents).toEqual([
      {
        id: "agent-alice-alice-example-org",
        data: { name: "Alice", mbox: "mailto:alice@example.org" },
      },
      { id: "agent-bob", data: { name: "Bob" } },
    ]);
  });

  it("keeps two authors whose names fold alike two agents", () => {
    const authors = ["Jane Doe <jane@example.org>", "Jane Doe <jane@exämple.org>"];
    const { draft } = deckToDraft({ ...deck, authors }, [], DRAFT, NOW);
    expect(draft.root.creator).toHaveLength(2);
    expect(draft.agents.map((agent) => agent.data)).toEqual([
      { name: "Jane Doe", mbox: "mailto:jane@example.org" },
      { name: "Jane Doe", mbox: "mailto:jane@exämple.org" },
    ]);
  });

  it("keeps every card under its id, retired ones too, with its wrong options and what it is about", () => {
    const { draft } = deckToDraft(deck, cards, DRAFT, NOW);
    expect(draft.cards).toEqual([
      {
        id: "turtle",
        data: {
          front: { en: "Sweden" },
          back: { en: "Stockholm" },
          created: "2026-01-02T00:00:00.000Z",
          distractor: [`${DRAFT}#turtle-d1`],
          subject: ["http://www.wikidata.org/entity/Q34"],
        },
      },
      {
        id: "c2",
        data: {
          front: { en: "Norway" },
          back: { en: "Oslo" },
          deprecated: true,
          distractor: [],
          subject: [],
        },
      },
    ]);
    expect(draft.distractors).toEqual([
      { id: "turtle-d1", data: { text: { en: "Oslo" }, deprecated: true } },
    ]);
    expect(draft.distributions[0]!.id).toBe("turtle-2");
  });

  it("makes a distractor two cards name once (GHSA-f72p-j39c-w728)", () => {
    const shared = cards[0]!.distractors!;
    const { draft } = deckToDraft(
      deck,
      [cards[0]!, { ...cards[1]!, distractors: shared }],
      DRAFT,
      NOW,
    );
    expect(draft.distractors).toEqual([
      { id: "turtle-d1", data: { text: { en: "Oslo" }, deprecated: true } },
    ]);
    expect(draft.cards.map((card) => card.data.distractor)).toEqual([
      [`${DRAFT}#turtle-d1`],
      [`${DRAFT}#turtle-d1`],
    ]);
  });

  it("never makes the release a deck was copied from a source of the draft: it is what the deck is based on", () => {
    const { draft, basedOn } = deckToDraft(deck, cards, DRAFT, NOW);
    expect(basedOn).toBe("https://solid-memo.com/decks/capitals/v1.ttl");
    expect(draft.root.wasDerivedFrom).toEqual([]);
    // Its one statement beyond the records types its license.
    expect(draft.triples).toEqual([
      {
        subject: "https://creativecommons.org/publicdomain/zero/1.0/",
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: { kind: "iri", value: "http://purl.org/dc/terms/LicenseDocument" },
      },
    ]);
  });

  it("states EDUC once for a deck that states it already", () => {
    const educ = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
    const { draft } = deckToDraft({ ...deck, themes: [educ] }, [], DRAFT, NOW);
    expect(draft.root.theme).toEqual([educ]);
  });

  it("names no publisher, nothing a deck does not state, and nothing it is based on, for a deck of the user's own", () => {
    const own: Deck = {
      ...deck,
      authors: [],
      sourceUrl: undefined,
      description: undefined,
      license: undefined,
      themes: undefined,
      keywords: undefined,
      direction: "front-to-back",
    };
    const result = deckToDraft(own, [], DRAFT, NOW);
    expect(result).toEqual({ draft: expect.anything() });
    expect(result.draft.root).not.toHaveProperty("publisher");
    expect(result.draft.root).not.toHaveProperty("description");
    expect(result.draft.root).toMatchObject({
      creator: [],
      theme: ["http://publications.europa.eu/resource/authority/data-theme/EDUC"],
      keyword: {},
      studyDirection: SM.frontToBack,
    });
    expect(result.draft.triples).toEqual([]);
  });
});
