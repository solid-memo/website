// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Many decks that name one document find where it stands for each of
 * them in time that grows with the decks and the document, not their
 * product: what the document says that goes for every deck alike is
 * worked out once of a read (deckPlace.ts documentFactsOf), and each
 * deck's standing is then a lookup. Eight times as many decks over a
 * document of eight times as many subjects must take less than four
 * times as long as an eighth of them done eight times over (testing.md);
 * what makes the guard and the document is not timed (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createDeckDocumentGuard, type DeckPlace } from "./deckPlace";
import { datasetOfTurtle } from "./testing/datasets";

const INSTANCE = "https://pod.example/alice/solid-memo/main/";
const SHARED = `${INSTANCE}shared-cards.ttl`;

/** A document of `count` subjects that says it is part of a deck the catalog does not list: unclaimed for every deck. */
function sharedTurtle(count: number): string {
  const lines = [`<> <http://purl.org/dc/terms/isPartOf> <${INSTANCE}catalog.ttl#not-listed> .`];
  for (let at = 0; at < count; at++)
    lines.push(`<#c${at}> <http://www.w3.org/2000/01/rdf-schema#label> "x" .`);
  return lines.join("\n");
}

/** `count` decks of the instance, all naming the shared document as their cards and reviews. */
function decksOf(count: number): DeckPlace[] {
  return Array.from({ length: count }, (_, at) => ({
    url: `${INSTANCE}catalog.ttl#deck-${at}`,
    title: { en: `Deck ${at}` },
    cardsDocumentUrl: SHARED,
    reviewsDocumentUrl: SHARED,
  }));
}

/** A pod that is never asked: the decks' standing needs no read but the document's own. */
const unasked = (async () => {
  throw new Error("Not asked");
}) as typeof globalThis.fetch;

it("finds a document many decks name unclaimed for all of them in time that grows with them, not their product", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const guard = createDeckDocumentGuard(unasked);
      const decks = decksOf(count);
      const dataset = await datasetOfTurtle(SHARED, sharedTurtle(count));
      return async () => expect(await guard.unclaimedForAll(decks, SHARED, dataset)).toBe(true);
    },
    100,
    8,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);

/** A pod that serves the shared document, then answers each read again unchanged (304), as a pod does while it has not changed. */
function servingShared(count: number): typeof globalThis.fetch {
  const body = sharedTurtle(count);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const unchanged = new Headers(init?.headers).get("If-None-Match") === '"v1"';
    const response = unchanged
      ? new Response(null, { status: 304, headers: { ETag: '"v1"' } })
      : new Response(body, { headers: { "Content-Type": "text/turtle", ETag: '"v1"' } });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  }) as typeof globalThis.fetch;
}

it("reads one document again for each of many decks naming it in time that grows with them, not their product", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const guard = createDeckDocumentGuard(servingShared(count));
      const decks = decksOf(count);
      // Read once first, as a check's first deck reads it: the others are answered unchanged.
      expect(await guard.unclaimedAsRead([decks[0]!], SHARED, false)).toBe(true);
      return async () => {
        for (const deck of decks)
          expect(await guard.unclaimedAsRead([deck], SHARED, false)).toBe(true);
      };
    },
    100,
    8,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);
