// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Decks are changed and removed in time that grows with them and their
 * cards, not their square, against a pod in memory: a deck removed from
 * a document another app wrote in, and many decks of a catalog changed
 * and removed at once.
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup). The other writes of a deck
 * are timed in the other solidDeckRepository.*.growth.test.ts files, each
 * a file of its own so that they run at once.
 */
import { describe, expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import {
  INSTANCE,
  release,
  repositoryInPod,
  put,
  read,
  catalogOfDecks,
} from "./testing/deckWrites";

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("remove a deck from a cards document another app wrote in, in time that grows with its cards, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, release(count));
        const text = await read(fetch, deck.cardsDocumentUrl);
        const other = `<${deck.cardsDocumentUrl}#other> <https://other.example/#note> "kept" .`;
        await put(fetch, deck.cardsDocumentUrl, `${text}\n${other}`);
        return async () => {
          const { keptDocuments } = await repository.removeDeck(deck);
          expect(keptDocuments).toEqual([deck.cardsDocumentUrl]);
        };
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change many decks of a catalog at once in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { repository } = await catalogOfDecks(count);
        const decks = await repository.listDecks(INSTANCE);
        // Long titles, so that the change is sent as one PUT at either size, never as a PATCH.
        const changed = decks.map((deck) => ({
          ...deck,
          title: { en: `${deck.id} ${"x".repeat(1000)}` },
          direction: "back-to-front" as const,
        }));
        return async () => {
          await repository.saveDecks(changed);
        };
      },
      100,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove many decks of a catalog at once, each listed by a group, in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, repository } = await catalogOfDecks(count);
        const decks = await repository.listDecks(INSTANCE);
        return async () => {
          expect(await repository.removeDecks(decks)).toEqual({ keptDocuments: [] });
          expect(await read(fetch, `${INSTANCE}catalog.ttl`)).not.toContain("deck-");
          expect((await fetch(`${INSTANCE}decks/deck-0.ttl`)).status).toBe(404);
        };
      },
      100,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
