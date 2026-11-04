// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { ReviewState } from "@solid-memo/domain/review";
import { createLocalPod } from "../localPod";
import { createMemoryResourceStore } from "../memoryResourceStore";
import { createSolidDeckRepository } from "../solidDeckRepository";
import { createSolidReviewStateRepository } from "../solidReviewStateRepository";

/**
 * What the growth tests of a deck's writes (solidDeckRepository.*.growth.test.ts)
 * share: releases of many cards or distractors, a deck repository over a
 * pod in memory, and decks with many review states or a catalog of many
 * decks put in place in it.
 */
export const INSTANCE = "https://pod.example/memo/";
export const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** A release of `cards`. */
function releaseOf(cards: LibraryDeckContent["cards"]): LibraryDeckContent {
  return {
    url: "https://library.example/releases/x/v1.ttl",
    seriesUrl: "https://library.example/releases/x/v1.ttl#series",
    title: { en: "Deck" },
    formatVersion: 6,
    authors: [],
    direction: "front-to-back",
    version: "1",
    themes: [],
    keywords: {},
    cards,
  };
}

/** A release of `count` cards, each with a distractor. */
export function release(count: number): LibraryDeckContent {
  return releaseOf(
    Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      front: { en: `front ${i}` },
      back: { en: `back ${i}` },
      formatVersion: 7,
      distractors: [{ id: `d${i}`, text: { en: `wrong ${i}` } }],
    })),
  );
}

/** A release of one card with `count` distractors, their ids from `first` on. */
export function oneCard(count: number, first = 0): LibraryDeckContent {
  return releaseOf([
    {
      id: "c0",
      front: { en: "front" },
      back: { en: "back" },
      formatVersion: 7,
      distractors: Array.from({ length: count }, (_, i) => ({
        id: `d${first + i}`,
        text: { en: `wrong ${first + i}` },
      })),
    },
  ]);
}

/** A release of `count` cards that all name one distractor, in `count` languages. */
export function sharedDistractor(count: number): LibraryDeckContent {
  const distractor = {
    id: "d",
    text: Object.fromEntries(Array.from({ length: count }, (_, i) => [`en-x-l${i}`, "wrong"])),
  };
  return releaseOf(
    Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      front: { en: `front ${i}` },
      back: { en: `back ${i}` },
      formatVersion: 7,
      distractors: [distractor],
    })),
  );
}

/** A pod in memory and a deck repository over it. */
export function repositoryInPod() {
  let n = 0;
  const fetch = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const repository = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-30T00:00:00Z"),
    randomId: () => `r${n++}`,
  });
  return { fetch, repository };
}

/** Puts `text` (Turtle) in place of the document at `url`. */
export async function put(
  fetch: typeof globalThis.fetch,
  url: string,
  text: string,
): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: text,
  });
  expect(response.ok).toBe(true);
}

/** The text of the document at `url`. */
export async function read(fetch: typeof globalThis.fetch, url: string): Promise<string> {
  return (await fetch(url)).text();
}

/** An SM-2 review state of the card `c${i}`. */
function stateOf(i: number): ReviewState {
  return {
    cardId: `c${i}`,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-10-31",
    firstReviewedAt: "2026-10-30T08:00:00.000Z",
    lastReviewedAt: "2026-10-30T08:00:00.000Z",
    formatVersion: 2,
  };
}

/** A deck in a pod in memory, with `count` review states in its reviews document. */
export async function deckWithStates(count: number) {
  const { fetch, repository } = repositoryInPod();
  const deck = await repository.importDeck(INSTANCE, release(0));
  const reviews = createSolidReviewStateRepository({ fetch, randomId: () => "id" });
  const states = Array.from({ length: count }, (_, i) => stateOf(i));
  await reviews.createReviewStates(deck, { sm2: states, fsrs: [] });
  return { fetch, deck, reviews, states };
}

/**
 * A catalog of `count` decks in this app's format, each listed by the
 * catalog and by one deck group, with its cards document, as the
 * Studio's bulk actions find them.
 */
export async function catalogOfDecks(count: number) {
  const { fetch, repository } = repositoryInPod();
  const entries = Array.from(
    { length: count },
    (_, i) =>
      `<#deck-${i}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "Deck ${i}" ; <${SM}cardsDocument> <decks/deck-${i}.ttl> ; <${SM}reviewsDocument> <reviews/deck-${i}.ttl> .`,
  );
  const listed = Array.from({ length: count }, (_, i) => `<#deck-${i}>`).join(", ");
  const group = `<#group-1> a <${SM}DeckGroup> ; <http://www.w3.org/ns/dcat#dataset> ${listed} .`;
  const catalog =
    "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> ; <http://www.w3.org/ns/dcat#catalog> <#group-1> .";
  await put(fetch, `${INSTANCE}catalog.ttl`, [catalog, group, ...entries].join("\n"));
  expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
  // Each deck's cards document, saying it is the deck's: removed with it.
  for (let i = 0; i < count; i++) {
    const card = `<#c0> a <${SM}Card> ; <${SM}front> "front" ; <${SM}back> "back" ; <${SM}formatVersion> 7 .`;
    const partOf = `<> <http://purl.org/dc/terms/isPartOf> <../catalog.ttl#deck-${i}> .`;
    await put(fetch, `${INSTANCE}decks/deck-${i}.ttl`, `${partOf}\n${card}`);
  }
  return { fetch, repository };
}
