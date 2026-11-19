// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Decks that name one cards document and one reviews document, read
 * together as Statistics and the deck list read them: each document is
 * read once and mapped once, the decks are given the same cards and the
 * same review states, and what is worked out of them (activeCardsOf, the
 * schedule) is worked out once for all of them (GHSA-xppx-q95h-5xgj).
 */
import { scheduleFrom } from "@solid-memo/application/digestStore";
import type { Deck } from "@solid-memo/domain/deck";
import { activeCardsOf } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { describe, expect, it } from "vitest";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { SCANS_OF_NAMES, sharedReviewStatesOf } from "./mappers/reviewStateMapper";
import { datasetOfTurtle } from "./testing/datasets";

const INSTANCE = "https://pod.example/alice/solid-memo/";
const CARDS = `${INSTANCE}decks/shared.ttl`;
const REVIEWS = `${INSTANCE}reviews/shared.ttl`;
const NOW = new Date("2026-11-19T12:00:00Z");
const AT = '"2026-11-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>';
const PREFIXES = "@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .\n";

const deckOf = (id: string): Deck => ({
  id,
  url: `${INSTANCE}catalog.ttl#${id}`,
  title: { en: id },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
  createdAt: "2026-11-01T00:00:00.000Z",
  formatVersion: 1,
  authors: [],
});

const cards = `${PREFIXES}<#c1> a sm:Card ; sm:formatVersion 5 ; sm:front "f"@en ; sm:back "b"@en .
<#c2> a sm:Card ; sm:formatVersion 5 ; sm:front "g"@en ; sm:back "c"@en .
`;

const reviews = `${PREFIXES}<#c1> a sm:ReviewState ; sm:formatVersion 2 ; sm:reviewOf <../decks/shared.ttl#c1> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ;
  sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-11-19" ;
  sm:firstReviewedAt ${AT} ; sm:lastReviewedAt ${AT} .
`;

/** A pod in memory holding the two documents, and the GETs asked of it. */
async function pod() {
  let id = 0;
  const local = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${id++}"`,
  });
  for (const [url, body] of [
    [CARDS, cards],
    [REVIEWS, reviews],
  ])
    await local(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
  const reads: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") reads.push(String(input));
    return local(input, init);
  }) as typeof globalThis.fetch;
  return { fetch, reads };
}

describe("decks that name one cards and one reviews document", () => {
  it("are given one mapping of each read, and what is worked out of it once", async () => {
    const { fetch, reads } = await pod();
    const decks = createSolidDeckRepository({ fetch, now: () => NOW, randomId: () => "r" });
    const states = createSolidReviewStateRepository({ fetch });
    const [one, two] = [deckOf("deck-1"), deckOf("deck-2")];
    const [cardsOne, cardsTwo, reviewsOne, reviewsTwo] = await Promise.all([
      decks.readCardsSince(one, undefined),
      decks.readCardsSince(two, undefined),
      states.readReviewStatesSince(one, undefined),
      states.readReviewStatesSince(two, undefined),
    ]);
    if (cardsOne.unchanged || cardsTwo.unchanged || reviewsOne.unchanged || reviewsTwo.unchanged)
      throw new Error("A first read is never unchanged.");
    expect(reads.filter((url) => url === CARDS)).toHaveLength(1);
    expect(reads.filter((url) => url === REVIEWS)).toHaveLength(1);
    expect(cardsOne.value.map((card) => card.id)).toEqual(["c1", "c2"]);
    expect(cardsTwo.value).toBe(cardsOne.value);
    expect(reviewsOne.value.sm2.map((state) => state.cardId)).toEqual(["c1"]);
    expect(reviewsTwo.value).toBe(reviewsOne.value);
    expect(activeCardsOf(cardsTwo.value)).toBe(activeCardsOf(cardsOne.value));
    const schedule = scheduleFrom(cardsOne, one, reviewsOne, DEFAULT_PREFERENCES, NOW);
    expect(schedule).toMatchObject({ dueByDay: { "2026-11-19": 1 }, unreviewed: 1 });
    expect(scheduleFrom(cardsTwo, two, reviewsTwo, DEFAULT_PREFERENCES, NOW)).toBe(schedule);
  });

  it("are refused once finding how they read the reviews document goes through its names too often", async () => {
    // Each id starts the next, and the names of every document the states name.
    let ttl = PREFIXES;
    for (let i = 0; i < 10; i++) ttl += `<#n${i}> sm:reviewOf <../decks/aaaaaa-${i}.ttl#c> .\n`;
    const read = await datasetOfTurtle(REVIEWS, ttl);
    const ids = Array.from({ length: SCANS_OF_NAMES + 1 }, (_, n) => "a".repeat(n + 1));
    const [first, ...rest] = ids.map((id) => deckOf(id));
    const states = sharedReviewStatesOf(read, first!);
    for (const deck of rest.slice(0, -1)) sharedReviewStatesOf(read, deck);
    expect(() => sharedReviewStatesOf(read, rest.at(-1)!)).toThrow(
      expect.objectContaining({
        code: "reviewsReadTooManyWays",
        vars: { limit: 8, document: REVIEWS },
      }),
    );
    // A deck read before is read as before, and one whose id starts no name goes through none.
    expect(sharedReviewStatesOf(read, deckOf("a"))).toBe(states);
    expect(sharedReviewStatesOf(read, deckOf("b"))).toEqual({ sm2: [], fsrs: [] });
  });
});
