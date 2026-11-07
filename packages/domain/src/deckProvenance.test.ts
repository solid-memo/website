// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import type { Deck } from "./deck";
import { withProvenance } from "./deckProvenance";
import { growth } from "./testing/growth";
import { LONG_AGENTS, LONG_SUBJECT } from "./testing/longAgents";

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
  it("replaces the authors, tidied, and the license", () => {
    expect(
      withProvenance(deck, {
        authors: ["  Ada  Lovelace ", "Alan Turing<alan@example.org>", " "],
        license: CC0,
      }),
    ).toEqual({
      ...deck,
      authors: ["Ada  Lovelace", "Alan Turing <alan@example.org>"],
      license: CC0,
    });
  });

  it("removes the license, and keeps one another app wrote", () => {
    const { license: _, ...without } = deck;
    expect(withProvenance(deck, { authors: [] })).toEqual({ ...without, authors: [] });
    expect(withProvenance(deck, { authors: [], license: OWN })).toEqual({ ...deck, authors: [] });
  });

  it("refuses a license it does not offer", () => {
    expect(() => withProvenance({ ...deck, license: BY }, { authors: [], license: OWN })).toThrow(
      new AppError("licenseUnknown", { url: OWN }),
    );
  });

  it("refuses an author with an address but no name", () => {
    expect(() => withProvenance(deck, { authors: ["<ada@example.org>"] })).toThrow(
      new AppError("authorEmpty"),
    );
  });

  it("refuses an author named twice, as the same agent node would hold both", () => {
    expect(() => withProvenance(deck, { authors: ["Ada Lovelace", "ada lovelace"] })).toThrow(
      new AppError("authorTwice", { author: "ada lovelace" }),
    );
  });
});

describe("withProvenance with agent URLs longer than any term", () => {
  it("refuses an author named twice", () => {
    const long = { ...deck, url: LONG_SUBJECT };
    expect(() => withProvenance(long, { authors: ["A", "A"], license: OWN })).toThrow(AppError);
  });

  it.each(LONG_AGENTS)(
    "takes time that grows with the authors, not their square, with $variant (GHSA-4mgg-5xpp-3jx5)",
    {
      timeout: 180_000,
    },
    ({ subject, authors }) => {
      const long = { ...deck, url: subject };
      const ratio = growth(
        (count) => {
          const many = authors(count);
          return () => withProvenance(long, { authors: many, license: OWN });
        },
        250,
        8,
      );
      expect(ratio).toBeLessThan(4);
    },
  );
});
