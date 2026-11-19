// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A card whose id is as long as a card's IRI may be, imported from a deck
 * file, copied from a release or added from a guest's deck: its review
 * states, of SM-2 and FSRS-6, each way, whose subjects named after the
 * card would be longer than a term may be, are written at short subjects
 * instead, so the switch to FSRS-6 and grading work for it as for any
 * card, and a guest's copy keeps it (GHSA-x3xv-53q7-9cc6).
 *
 * A state whose card's IRI in the deck's cards document would be longer
 * than a term may be, when that document's address is longer than the
 * reviews document's, is no state of the deck: the format update and the
 * switch to FSRS-6 leave it as it is (GHSA-v7v4-qccx-c3cg).
 */
import { describe, expect, it } from "vitest";
import { deckFileBaseOf, importedDeck } from "@solid-memo/domain/deckFile";
import type { Deck } from "@solid-memo/domain/deck";
import { gradePrompt } from "@solid-memo/domain/grading";
import { isIriPastBound } from "@solid-memo/domain/pathKeys";
import type { ReviewKey } from "@solid-memo/domain/review";
import { namedFsrsSubject, namedReviewSubject } from "@solid-memo/domain/reviewRecord";
import { switchedStates } from "@solid-memo/domain/schedulerSwitch";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { asUrl, getPropertyAll, getTermAll, getThingAll } from "./client/rdf";
import { getSolidDatasetOrNull } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { release } from "./testing/deckWrites";

const INSTANCE = "https://pod.example/alice/solid-memo/";
const NOW = new Date("2026-11-14T12:00:00Z");
const AT = '"2026-11-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>';
const FSRS6 = { scheduler: "fsrs6" as const, desiredRetention: 0.9, dayBoundaryHour: 0 };

/** The pod in memory, with the shape check on every write, and the repositories over it. */
function pod() {
  let id = 0;
  const fetch = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${id++}"`,
  });
  const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).over(fetch);
  return {
    fetch,
    decks: createSolidDeckRepository({
      fetch,
      now: () => NOW,
      randomId: () => "copied",
      checkWrite: validator.checkSubjects,
    }),
    reviews: createSolidReviewStateRepository({
      fetch,
      checkWrite: validator.checkSubjects,
      randomId: () => `r${id++}`,
    }),
  };
}

/**
 * The card ids under test in a deck of these documents, each with what
 * it is: the longest whose IRI fits, whose every named state subject is
 * too long; and the shortest whose FSRS-6 subject is too long, while its
 * SM-2 subject fits.
 */
function cardIdsIn(cardsDocumentUrl: string, reviewsDocumentUrl: string): [string, string][] {
  let longest = 1;
  while (!isIriPastBound(`${cardsDocumentUrl}#${"c".repeat(longest + 1)}`)) longest++;
  let fsrs = 1;
  while (!isIriPastBound(namedFsrsSubject(reviewsDocumentUrl, key("c".repeat(fsrs))))) fsrs++;
  expect(isIriPastBound(namedReviewSubject(reviewsDocumentUrl, key("c".repeat(fsrs))))).toBe(false);
  return [
    ["the longest card IRI", "c".repeat(longest)],
    ["the shortest FSRS-6 subject too long", "c".repeat(fsrs)],
  ];
}

const key = (cardId: string, direction: ReviewKey["direction"] = "front-to-back"): ReviewKey => ({
  cardId,
  direction,
});

/** A deck file of one card `cardId`, with an SM-2 state of it, at absolute IRIs. */
const deckFileOf = (cardId: string) => `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<#deck-crafted> a sm:Deck ; <http://purl.org/dc/terms/title> "Deck" ; sm:formatVersion 1 ;
  sm:cardsDocument <http://a/c> ; sm:reviewsDocument <http://a/r> .
<http://a/c#${cardId}> a sm:Card ; sm:front "F" ; sm:back "B" ; sm:formatVersion 1 .
<http://a/r#${cardId}> a sm:ReviewState ; sm:formatVersion 2 ; sm:reviewOf <http://a/c#${cardId}> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ; sm:easeFactor 2.5 ;
  sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-11-02" ;
  sm:firstReviewedAt ${AT} ; sm:lastReviewedAt ${AT} .
`;

/** The deck of the file, imported as importDeckFile (cards.ts) imports it, with its progress. */
async function importedFromFile(cardId: string): Promise<{ deck: Deck } & ReturnType<typeof pod>> {
  const at = pod();
  const content = await createSolidDeckArchive({
    fetch: at.fetch,
    publicFetch: at.fetch,
  }).readDeckFile(deckFileOf(cardId), "turtle", deckFileBaseOf("deck.ttl"));
  const imported = importedDeck(INSTANCE, content, {
    withProgress: true,
    decks: [],
    freshId: "deck-fresh",
    now: NOW.toISOString(),
  });
  await at.decks.applyCardChanges(
    imported.deck,
    { save: imported.cards, remove: [] },
    { whole: true, version: "absent" as never },
  );
  await at.reviews.applyReviewChanges(imported.deck, {
    save: imported.reviews,
    remove: [],
    fsrs: { save: imported.fsrsReviews, remove: [] },
  });
  const deck = await at.decks.registerDeck(imported.deck);
  return { deck, ...at };
}

/** The deck of a release of one card `cardId`, copied as from a link, and graded once by SM-2. */
async function copiedFromRelease(cardId: string): Promise<{ deck: Deck } & ReturnType<typeof pod>> {
  const at = pod();
  const one = release(1);
  const deck = await at.decks.importDeck(INSTANCE, {
    ...one,
    cards: one.cards.map((card) => ({ ...card, id: cardId })),
  });
  await at.reviews.gradeReviewState(deck, key(cardId), (current) =>
    gradePrompt(key(cardId), current, { grade: 4, mode: "recall" }, NOW, {
      ...FSRS6,
      scheduler: "sm2",
    }),
  );
  return { deck, ...at };
}

const CARDS_FROM_FILE = `${INSTANCE}decks/deck-crafted.ttl`;
const CARDS_COPIED = `${INSTANCE}decks/deck-copied.ttl`;

describe.each([
  ["imported from a deck file", importedFromFile, CARDS_FROM_FILE],
  ["copied from a release", copiedFromRelease, CARDS_COPIED],
])("a card whose id is as long as fits, %s", (_how, imported, cardsDocumentUrl) => {
  const reviewsDocumentUrl = cardsDocumentUrl.replace("/decks/", "/reviews/");

  it.each(cardIdsIn(cardsDocumentUrl, reviewsDocumentUrl))(
    "switches to FSRS-6 and is graded each way under it: %s",
    async (_, cardId) => {
      const { deck, reviews, fetch } = await imported(cardId);
      expect(deck.reviewsDocumentUrl).toBe(reviewsDocumentUrl);

      // The switch, as preferences.ts switchScheduler writes each deck's states.
      await reviews.writeFsrsStates(
        deck,
        ({ sm2 }) => switchedStates(deck.url, sm2, [], NOW, 0).fsrs,
      );
      const switched = await reviews.listReviewStates(deck);
      expect(switched.fsrs.map(({ cardId: id, direction }) => key(id, direction))).toEqual([
        key(cardId),
      ]);

      for (const direction of ["front-to-back", "back-to-front"] as const) {
        for (const grade of [4, 2] as const) {
          const graded = await reviews.gradeReviewState(deck, key(cardId, direction), (current) =>
            gradePrompt(key(cardId, direction), current, { grade, mode: "recall" }, NOW, FSRS6),
          );
          expect(graded.state.fsrs).toBeDefined();
        }
      }
      // Each prompt's states, once each though graded twice (the short subject kept), each fits.
      const states = await reviews.listReviewStates(deck);
      expect(states.sm2.map((state) => state.direction).sort()).toEqual([
        "back-to-front",
        "front-to-back",
      ]);
      expect(states.fsrs.map((state) => state.direction).sort()).toEqual([
        "back-to-front",
        "front-to-back",
      ]);
      const subjects = getThingAll((await getSolidDatasetOrNull(reviewsDocumentUrl, fetch))!)
        .map(asUrl)
        .filter((url) => url.startsWith(`${reviewsDocumentUrl}#`));
      expect(subjects).toHaveLength(4);
      expect(subjects.every((url) => !isIriPastBound(url))).toBe(true);
    },
  );
});

describe("a card whose id is as long as fits, added from a guest's deck", () => {
  const reviewsDocumentUrl = CARDS_COPIED.replace("/decks/", "/reviews/");

  it.each(cardIdsIn(CARDS_COPIED, reviewsDocumentUrl))(
    "keeps its states of each kind, each way: %s",
    async (_, cardId) => {
      const at = pod();
      const one = release(1);
      const deck = await at.decks.importDeck(INSTANCE, {
        ...one,
        cards: one.cards.map((card) => ({ ...card, id: cardId })),
      });
      // The guest's states, as addGuestDeck (session.ts) writes them in one PUT.
      const graded = (["front-to-back", "back-to-front"] as const).map((direction) =>
        gradePrompt(
          key(cardId, direction),
          { sm2: null, fsrs: null },
          { grade: 4, mode: "recall" },
          NOW,
          FSRS6,
        ),
      );
      await at.reviews.createReviewStates(deck, {
        sm2: graded.map(({ sm2 }) => sm2),
        fsrs: graded.map(({ fsrs }) => fsrs!),
      });

      const states = await at.reviews.listReviewStates(deck);
      expect(states.sm2.map((state) => state.direction).sort()).toEqual([
        "back-to-front",
        "front-to-back",
      ]);
      expect(states.fsrs.map((state) => state.direction).sort()).toEqual([
        "back-to-front",
        "front-to-back",
      ]);
      const subjects = getThingAll((await getSolidDatasetOrNull(reviewsDocumentUrl, at.fetch))!)
        .map(asUrl)
        .filter((url) => url.startsWith(`${reviewsDocumentUrl}#`));
      expect(subjects).toHaveLength(4);
      expect(subjects.every((url) => !isIriPastBound(url))).toBe(true);
    },
  );
});

describe("a review state of no card, whose card IRI would be longer than a term may be", () => {
  const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
  // A cards document as an older upgrade named it, longer than the reviews document.
  const cardsDocumentUrl = `${INSTANCE}decks/deck-1-0123456789abcdef0123456789abcdef0123.ttl`;
  const reviewsDocumentUrl = `${INSTANCE}reviews/deck-1.ttl`;
  const deck = {
    id: "deck-1",
    url: `${INSTANCE}catalog.ttl#deck-1`,
    title: { en: "Deck" },
    cardsDocumentUrl,
    reviewsDocumentUrl,
    createdAt: "2026-01-01T00:00:00.000Z",
    formatVersion: 6,
    direction: "front-to-back",
    authors: [],
  } as unknown as Deck;
  /** A state of the first format, naming neither its card nor its scheduler. */
  const formatOne = (fragment: string) =>
    `<${reviewsDocumentUrl}#${fragment}> a <${SM}ReviewState> ; <${SM}easeFactor> 2.5 ;` +
    ` <${SM}intervalDays> 1 ; <${SM}repetitions> 1 ; <${SM}due> "2026-11-02" ;` +
    ` <${SM}firstReviewedAt> ${AT} ; <${SM}lastReviewedAt> ${AT} .\n`;

  it("is left as it is by the format update and the switch to FSRS-6", async () => {
    const { fetch, reviews } = pod();
    let length = 1;
    while (!isIriPastBound(`${reviewsDocumentUrl}#${"c".repeat(length + 1)}`)) length++;
    const orphan = "c".repeat(length);
    expect(isIriPastBound(`${cardsDocumentUrl}#${orphan}`)).toBe(true);
    const put = await fetch(reviewsDocumentUrl, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: formatOne("ok") + formatOne(orphan),
    });
    expect(put.ok).toBe(true);

    expect((await reviews.listReviewStates(deck)).sm2.map((state) => state.cardId)).toEqual(["ok"]);
    await expect(reviews.upgradeReviewStates(deck)).resolves.toBe(true);
    await reviews.writeFsrsStates(
      deck,
      ({ sm2 }) => switchedStates(deck.url, sm2, [], NOW, 0).fsrs,
    );

    const states = await reviews.listReviewStates(deck);
    expect(states.sm2.map((state) => state.cardId)).toEqual(["ok"]);
    expect(states.fsrs.map((state) => state.cardId)).toEqual(["ok"]);
    const dataset = (await getSolidDatasetOrNull(reviewsDocumentUrl, fetch))!;
    const left = getThingAll(dataset).find(
      (thing) => asUrl(thing) === `${reviewsDocumentUrl}#${orphan}`,
    )!;
    expect(getPropertyAll(left).sort()).toEqual(
      [
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        `${SM}easeFactor`,
        `${SM}intervalDays`,
        `${SM}repetitions`,
        `${SM}due`,
        `${SM}firstReviewedAt`,
        `${SM}lastReviewedAt`,
      ].sort(),
    );
    const leftValues = (property: string) =>
      getTermAll(left, `${SM}${property}`).map((term) => term.value);
    expect(leftValues("easeFactor")).toEqual(["2.5"]);
    expect(leftValues("intervalDays")).toEqual(["1"]);
    expect(leftValues("repetitions")).toEqual(["1"]);
    expect(leftValues("due")).toEqual(["2026-11-02"]);
  });
});
