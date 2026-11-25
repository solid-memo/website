// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Decks are changed and removed in time that grows with them and their
 * cards, not their square, against a pod in memory: a deck removed from
 * a document another app wrote in, many decks of a catalog changed
 * and removed at once, a deck removed beside many whose documents'
 * addresses are long, and a deck whose entry names many picture hosts.
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup), and where it takes long, it
 * is done once per size and the pod put back before each run (builtOnce).
 * The other writes of a deck are timed in the other
 * solidDeckRepository.*.growth.test.ts files, each a file of its own so
 * that they run at once.
 */
import { describe, expect, it } from "vitest";
import { MAX_PICTURE_HOSTS } from "@solid-memo/domain/deckPictures";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { builtOnce, saved } from "./testing/builtOnce";
import {
  INSTANCE,
  deckRepository,
  release,
  repositoryInPod,
  put,
  read,
  catalogOfDecks,
  SM,
} from "./testing/deckWrites";

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("remove a deck from a cards document another app wrote in, in time that grows with its cards, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) =>
        builtOnce(async () => {
          const { fetch, store, repository } = repositoryInPod();
          const deck = await repository.importDeck(INSTANCE, release(count));
          const text = await read(fetch, deck.cardsDocumentUrl);
          const other = `<${deck.cardsDocumentUrl}#other> <https://other.example/#note> "kept" .`;
          await put(fetch, deck.cardsDocumentUrl, `${text}\n${other}`);
          return {
            restore: await saved(store),
            start: () => {
              const fresh = deckRepository(fetch);
              return async () => {
                const { keptDocuments } = await fresh.removeDeck(deck);
                expect(keptDocuments).toEqual([deck.cardsDocumentUrl]);
              };
            },
          };
        }),
      300,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change many decks of a catalog at once in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) =>
        builtOnce(async () => {
          const { fetch, repository, store } = await catalogOfDecks(count);
          const decks = await repository.listDecks(INSTANCE);
          // Long titles, so that the change is sent as one PUT at either size, never as a PATCH.
          const change = (deck: (typeof decks)[number]) => ({
            ...deck,
            title: { en: `${deck.id} ${"x".repeat(1000)}` },
            direction: "back-to-front" as const,
          });
          return {
            restore: await saved(store),
            start: () => {
              const fresh = deckRepository(fetch);
              return async () => {
                await fresh.editDecks(decks, change);
              };
            },
          };
        }),
      100,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove many decks of a catalog at once, each listed by a group, in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) =>
        builtOnce(async () => {
          const { fetch, store, repository } = await catalogOfDecks(count);
          const decks = await repository.listDecks(INSTANCE);
          return {
            restore: await saved(store),
            start: () => {
              const fresh = deckRepository(fetch);
              return async () => {
                expect(await fresh.removeDecks(decks)).toEqual({ keptDocuments: [] });
                expect(await read(fetch, `${INSTANCE}catalog.ttl`)).not.toContain("deck-");
                expect((await fetch(`${INSTANCE}decks/deck-0.ttl`)).status).toBe(404);
              };
            },
          };
        }),
      100,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove a deck beside many whose documents' addresses are longer than V8 hashes once a server's spelling, in time that grows with them, not their square", async () => {
    // A `+` is encoded when the address is brought to how a server reads it (documentKeyOf),
    // so an address within the bound on a term becomes about three times as long.
    const long = "+".repeat(16_300);
    const ratio = await growthAfterSetup(
      (count) =>
        builtOnce(async () => {
          const { fetch, store, repository } = await catalogOfDecks(1);
          const [deck] = await repository.listDecks(INSTANCE);
          const catalogUrl = `${INSTANCE}catalog.ttl`;
          const others = Array.from({ length: count }, (_, i) => {
            const n = String(i).padStart(4, "0");
            return `<#other-${n}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "Other" ; <${SM}cardsDocument> <${INSTANCE}decks/${long}-cards-${n}.ttl> ; <${SM}reviewsDocument> <${INSTANCE}decks/${long}-reviews-${n}.ttl> .`;
          });
          await put(fetch, catalogUrl, [await read(fetch, catalogUrl), ...others].join("\n"));
          return {
            restore: await saved(store),
            start: () => {
              const fresh = deckRepository(fetch);
              return async () => {
                expect(await fresh.removeDecks([deck!])).toEqual({ keptDocuments: [] });
                expect((await fetch(`${INSTANCE}decks/deck-0.ttl`)).status).toBe(404);
              };
            },
          };
        }),
      100,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("list and change a deck whose entry names many picture hosts in time that grows with them, not their square (GHSA-jmrw-gq3f-r4g6)", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, repository } = await catalogOfDecks(1);
        const catalogUrl = `${INSTANCE}catalog.ttl`;
        const hosts = Array.from({ length: count }, (_, i) => `"h${i}.example"`).join(", ");
        const named = `<${catalogUrl}#deck-0> <${SM}deckPictureHost> ${hosts} .`;
        await put(fetch, catalogUrl, `${await read(fetch, catalogUrl)}\n${named}`);
        return async () => {
          const [deck] = await repository.listDecks(INSTANCE);
          expect(deck!.pictureHosts).toHaveLength(MAX_PICTURE_HOSTS);
          const changed = await repository.setPictureHost(deck!, "new.example", true);
          expect(changed.pictureHosts).toHaveLength(MAX_PICTURE_HOSTS);
          expect(changed.pictureHosts!.at(-1)).toBe("new.example");
        };
      },
      1000,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });
});
