// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Many decks that name one reviews document, whose states name many
 * other documents their cards are in, are given its review states in
 * time that grows with the decks and the document, not their product:
 * the way each deck reads the document is looked up in the documents its
 * states name, sorted once a read (sharedReviewStatesOf), not found by a
 * pass over them for each deck. Eight times as many decks of a document
 * naming eight times as many must take less than four times as long as
 * an eighth of them done eight times over (testing.md); reading the
 * document is not timed (growthAfterSetup). So must decks whose ids each
 * start the next and every name the states give, sixteen times as many
 * with ids sixteen times as long: finding how they read the document
 * goes through its names a few times over at most (SCANS_OF_NAMES), and
 * the decks past that are refused.
 */
import { expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { SCANS_OF_NAMES, sharedReviewStatesOf } from "./mappers/reviewStateMapper";
import { datasetOfTurtle } from "./testing/datasets";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CARDS = `${INSTANCE}decks/shared.ttl`;
const REVIEWS = `${INSTANCE}reviews/shared.ttl`;
const AT = '"2026-11-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>';
const PREFIXES = "@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .\n";

/** A reviews document with a state of the shared cards, and `count` subjects that each name a document of their own. */
function reviews(count: number): string {
  let ttl = `${PREFIXES}<#c1> a sm:ReviewState ; sm:formatVersion 2 ; sm:reviewOf <../decks/shared.ttl#c1> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ;
  sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-11-19" ;
  sm:firstReviewedAt ${AT} ; sm:lastReviewedAt ${AT} .\n`;
  for (let i = 0; i < count; i++) ttl += `<#n${i}> sm:reviewOf <../decks/doc-${i}.ttl#c> .\n`;
  return ttl;
}

const deckOf = (n: number): Deck => ({
  id: `deck-${n}`,
  url: `${INSTANCE}catalog.ttl#deck-${n}`,
  title: { en: `deck-${n}` },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
  createdAt: "2026-11-01T00:00:00.000Z",
  formatVersion: 1,
  authors: [],
});

it("gives many decks one reviews document naming many others in time that grows with them, not their product", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const read = await datasetOfTurtle(REVIEWS, reviews(count));
      const decks = Array.from({ length: count }, (_, n) => deckOf(n));
      return async () => {
        const states = decks.map((deck) => sharedReviewStatesOf(read, deck));
        expect(states[0]!.sm2.map((state) => state.cardId)).toEqual(["c1"]);
        expect(states.at(-1)).toBe(states[0]);
      };
    },
    500,
    8,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);

const NESTED_NAMES = 500;

/** As many names as NESTED_NAMES, each starting with `length` a's, a reviews document's states give. */
function nestedReviews(length: number): string {
  const stem = "a".repeat(length);
  let ttl = PREFIXES;
  for (let i = 0; i < NESTED_NAMES; i++)
    ttl += `<${REVIEWS}#n${i}> sm:reviewOf <${INSTANCE}decks/${stem}-${i}.ttl#c> .\n`;
  return ttl;
}

it("gives decks whose ids start each other one reviews document's states in time that grows with the ids, not their square", async () => {
  const ratio = await growthAfterSetup(
    (length) => async () => {
      const read = await datasetOfTurtle(REVIEWS, nestedReviews(length));
      const decks = Array.from({ length }, (_, n) => ({ ...deckOf(n), id: "a".repeat(n + 1) }));
      return async () => {
        let refused = 0;
        for (const deck of decks)
          try {
            sharedReviewStatesOf(read, deck);
          } catch {
            refused++;
          }
        expect(refused).toBe(length - SCANS_OF_NAMES);
      };
    },
    100,
    16,
    4,
  );
  expect(ratio).toBeLessThan(4);
}, 180_000);
