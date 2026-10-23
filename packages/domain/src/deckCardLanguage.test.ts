// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { cardLanguageTag, withCardLanguage } from "./deckCardLanguage";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
};

describe("cardLanguageTag", () => {
  it("is the tag as the app stores it", () => {
    expect(cardLanguageTag("sv")).toBe("sv");
    expect(cardLanguageTag("PT-br")).toBe("pt-br");
  });

  it("is undefined for a value that names no language, or text in no language", () => {
    expect(cardLanguageTag("Swedish")).toBeUndefined();
    expect(cardLanguageTag("")).toBeUndefined();
    expect(cardLanguageTag("zxx")).toBeUndefined();
  });
});

describe("withCardLanguage", () => {
  it("sets the card language, in lower case", () => {
    expect(withCardLanguage(deck, "sv")).toEqual({ ...deck, cardLanguage: "sv" });
    expect(withCardLanguage(deck, "PT-br")).toEqual({ ...deck, cardLanguage: "pt-br" });
    expect(withCardLanguage({ ...deck, cardLanguage: "sv" }, "ko")).toEqual({
      ...deck,
      cardLanguage: "ko",
    });
  });

  it("clears it for null, back to the usual order", () => {
    expect(withCardLanguage({ ...deck, cardLanguage: "sv" }, null)).toEqual(deck);
    expect(withCardLanguage(deck, null)).toEqual(deck);
  });

  it("refuses a tag that names no language, and text in no language", () => {
    expect(() => withCardLanguage(deck, "Swedish")).toThrow("“Swedish” is not a language code.");
    expect(() => withCardLanguage(deck, "zxx")).toThrow("“zxx” is not a language code.");
  });
});
