// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { deckPreferences, paceOf, withPace } from "./deckPace";
import { DEFAULT_PREFERENCES } from "./preferences";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: [],
};

describe("paceOf", () => {
  it("is the caps the deck sets itself", () => {
    expect(paceOf(deck)).toEqual({});
    expect(paceOf({ ...deck, newCardsPerDay: 5, maxReviewsPerDay: 0 })).toEqual({
      newCardsPerDay: 5,
      maxReviewsPerDay: 0,
    });
  });
});

describe("withPace", () => {
  it("sets the given caps and lets the others go back to the preferences", () => {
    const paced = { ...deck, newCardsPerDay: 5, maxReviewsPerDay: 50 };
    expect(withPace(deck, { newCardsPerDay: 5, maxReviewsPerDay: 50 })).toEqual(paced);
    expect(withPace(paced, { maxReviewsPerDay: 0 })).toEqual({ ...deck, maxReviewsPerDay: 0 });
    expect(withPace(paced, { newCardsPerDay: undefined })).toEqual(deck);
  });

  it("refuses a cap that is not a whole number, 0 or more", () => {
    for (const cap of [-1, 1.5, Number.NaN]) {
      expect(() => withPace(deck, { newCardsPerDay: cap })).toThrow(
        "A daily limit is a whole number, 0 or more.",
      );
      expect(() => withPace(deck, { maxReviewsPerDay: cap })).toThrow();
    }
  });
});

describe("deckPreferences", () => {
  it("puts the deck's own caps in place of the instance's", () => {
    expect(deckPreferences(DEFAULT_PREFERENCES, deck)).toEqual(DEFAULT_PREFERENCES);
    expect(deckPreferences(DEFAULT_PREFERENCES, { ...deck, newCardsPerDay: 5 })).toEqual({
      ...DEFAULT_PREFERENCES,
      newCardsPerDay: 5,
    });
    expect(deckPreferences(DEFAULT_PREFERENCES, { ...deck, maxReviewsPerDay: 0 })).toEqual({
      ...DEFAULT_PREFERENCES,
      maxReviewsPerDay: 0,
    });
  });
});
