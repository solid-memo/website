// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A card's id is its fragment in the deck's cards document, and its
 * review states are found by that id. A subject of another document that
 * a cards or reviews document states things of may share the fragment,
 * but it is never one of the deck's cards or states: a bulk edit, its
 * undo and removing a card leave the deck's own card and its progress as
 * they are. The pod is a local one, every write checked against the
 * shapes.
 */
import { describe, expect, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { planCardEdit, type CardChanges } from "@solid-memo/domain/cardBulk";
import type { ReviewState } from "@solid-memo/domain/review";
import { buildThing, getThing, removeThings, setThing, type NamedSubject } from "./client/rdf";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { SM } from "./vocab";

const POD = "https://pod.example/";
const ELSEWHERE = "https://elsewhere.example/x";
/** An instance address spelled otherwise than a request sends it, as the app writes its subjects. */
const SPELLED = "https://POD.example/memo/";

/**
 * Where a subject at a card's fragment is planted, given the document's
 * address: another document, or another spelling of the same document
 * (the host in capitals, the default port, a dot segment), which is
 * another subject of the dataset all the same.
 */
const SPELLINGS: [string, (documentUrl: string) => string][] = [
  ["another document", () => ELSEWHERE],
  ["the host in capitals", (url) => url.replace(POD, "https://POD.example/")],
  ["the default port", (url) => url.replace(POD, "https://pod.example:443/")],
  ["a dot segment", (url) => url.replace(POD, `${POD}./`)],
];

const STATE: Omit<ReviewState, "cardId"> = {
  direction: "front-to-back",
  due: "2026-12-01",
  intervalDays: 30,
  easeFactor: 2.5,
  repetitions: 5,
  firstReviewedAt: "2026-10-01T10:00:00.000Z",
  lastReviewedAt: "2026-11-01T10:00:00.000Z",
  formatVersion: 2,
};

/** A deck with one card and its progress, and, beside the card, a subject at the card's fragment where `spelled` puts it. */
async function setup(spelled: (documentUrl: string) => string, instance = `${POD}memo/`) {
  let n = 0;
  const fetch = createLocalPod({
    root: POD,
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).over(fetch);
  const decks = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-13T00:00:00Z"),
    randomId: () => `r${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const reviews = createSolidReviewStateRepository({
    fetch,
    randomId: () => `s${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const deck = await decks.createDeck(instance, { en: "Capitals" });
  const card = await decks.addCard(deck, {
    front: { en: "Capital of France?" },
    back: { en: "Paris" },
  });
  await reviews.applyReviewChanges(deck, { save: [{ ...STATE, cardId: card.id }], remove: [] });
  const planted = `${spelled(deck.cardsDocumentUrl)}#${card.id}`;
  const dataset = (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch))!;
  // The card's statements, at another document's subject, with other text.
  const copy = { ...getThing(dataset, card.url)!, url: planted } as NamedSubject;
  await saveDataset(
    deck.cardsDocumentUrl,
    setThing(
      dataset,
      buildThing(copy)
        .removeAll(SM.front)
        .addStringWithLocale(SM.front, "Capital of Germany?", "en")
        .build(),
    ),
    fetch,
  );
  const stored = async () =>
    getThing((await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch))!, planted);
  expect(planted).not.toBe(card.url);
  expect(await stored()).not.toBeNull();
  const fronts = async () =>
    (await decks.listCards(deck)).map((one) => [one.url, one.front.en, one.retired ?? false]);
  const progress = async () =>
    (await reviews.listReviewStates(deck)).sm2.map((state) => [state.cardId, state.intervalDays]);
  const write = async (changes: CardChanges) => {
    await decks.applyCardChanges(deck, { save: changes.save, remove: changes.remove });
    await reviews.applyReviewChanges(deck, {
      save: changes.reviewSaves,
      remove: changes.reviewRemovals,
      every: true,
    });
  };
  return { fetch, decks, reviews, deck, card, planted, fronts, progress, write };
}

describe("a subject at a card's fragment at the address as fetched, of a deck spelled otherwise", () => {
  const fetched = (url: string) => new URL(url).href;

  it("is not read beside the card, which the deck's own spelling names", async () => {
    const { decks, deck, card, planted, fronts, progress, write } = await setup(fetched, SPELLED);
    expect(card.url.startsWith(SPELLED)).toBe(true);
    expect(await fronts()).toEqual([[card.url, "Capital of France?", false]]);
    await write(planCardEdit(await decks.listCards(deck), [card.id], { kind: "retire" }));
    expect(await fronts()).toEqual([[card.url, "Capital of France?", true]]);
    await expect(decks.removeCard(deck, { ...card, url: planted })).rejects.toMatchObject({
      code: "cardGone",
    });
    expect(await progress()).toEqual([[card.id, 30]]);
    await decks.removeCard(deck, card);
    expect(await progress()).toEqual([]);
  });

  it("is read as the deck's own where nothing at its own spelling shares its fragment", async () => {
    const { fetch, deck, card, progress } = await setup(fetched, SPELLED);
    const dataset = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch))!;
    const own = `${deck.reviewsDocumentUrl}#${card.id}`;
    const copy = { ...getThing(dataset, own)!, url: fetched(own) } as NamedSubject;
    expect(copy.url).not.toBe(own);
    await saveDataset(deck.reviewsDocumentUrl, setThing(removeThings(dataset, [own]), copy), fetch);
    expect(await progress()).toEqual([[card.id, 30]]);
  });
});

describe.each(SPELLINGS)("a subject at a card's fragment in %s", (_, spelled) => {
  it("is no card of the deck, read in full or since a version", async () => {
    const { decks, deck, card, fronts } = await setup(spelled);
    expect(await fronts()).toEqual([[card.url, "Capital of France?", false]]);
    const since = await decks.readCardsSince(deck, undefined);
    expect(since.unchanged === false && since.value.map((one) => one.url)).toEqual([card.url]);
  });

  it("is never written over the card by a bulk edit", async () => {
    const { decks, reviews, deck, card, fronts, progress, write } = await setup(spelled);
    const plan = planCardEdit(await decks.listCards(deck), [card.id], { kind: "retire" });
    await write(plan);
    expect(await fronts()).toEqual([[card.url, "Capital of France?", true]]);
    expect(await progress()).toEqual([[card.id, 30]]);
    expect((await reviews.listReviewStates(deck)).sm2).toHaveLength(1);
  });

  it("is never written back as the card when a bulk remove is undone", async () => {
    const { decks, reviews, deck, card, fronts, progress, write } = await setup(spelled);
    const plan = planCardEdit(
      await decks.listCards(deck),
      [card.id],
      { kind: "remove" },
      (await reviews.listReviewStates(deck)).sm2,
    );
    await write(plan);
    expect(await fronts()).toEqual([]);
    await write(plan.inverse);
    expect(await fronts()).toEqual([[card.url, "Capital of France?", false]]);
    expect(await progress()).toEqual([[card.id, 30]]);
  });

  it("cannot be removed as a card, so the card keeps its progress", async () => {
    const { decks, deck, card, planted, fronts, progress } = await setup(spelled);
    await expect(decks.removeCard(deck, { ...card, url: planted })).rejects.toMatchObject({
      code: "cardGone",
    });
    expect(await fronts()).toEqual([[card.url, "Capital of France?", false]]);
    expect(await progress()).toEqual([[card.id, 30]]);
  });

  it("in the reviews document, is no state of the card", async () => {
    const { fetch, deck, card, progress } = await setup(spelled);
    const dataset = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch))!;
    const own = `${deck.reviewsDocumentUrl}#${card.id}`;
    // The card's state, moved to another document's subject at the same fragment.
    const copy = {
      ...getThing(dataset, own)!,
      url: `${spelled(deck.reviewsDocumentUrl)}#${card.id}`,
    } as NamedSubject;
    await saveDataset(deck.reviewsDocumentUrl, setThing(removeThings(dataset, [own]), copy), fetch);
    expect(await progress()).toEqual([]);
  });

  it("in the reviews document, stays when the card is removed", async () => {
    const { fetch, decks, deck, card, progress } = await setup(spelled);
    const dataset = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch))!;
    const own = `${deck.reviewsDocumentUrl}#${card.id}`;
    const foreign = `${spelled(deck.reviewsDocumentUrl)}#${card.id}`;
    // The card's state, copied to another document's subject at the same fragment.
    const copy = { ...getThing(dataset, own)!, url: foreign } as NamedSubject;
    await saveDataset(deck.reviewsDocumentUrl, setThing(dataset, copy), fetch);
    await decks.removeCard(deck, card);
    expect(await progress()).toEqual([]);
    const after = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch))!;
    expect(getThing(after, own)).toBeNull();
    expect(getThing(after, foreign)).not.toBeNull();
  });
});
