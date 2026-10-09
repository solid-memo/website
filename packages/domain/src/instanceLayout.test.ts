import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  deckGroupUrlOf,
  documentsInUse,
  instanceUrlOfDeck,
  digestSubjectOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyContainerOf,
  historyUrlOf,
  instanceDocumentUrls,
  monthOfHistoryUrl,
  metaUrlOf,
  preferencesUrlOf,
  reviewsContainerOf,
} from "./instanceLayout";

const INSTANCE = "https://pod.example/solid-memo/main";

describe("instance layout", () => {
  it("names the fixed documents, with or without a trailing slash", () => {
    expect(ensureTrailingSlash(INSTANCE)).toBe(`${INSTANCE}/`);
    expect(ensureTrailingSlash(`${INSTANCE}/`)).toBe(`${INSTANCE}/`);
    expect(metaUrlOf(INSTANCE)).toBe(`${INSTANCE}/meta.ttl`);
    expect(preferencesUrlOf(`${INSTANCE}/`)).toBe(`${INSTANCE}/preferences.ttl`);
    expect(catalogUrlOf(INSTANCE)).toBe(`${INSTANCE}/catalog.ttl`);
  });

  it("names the containers of the decks' documents, with or without a trailing slash", () => {
    expect(cardsContainerOf(INSTANCE)).toBe(`${INSTANCE}/decks/`);
    expect(reviewsContainerOf(`${INSTANCE}/`)).toBe(`${INSTANCE}/reviews/`);
  });

  it("lists every document of an instance, fixed ones first", () => {
    const deck = {
      cardsDocumentUrl: `${INSTANCE}/decks/deck-1.ttl`,
      reviewsDocumentUrl: `${INSTANCE}/reviews/deck-1.ttl`,
    } as Deck;
    expect(instanceDocumentUrls(INSTANCE, [deck])).toEqual([
      `${INSTANCE}/meta.ttl`,
      `${INSTANCE}/preferences.ttl`,
      `${INSTANCE}/catalog.ttl`,
      `${INSTANCE}/decks/deck-1.ttl`,
      `${INSTANCE}/reviews/deck-1.ttl`,
    ]);
  });
});

describe("deckGroupUrlOf", () => {
  it("is a group subject of the catalog document", () => {
    expect(deckGroupUrlOf(INSTANCE, "x1")).toBe(`${INSTANCE}/catalog.ttl#group-x1`);
  });
});

describe("catalogNodeUrlOf", () => {
  it("names the catalogue subject of the instance's catalog document", () => {
    expect(catalogNodeUrlOf(INSTANCE)).toBe(`${INSTANCE}/catalog.ttl#catalog`);
  });
});

describe("the digest", () => {
  const instance = "https://pod.example/solid-memo/main";

  it("is digest.ttl in the instance's container", () => {
    expect(digestUrlOf(instance)).toBe("https://pod.example/solid-memo/main/digest.ttl");
  });

  it("names its subjects by where their document or deck is under the instance", () => {
    expect(digestSubjectOf(instance, "receipt", `${instance}/decks/deck-1.ttl`)).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#receipt-decks-deck-1.ttl",
    );
    expect(digestSubjectOf(instance, "schedule", `${instance}/catalog.ttl#deck-1`)).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#schedule-catalog.ttl-deck-1",
    );
  });

  it("names a subject about a document elsewhere by its whole URL", () => {
    expect(digestSubjectOf(instance, "receipt", "https://other.example/d.ttl")).toBe(
      "https://pod.example/solid-memo/main/digest.ttl#receipt-https---other.example-d.ttl",
    );
  });

  it("keeps the answer log in a document per study month, and knows which month a document is for", () => {
    expect(historyContainerOf(INSTANCE)).toBe(`${INSTANCE}/history/`);
    expect(historyUrlOf(INSTANCE, "2026-10")).toBe(`${INSTANCE}/history/2026-10.ttl`);
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/history/2026-10.ttl`)).toBe("2026-10");
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/history/notes.ttl`)).toBeNull();
    expect(monthOfHistoryUrl(INSTANCE, `${INSTANCE}/catalog.ttl`)).toBeNull();
  });
});

describe("decks and their documents", () => {
  it("finds the instance a deck is in from its catalog entry", () => {
    expect(instanceUrlOfDeck("https://pod.example/solid-memo/main/catalog.ttl#deck-1")).toBe(
      "https://pod.example/solid-memo/main/",
    );
  });

  it("lists every document the decks use, once", () => {
    const deck = (cards: string, reviews: string) => ({ cardsDocumentUrl: cards, reviewsDocumentUrl: reviews }) as Deck;
    expect([...documentsInUse([deck("a", "b"), deck("a", "c")])]).toEqual(["a", "b", "c"]);
  });
});
