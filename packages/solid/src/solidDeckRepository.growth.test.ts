// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck's cards, review states and answers are written and removed in
 * time that grows with them, not their square, against a pod in memory:
 * a release added, its cards removed, one card's many distractors
 * written and changed, a deck removed from a document another app wrote
 * in, and cards, catalog entries and review states in an older format
 * brought to this app's. Eight times as many must take less than four
 * times as long as an eighth of them done eight times over (testing.md);
 * what puts the input in place is not timed (growthAfterSetup).
 */
import { describe, expect, it } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { ReviewState } from "@solid-memo/domain/review";
import { growthAfterSetup, growthAsync } from "@solid-memo/domain/testing/growth";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidAnswerLog } from "./solidAnswerLog";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";

const INSTANCE = "https://pod.example/memo/";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

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
function release(count: number): LibraryDeckContent {
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
function oneCard(count: number, first = 0): LibraryDeckContent {
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

/** A pod in memory and a deck repository over it. */
function repositoryInPod() {
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
async function put(fetch: typeof globalThis.fetch, url: string, text: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: text,
  });
  expect(response.ok).toBe(true);
}

/** The text of the document at `url`. */
async function read(fetch: typeof globalThis.fetch, url: string): Promise<string> {
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
async function deckWithStates(count: number) {
  const { fetch, repository } = repositoryInPod();
  const deck = await repository.importDeck(INSTANCE, release(0));
  const reviews = createSolidReviewStateRepository({ fetch, randomId: () => "id" });
  const states = Array.from({ length: count }, (_, i) => stateOf(i));
  await reviews.createReviewStates(deck, { sm2: states, fsrs: [] });
  return { fetch, deck, reviews, states };
}

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("add a release in time that grows with its cards, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const content = release(count);
        return () => repositoryInPod().repository.importDeck(INSTANCE, content);
      },
      600,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("add a release of one card with many distractors in time that grows with them, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const content = oneCard(count);
        return () => repositoryInPod().repository.importDeck(INSTANCE, content);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove a deck's cards in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const content = release(count);
        const { repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, content);
        const ids = content.cards.map((card) => card.id);
        return () => repository.applyCardChanges(deck, { save: [], remove: ids });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change every distractor of one card in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, oneCard(count));
        const card = oneCard(count, count).cards[0]!;
        return () => repository.applyCardChanges(deck, { save: [card], remove: [] });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

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

  it("bring review states in an older format to this app's in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, deck, reviews } = await deckWithStates(count);
        // The same states as format 1 wrote them.
        const text = await read(fetch, deck.reviewsDocumentUrl);
        const older = text.replaceAll(`formatVersion> "2"`, `formatVersion> "1"`);
        await put(fetch, deck.reviewsDocumentUrl, older);
        return async () => {
          expect(await reviews.upgradeReviewStates(deck)).toBe(true);
        };
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove review states in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { deck, reviews, states } = await deckWithStates(count);
        const keys = states.map(({ cardId, direction }) => ({ cardId, direction }));
        return () => reviews.applyReviewChanges(deck, { save: [], remove: keys, every: true });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove a day's answers in time that grows with them, not their square", async () => {
    const deckUrl = `${INSTANCE}catalog.ttl#deck-1`;
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch } = repositoryInPod();
        const log = createSolidAnswerLog({ fetch });
        const answers = Array.from(
          { length: count },
          (_, i): Answer => ({
            id: `answer-${i}`,
            deckUrl,
            cardUrl: `${INSTANCE}decks/deck-1.ttl#c${i}`,
            direction: "front-to-back",
            grade: 4,
            answeredAt: "2026-10-30T10:00:00.000Z",
            studyDay: "2026-10-30",
            nextIntervalDays: 6,
          }),
        );
        await log.appendAll(INSTANCE, answers);
        return () => log.removeDay(INSTANCE, deckUrl, "2026-10-30");
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
