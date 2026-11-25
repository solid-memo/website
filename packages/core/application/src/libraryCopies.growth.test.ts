// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Many library copies that name one cards document are planned in time
 * that grows with the copies and the cards, not their product: the
 * Studio's library copies plans an upgrade for each copy with a newer
 * release (planLibraryUpgrade). The repository maps a read of the
 * document once, to one frozen array the decks share, as the fake here
 * gives it, and the library keeps each release as read; the copies of one
 * release are then planned of the cards once, and each deck's own entry
 * on its own. Eight times as many copies of eight times as many cards
 * must take less than four times as long as an eighth of them done eight
 * times over (testing.md).
 */
import { describe, expect, it, vi } from "vitest";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { growthAsync } from "@solid-memo/domain/testing/growth";
import { createUseCases } from "./useCases";
import { card, deck, instance, libraryContent, libraryDeck, makeDeps } from "./testing/fakePorts";

const SHARED = `${instance.url}decks/shared.ttl`;
const V2 = "https://solid-memo.com/decks/capitals/v2.ttl";

/**
 * `count` copies of release 1 that name one cards document of `count`
 * cards, of a series whose release 2, of as many cards, changes one.
 * Each `read()` reads the cards document afresh, as a new download: one
 * frozen array that every deck naming it is given.
 */
function sharedCopies(count: number) {
  const cardOf = (n: number, back = "first") => ({
    id: `card-${n}`,
    front: { "": `front ${n}` },
    back: { "": back },
    formatVersion: 1,
  });
  const release = (url: string, version: string): LibraryDeckContent => ({
    ...libraryContent,
    url,
    version,
    cards: Array.from({ length: count }, (_, n) =>
      cardOf(n, n === 0 && version === "2" ? "second" : "first"),
    ),
  });
  const releases = new Map([
    [libraryDeck.url, release(libraryDeck.url, "1")],
    [V2, release(V2, "2")],
  ]);
  const series: LibraryDeck = {
    ...libraryDeck,
    url: V2,
    version: "2",
    releases: [
      { url: libraryDeck.url, version: "1" },
      { url: V2, version: "2" },
    ],
  };
  const decks = Array.from(
    { length: count },
    (_, n): Deck => ({
      ...deck,
      id: `deck-${n}`,
      url: `${instance.url}catalog.ttl#deck-${n}`,
      cardsDocumentUrl: SHARED,
      reviewsDocumentUrl: `${instance.url}reviews/deck-${n}.ttl`,
      sourceUrl: libraryDeck.url,
    }),
  );
  let cards: readonly Card[] = [];
  const read = () => {
    cards = Object.freeze(
      Array.from({ length: count }, (_, n) => ({
        ...card,
        ...cardOf(n),
        url: `${SHARED}#card-${n}`,
      })),
    );
  };
  const deps = makeDeps();
  vi.mocked(deps.deckRepository.listDecks).mockResolvedValue(decks);
  vi.mocked(deps.deckRepository.listCards).mockImplementation(async () => cards as Card[]);
  vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([series]);
  vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(
    async (url) => releases.get(url)!,
  );
  return { useCases: createUseCases(deps), read };
}

describe("library copies that share one cards document", { timeout: 180_000 }, () => {
  it("have their upgrades planned in time that grows with them, not their product", async () => {
    const ratio = await growthAsync(
      (count) => {
        const { useCases, read } = sharedCopies(count);
        return async () => {
          read();
          const copies = await useCases.listLibraryUpdates(instance.url);
          const plans = await Promise.all(
            copies.map((copy) => useCases.planLibraryUpgrade(copy.deck, copy)),
          );
          expect(plans).toHaveLength(count);
          expect(plans[0]).toMatchObject({ change: [{ id: "card-0" }] });
        };
      },
      200,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });
});
