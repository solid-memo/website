// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isDeckDocumentAddress, isDeckInPlace } from "./deckAddress";
import { GUEST_INSTANCE_URL, GUEST_ORIGIN } from "./guest";

describe("where a deck's documents may be", () => {
  const ROOT = "https://pod.example/solid-memo/main/";
  const DECKS = `${ROOT}decks/`;

  it("reads a deck's documents wherever its entry names them, its entry in the instance's catalog", () => {
    const deck = {
      url: `${ROOT}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${DECKS}deck-1.ttl`,
      reviewsDocumentUrl: `${ROOT}reviews/deck-1.ttl`,
    };
    expect(isDeckInPlace(deck)).toBe(true);
    for (const placed of [
      // As an earlier version's library upgrade left them.
      {
        cardsDocumentUrl: `${DECKS}deck-1-0b6e.ttl`,
        reviewsDocumentUrl: `${ROOT}reviews/deck-1-0b6e.ttl`,
      },
      // Renamed folders, a folder below, free names, another folder of the pod, a flat pod.
      {
        cardsDocumentUrl: `${ROOT}kort/spanska.ttl`,
        reviewsDocumentUrl: `${ROOT}answers/spanska.ttl`,
      },
      { cardsDocumentUrl: `${DECKS}old/deck-1.ttl` },
      { cardsDocumentUrl: `${DECKS}deck%201.ttl`, reviewsDocumentUrl: `${DECKS}deck-1.TTL` },
      {
        cardsDocumentUrl: "https://pod.example/spanish-cards",
        reviewsDocumentUrl: "https://pod.example/spanish-reviews",
      },
    ]) {
      expect(isDeckInPlace({ ...deck, ...placed }), JSON.stringify(placed)).toBe(true);
    }
    expect(
      isDeckInPlace({
        url: "https://pod.example/catalog.ttl#deck-1",
        cardsDocumentUrl: "https://pod.example/cards.ttl",
        reviewsDocumentUrl: "https://pod.example/reviews.ttl",
      }),
    ).toBe(true);
    for (const misplaced of [
      { reviewsDocumentUrl: `${ROOT}reviews/../../../x.ttl` },
      { cardsDocumentUrl: `${DECKS}./deck-1.ttl` },
      // The instance's own documents.
      { cardsDocumentUrl: `${ROOT}meta.ttl` },
      { cardsDocumentUrl: `${ROOT}catalog.ttl` },
      { reviewsDocumentUrl: `${ROOT}preferences.ttl` },
      { cardsDocumentUrl: `${ROOT}palettes.ttl` },
      { reviewsDocumentUrl: "https://Pod.example/solid-memo/main/digest.ttl" },
      { reviewsDocumentUrl: `${ROOT}history/2026-10.ttl` },
      { cardsDocumentUrl: `${ROOT}drafts/spanish/v1/cards.ttl` },
      { cardsDocumentUrl: `${ROOT}releases/spanish/v1.ttl` },
      { url: `${ROOT}other.ttl#deck-1` },
      { url: "not an address#deck-1" },
      // Another document's access control or metadata, which a write would replace.
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.acl` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.ACL` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.acr` },
      { cardsDocumentUrl: `${DECKS}deck-1.ttl.meta` },
      { reviewsDocumentUrl: `${ROOT}reviews/deck-1.ttl.acl` },
      // An empty segment (one document spelled two ways), a folder, a hidden name.
      { cardsDocumentUrl: `${DECKS}/deck-1.ttl` },
      { reviewsDocumentUrl: `${ROOT}reviews//deck-1.ttl` },
      { cardsDocumentUrl: `${DECKS}` },
      { cardsDocumentUrl: `${DECKS}.ttl` },
    ]) {
      expect(isDeckInPlace({ ...deck, ...misplaced }), JSON.stringify(misplaced)).toBe(false);
    }
    // An instance whose address is spelled otherwise than a request sends it.
    for (const instance of [
      "https://pod.example/kortlekar-å/",
      "https://pod.example/kortlekar-%C3%A5/",
      "https://Pod.Example/a/",
      "https://bücher.example/a/",
    ]) {
      expect(
        isDeckInPlace({
          url: `${instance}catalog.ttl#deck-1`,
          cardsDocumentUrl: `${instance}decks/deck-1.ttl`,
          reviewsDocumentUrl: `${instance}reviews/deck-1.ttl`,
        }),
        instance,
      ).toBe(true);
    }
  });

  it("names a document in a guest's pod only from a guest's own instance", () => {
    const guestCards = `${GUEST_ORIGIN}solid-memo/drafts/draft/v1/cards.ttl`;
    // Another instance's catalog naming a document in this browser's guest pod: not a deck to use.
    for (const misplaced of [
      { cardsDocumentUrl: guestCards },
      { reviewsDocumentUrl: `${GUEST_ORIGIN}solid-memo/reviews/deck-1.ttl` },
      { cardsDocumentUrl: "https://GUEST.solid-memo.invalid/solid-memo/decks/deck-1.ttl" },
    ]) {
      expect(
        isDeckInPlace({
          url: "https://evil.example/inst/catalog.ttl#deck-1",
          cardsDocumentUrl: "https://evil.example/inst/decks/deck-1.ttl",
          reviewsDocumentUrl: "https://evil.example/inst/reviews/deck-1.ttl",
          ...misplaced,
        }),
        JSON.stringify(misplaced),
      ).toBe(false);
    }
    // A guest's deck, its documents in their pod.
    const guestDeck = {
      url: `${GUEST_INSTANCE_URL}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${GUEST_INSTANCE_URL}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${GUEST_INSTANCE_URL}reviews/deck-1.ttl`,
    };
    expect(isDeckInPlace(guestDeck)).toBe(true);
    // A guest's catalog naming a document anywhere else.
    expect(isDeckInPlace({ ...guestDeck, cardsDocumentUrl: "https://pod.example/cards.ttl" })).toBe(
      false,
    );
    expect(
      isDeckInPlace({ ...guestDeck, reviewsDocumentUrl: "https://pod.example/reviews.ttl" }),
    ).toBe(false);
    expect(isDeckDocumentAddress(GUEST_INSTANCE_URL, guestDeck.cardsDocumentUrl)).toBe(true);
    expect(isDeckDocumentAddress(ROOT, guestDeck.cardsDocumentUrl)).toBe(false);
    expect(isDeckDocumentAddress("not an address", guestDeck.cardsDocumentUrl)).toBe(false);
  });
});
