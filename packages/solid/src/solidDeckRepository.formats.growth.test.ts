// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck's cards and a catalog's entries in an older format are
 * brought to this app's in time that grows with them, not their square,
 * against a pod in memory.
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup). The other writes of a deck
 * are timed in the other solidDeckRepository.*.growth.test.ts files, each
 * a file of its own so that they run at once.
 */
import { describe, expect, it } from "vitest";
import { growthAfterSetup, growthAsync } from "@solid-memo/domain/testing/growth";
import { INSTANCE, SM, release, repositoryInPod, put } from "./testing/deckWrites";

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("bring cards in an older format to this app's in time that grows with them, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const turtle = Array.from(
          { length: count },
          (_, i) =>
            `<#c${i}> a <${SM}Card> ; <${SM}front> "front ${i}" ; <${SM}back> "back ${i}" ; <${SM}formatVersion> 6 .`,
        ).join("\n");
        return async () => {
          const { fetch, repository } = repositoryInPod();
          const deck = await repository.importDeck(INSTANCE, release(0));
          await put(fetch, deck.cardsDocumentUrl, turtle);
          expect(await repository.upgradeCards(deck)).toBe(true);
        };
      },
      1200,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("bring catalog entries in an older format to this app's, each listed by the catalog, in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, repository } = repositoryInPod();
        // Entries as format 1 wrote them, none listed by the catalog yet.
        const entries = Array.from(
          { length: count },
          (_, i) =>
            `<#deck-${i}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "Deck ${i}" ; <${SM}cardsDocument> <decks/deck-${i}.ttl> ; <${SM}reviewsDocument> <reviews/deck-${i}.ttl> .`,
        );
        const catalog = "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .";
        await put(fetch, `${INSTANCE}catalog.ttl`, [catalog, ...entries].join("\n"));
        return async () => {
          expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
        };
      },
      200,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
