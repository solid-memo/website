// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { isCopyOf, type LibraryDeck } from "./library";
import { copiedTest, libraryCopyTest } from "./libraryCopy";
import { growth } from "./testing/growth";

function libraryDeck(name: string, versions: number, base = "https://solid-memo.com/decks/") {
  const releases = Array.from({ length: versions }, (_, at) => ({
    url: `${base}${name}/v${at + 1}.ttl`,
    version: String(at + 1),
  }));
  return {
    url: releases.at(-1)!.url,
    seriesUrl: `${base}index.ttl#${name}`,
    version: String(versions),
    releases,
  } as LibraryDeck;
}

describe("libraryCopyTest", () => {
  const v1 = "https://alice.example/memo/releases/capitals/v1.ttl";
  const v2 = "https://alice.example/memo/releases/capitals/v2.ttl";
  const library: LibraryDeck[] = [
    libraryDeck("capitals", 2),
    libraryDeck("http", 1),
    // A release published in a pod names its series after its first version.
    {
      url: v2,
      seriesUrl: `${v1}#series`,
      version: "2",
      releases: [{ url: v1, version: "1" }],
    } as LibraryDeck,
  ];

  it("tells a copy as isCopyOf tells it of some library deck", () => {
    const sources = [
      undefined,
      "https://solid-memo.com/decks/capitals/v1.ttl",
      "https://solid-memo.com/decks/capitals/v3.ttl",
      "https://solid-memo.com/decks/http/v9.ttl",
      "https://solid-memo.com/decks/nouns/v1.ttl",
      "https://mirror.example/decks/capitals/v1.ttl",
      v1,
      v2,
      "https://alice.example/memo/releases/capitals/v3.ttl",
      "https://alice.example/memo/releases/capitals/v2.ttl#series",
      "not a url",
    ];
    const isCopy = libraryCopyTest(library);
    for (const sourceUrl of sources) {
      const deck = { sourceUrl } as Deck;
      expect(isCopy(deck), String(sourceUrl)).toBe(
        library.some((libraryDeck) => isCopyOf(deck, libraryDeck)),
      );
    }
    expect(isCopy({ sourceUrl: v1 } as Deck)).toBe(true);
    expect(isCopy({ sourceUrl: "https://solid-memo.com/decks/nouns/v1.ttl" } as Deck)).toBe(false);
    expect(libraryCopyTest([])({ sourceUrl: v1 } as Deck)).toBe(false);
  });

  it("tells many decks with long release links in time linear in the decks and the library", () => {
    // Links of about 16,000 characters with many "/decks/" in them, which
    // the release pattern scans over whole: telling each deck against
    // each library deck grew with the product of the two.
    const ratio = growth(
      (count) => {
        const library = Array.from({ length: count }, (_, at) => libraryDeck(`d${at}`, 3));
        const decks = Array.from(
          { length: count },
          (_, at) =>
            ({
              sourceUrl: `https://elsewhere.example/${at}/${"/decks/x".repeat(2_000)}`,
            }) as Deck,
        );
        return () => {
          const isCopy = libraryCopyTest(library);
          return decks.filter((deck) => !isCopy(deck)).length;
        };
      },
      125,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("copiedTest", () => {
  const v1 = "https://alice.example/memo/releases/capitals/v1.ttl";
  const v2 = "https://alice.example/memo/releases/capitals/v2.ttl";
  const library: LibraryDeck[] = [
    libraryDeck("capitals", 2),
    libraryDeck("http", 1),
    libraryDeck("nouns", 1),
    libraryDeck("capitals", 1, "https://mirror.example/decks/"),
    // A release published in a pod names its series after its first version.
    {
      url: v2,
      seriesUrl: `${v1}#series`,
      version: "2",
      releases: [{ url: v1, version: "1" }],
    } as LibraryDeck,
    { ...libraryDeck("own", 1), url: v2, seriesUrl: `${v2}#series`, releases: [] },
  ];
  const sources = [
    "https://solid-memo.com/decks/capitals/v3.ttl",
    "https://solid-memo.com/decks/http/v1.ttl",
    v1,
    v2,
    "not a url",
  ];

  it("tells a library deck copied as isCopyOf tells it of some deck", () => {
    const sets = [[], [undefined], ...sources.map((sourceUrl) => [undefined, sourceUrl]), sources];
    for (const set of sets) {
      const decks = set.map((sourceUrl) => ({ sourceUrl }) as Deck);
      const isCopied = copiedTest(decks);
      for (const shown of library) {
        expect(isCopied(shown), `${shown.url} of ${set.join(", ")}`).toBe(
          decks.some((deck) => isCopyOf(deck, shown)),
        );
      }
    }
    expect(copiedTest([{ sourceUrl: v1 } as Deck])(library[4]!)).toBe(true);
    expect(copiedTest([{ sourceUrl: v1 } as Deck])(library[0]!)).toBe(false);
  });

  it("tells many library decks of many decks with long release links in time linear in both", () => {
    // Links of about 16,000 characters with many "/decks/" in them, which
    // the release pattern scans over whole: telling each library deck
    // against each deck grew with the product of the two.
    const ratio = growth(
      (count) => {
        const library = Array.from({ length: count }, (_, at) => libraryDeck(`d${at}`, 3));
        const decks = Array.from(
          { length: count },
          (_, at) =>
            ({
              sourceUrl: `https://elsewhere.example/${at}/${"/decks/x".repeat(2_000)}`,
            }) as Deck,
        );
        return () => {
          const isCopied = copiedTest(decks);
          return library.filter((shown) => !isCopied(shown)).length;
        };
      },
      125,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
