import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import type { Deck } from "./deck";
import { withProvenance } from "./deckProvenance";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY = "https://creativecommons.org/licenses/by/4.0/";
const OWN = "https://example.org/my-terms";
const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 6,
  direction: "front-to-back",
  authors: ["Old Author"],
  license: OWN,
};

describe("withProvenance", () => {
  it("replaces the authors, tidied, and the licence", () => {
    expect(withProvenance(deck, { authors: ["  Ada  Lovelace ", "Alan Turing<alan@example.org>", " "], license: CC0 })).toEqual({
      ...deck,
      authors: ["Ada  Lovelace", "Alan Turing <alan@example.org>"],
      license: CC0,
    });
  });

  it("removes the licence, and keeps one another app wrote", () => {
    const { license: _, ...without } = deck;
    expect(withProvenance(deck, { authors: [] })).toEqual({ ...without, authors: [] });
    expect(withProvenance(deck, { authors: [], license: OWN })).toEqual({ ...deck, authors: [] });
  });

  it("refuses a licence it does not offer", () => {
    expect(() => withProvenance({ ...deck, license: BY }, { authors: [], license: OWN })).toThrow(
      new AppError("licenseUnknown", { url: OWN }),
    );
  });

  it("refuses an author with an address but no name", () => {
    expect(() => withProvenance(deck, { authors: ["<ada@example.org>"] })).toThrow(new AppError("authorEmpty"));
  });

  it("refuses an author named twice, as the same agent node would hold both", () => {
    expect(() => withProvenance(deck, { authors: ["Ada Lovelace", "ada lovelace"] })).toThrow(
      new AppError("authorTwice", { author: "ada lovelace" }),
    );
  });
});
