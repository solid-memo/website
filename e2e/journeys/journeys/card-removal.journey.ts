// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { SM } from "../flows/podDocuments.ts";
import type { OtherApp } from "../harness/otherApp.ts";
import { escapeRegExp } from "../harness/strings.ts";

/**
 * Removing cards, each way the apps offer: one never studied from its
 * deck's Browser, one studied from its own page, one in the Studio's
 * card inspector, and the two left with the card workbench's Delete,
 * undone, then one of them deleted for good. Each card leaves the lists
 * and the counts, the one never studied leaves the study session too,
 * and a reload finds it so. The pod is read with plain requests after
 * each removal: the deck's cards document no longer names the card, its
 * reviews document holds none of its review states, and its answers stay
 * in the answer log
 * (docs/data-model.md#the-answer-log). Undo puts the cards back under
 * the same subjects with their SM-2 states; FSRS-6 estimates from them
 * (docs/studio.md). How journeys are run, read when they fail and
 * written: docs/testing.md#user-journeys.
 *
 * It catches a removal that leaves a card's review states behind (both
 * schedulers', in a deck studied one way), one that drops its answers
 * from the log, a count that still holds a removed card or a session
 * that still holds the one never studied, and an Undo that brings a
 * card back under another subject or without its progress. Five new cards, the new cards a day of a new instance, so
 * removing one never studied shows in the counts.
 */
test("removing cards in Solid Memo and the Studio: gone from the lists, the counts, the study session and the pod @studio", async ({
  app,
  account,
  otherApp,
  runId,
}) => {
  const instanceName = `Removal ${runId}`;
  const folder = `${account.pod}solid-memo/main/`;
  const deck = `Planets ${runId}`;
  const mercury = `Mercury ${runId}`;
  const venus = `Venus ${runId}`;
  const earth = `Earth ${runId}`;
  const mars = `Mars ${runId}`;
  const jupiter = `Jupiter ${runId}`;
  let documents!: DeckDocuments;
  let subjects!: Record<string, string>;
  /** Each card's answers in the log, by its subject, read again until they are as expected. */
  const expectAnswers = (expected: Record<string, number>, message: string) =>
    expect.poll(() => answersTo(otherApp, folder), { message }).toEqual(expected);

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { screen: "onboarding" });

  await app.step(
    "02 · Log in with a WebID",
    () => logInAndCreateInstance(app, account, instanceName),
    { screen: "decks.empty" },
  );

  await app.step(
    "03 · Create a deck and add five cards",
    async () => {
      await app.decks.openDeckCreator();
      await app.deckCreator.create(deck);
      await app.deckBrowser.openFor(deck);
      await app.deckBrowser.openCardCreator();
      await app.cardCreator.addCards(
        [
          [mercury, "Merkurius"],
          [venus, "Venus"],
          [earth, "Jorden"],
          [mars, "Mars"],
          [jupiter, "Jupiter"],
        ],
        { front: "en", back: "sv" },
      );
      await app.cardCreator.back();
      await app.deckBrowser.expectFronts([mercury, venus, earth, mars, jupiter]);
      documents = await deckInPod(otherApp, folder);
      await expect
        .poll(async () => [...(await cardsInPod(otherApp, documents)).keys()].sort())
        .toEqual([earth, jupiter, mars, mercury, venus]);
      subjects = Object.fromEntries(await cardsInPod(otherApp, documents));
    },
    { screen: "deck-browser" },
  );

  await app.step(
    "04 · Remove a card never studied from the deck's Browser",
    async () => {
      await app.deckBrowser.removeCard(jupiter, [mercury, venus, earth, mars]);
      await expectCards(otherApp, documents, [mercury, venus, earth, mars], subjects);
      await expectNamedNowhere(otherApp, documents.cards, subjects[jupiter]!);
      // Never studied, it had no review states: the counts and the session below carry this step.
    },
    { screen: "deck-browser" },
  );

  await app.step(
    "05 · The deck counts four, and its session holds four: study them all",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.expectToReview(deck, 4);
      await app.decks.openDeck(deck);
      await app.deckDetail.expectCardCount(4);
      await app.deckDetail.study();
      await app.study.expectPosition(1, 4);
      expect(await app.study.studyAll({ grade: "good" })).toEqual({ studied: 4, total: 4 });
      await app.study.endSession();
      await app.decks.expectDoneForToday(deck);
      await app.decks.expectAnsweredToday(4);
      for (const front of [mercury, venus, earth, mars])
        expect(await statesOf(otherApp, documents, subjects[front]!), front).not.toEqual([]);
      // The log is written in the background: read until it holds the four answers.
      await expectAnswers(
        Object.fromEntries([mercury, venus, earth, mars].map((front) => [subjects[front]!, 1])),
        "one answer to each card studied, none to the card removed",
      );
    },
    { screen: "decks" },
  );

  await app.step(
    "06 · Remove a studied card on its own page",
    async () => {
      await expectBothSchedulers(otherApp, documents, mars, subjects[mars]!);
      await app.deckBrowser.openFor(deck);
      await app.cardEditor.open(mars);
      await app.cardEditor.remove(deck, mars, [mercury, venus, earth]);
      await expectCards(otherApp, documents, [mercury, venus, earth], subjects);
      await expectNamedNowhere(otherApp, documents.cards, subjects[mars]!);
      // Its states for both schedulers are gone; the others' are not.
      expect(await statesOf(otherApp, documents, subjects[mars]!)).toEqual([]);
      for (const front of [mercury, venus, earth])
        expect(await statesOf(otherApp, documents, subjects[front]!), front).not.toEqual([]);
      // The answer log keeps the removed card's answer.
      await expectAnswers(
        Object.fromEntries([mercury, venus, earth, mars].map((front) => [subjects[front]!, 1])),
        "the answer log keeps every answer",
      );
    },
    { screen: "deck-browser" },
  );

  await app.step(
    "07 · Reload: three cards, the deck done for today, four answers counted",
    async () => {
      await app.chrome.reload();
      await app.deckBrowser.expectDeck(deck);
      await app.deckBrowser.expectFronts([mercury, venus, earth]);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.expectDoneForToday(deck);
      await app.decks.expectAnsweredToday(4);
      await app.decks.openDeck(deck);
      await app.deckDetail.expectCardCount(3);
    },
    { screen: "deck" },
  );

  await app.step(
    "08 · The statistics keep the four answers and count the cards that are left",
    async () => {
      await app.statistics.open();
      // The answers and the cards studied come from the log; where the cards stand, from their review states.
      await app.statistics.expectStatistics({
        answers: 4,
        cards: 4,
        maturity: { new: 0, relearning: 0, young: 3, mature: 0 },
        decks: [{ name: deck, answers: 4, introduced: 4, lapses: 0, lastStudied: "today" }],
      });
    },
    { screen: "statistics" },
  );

  await app.step(
    "09 · Remove a card in the Studio's card inspector",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.openFromApp();
      await app.studio.expectDeck(instanceName, deck, { cards: 3, due: 0 });
      await app.studio.openCards(instanceName, deck, [mercury, venus, earth]);
      await expectBothSchedulers(otherApp, documents, earth, subjects[earth]!);
      await app.studio.openCard(deck, earth);
      await app.studio.removeInspectedCard(deck, earth, [mercury, venus]);
      await expectCards(otherApp, documents, [mercury, venus], subjects);
      await expectNamedNowhere(otherApp, documents.cards, subjects[earth]!);
      expect(await statesOf(otherApp, documents, subjects[earth]!)).toEqual([]);
      expect(total(await answersTo(otherApp, folder)), "answers in the log").toBe(4);
    },
    { screen: "studio.cards" },
  );

  const before: Record<string, string[]> = {};

  await app.step(
    "10 · Delete the two cards left in the workbench, then undo it",
    async () => {
      for (const front of [mercury, venus]) {
        before[front] = await statesOf(otherApp, documents, subjects[front]!);
        expect(sm2(before[front]!), `${front}: a state of SM-2's`).not.toEqual([]);
      }
      await app.studio.selectCardsWithKeys(deck, 2);
      await app.studio.deleteSelectedCards(deck, [mercury, venus]);
      await expectCards(otherApp, documents, [], subjects);
      for (const front of [mercury, venus])
        expect(await statesOf(otherApp, documents, subjects[front]!), front).toEqual([]);
      await app.studio.undoCardEdit(deck, [mercury, venus]);
      // The same subjects again, with the SM-2 states they had.
      await expectCards(otherApp, documents, [mercury, venus], subjects);
      for (const front of [mercury, venus])
        expect(await statesOf(otherApp, documents, subjects[front]!), front).toEqual(
          sm2(before[front]!),
        );
    },
    { screen: "studio.cards" },
  );

  await app.step(
    "11 · Delete one card for good",
    async () => {
      // A delete leaves nothing selected; the sort takes the focus out of the search too.
      await app.studio.sortCardsBy(deck, "front", [mercury, venus]);
      await app.studio.selectCardsWithKeys(deck, 1);
      await app.studio.deleteSelectedCards(deck, [mercury]);
      await expectCards(otherApp, documents, [venus], subjects);
      expect(await statesOf(otherApp, documents, subjects[mercury]!)).toEqual([]);
      expect(await statesOf(otherApp, documents, subjects[venus]!)).toEqual(sm2(before[venus]!));
    },
    { screen: "studio.cards" },
  );

  await app.step(
    "12 · Reload: the Studio and Solid Memo hold the one card left, and Undo is gone",
    async () => {
      await app.chrome.reload();
      await app.studio.expectCardsWithoutUndo(deck, [venus]);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.expectDeck(instanceName, deck, { cards: 1, due: 0 });
      await app.studio.backToApp();
      await app.decks.expectDoneForToday(deck);
      await app.decks.expectAnsweredToday(4);
      await app.deckBrowser.openFor(deck);
      await app.deckBrowser.expectFronts([venus]);
      // The pod: the one card, its SM-2 states alone, and every answer.
      await expectCards(otherApp, documents, [venus], subjects);
      expect(await reviewStatesIn(otherApp, documents)).toEqual(sm2(before[venus]!));
      await expectAnswers(
        Object.fromEntries([mercury, venus, earth, mars].map((front) => [subjects[front]!, 1])),
        "the answer log keeps every answer",
      );
    },
    { screen: "deck-browser" },
  );
});

/** The deck's documents, as the instance's catalog names them. */
interface DeckDocuments {
  cards: string;
  reviews: string;
}

const RDF_TYPE = "<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>";

/** The one deck's cards and reviews documents, read from the instance's catalog. */
async function deckInPod(pod: OtherApp, folder: string): Promise<DeckDocuments> {
  const catalog = (await pod.triples(`${folder}catalog.ttl`)) ?? [];
  const one = (predicate: string) => {
    const pattern = new RegExp(`^<[^>]+> <${escapeRegExp(SM + predicate)}> <([^>]+)> \\.$`);
    const found = catalog.flatMap((line) => pattern.exec(line)?.[1] ?? []);
    expect(found, `the catalog's one ${predicate}`).toHaveLength(1);
    return found[0]!;
  };
  return { cards: one("cardsDocument"), reviews: one("reviewsDocument") };
}

/** The cards in the deck's cards document: each one's subject, by its front (ASCII, so as written). */
async function cardsInPod(pod: OtherApp, deck: DeckDocuments): Promise<Map<string, string>> {
  const lines = (await pod.triples(deck.cards)) ?? [];
  const cards = new Set(
    lines.flatMap(
      (line) =>
        new RegExp(`^<([^>]+)> ${escapeRegExp(RDF_TYPE)} <${escapeRegExp(`${SM}Card`)}> \\.$`).exec(
          line,
        )?.[1] ?? [],
    ),
  );
  const front = new RegExp(
    `^<([^>]+)> <${escapeRegExp(`${SM}front`)}> "([^"]*)"(?:@[\\w-]+)? \\.$`,
  );
  const found = new Map<string, string>();
  for (const line of lines) {
    const match = front.exec(line);
    if (match !== null && cards.has(match[1]!)) found.set(match[2]!, match[1]!);
  }
  return found;
}

/** The deck's cards document holds exactly the cards of these fronts, under the subjects they were made with. */
async function expectCards(
  pod: OtherApp,
  deck: DeckDocuments,
  fronts: string[],
  subjects: Record<string, string>,
): Promise<void> {
  expect(Object.fromEntries(await cardsInPod(pod, deck)), "the cards document's cards").toEqual(
    Object.fromEntries(fronts.map((front) => [front, subjects[front]])),
  );
}

/** No triple of the document at `url` names `subject`. */
async function expectNamedNowhere(pod: OtherApp, url: string, subject: string): Promise<void> {
  const lines = (await pod.triples(url)) ?? [];
  expect(
    lines.filter((line) => line.includes(`<${subject}>`)),
    `${url} names ${subject}`,
  ).toEqual([]);
}

/**
 * The card's review states in the deck's reviews document, sorted: those
 * named after the card (`#<id>`, then `@back-to-front` and `@fsrs6` as
 * they apply) and those that name it (sm:reviewOf). None while there is
 * no reviews document.
 */
async function statesOf(pod: OtherApp, deck: DeckDocuments, card: string): Promise<string[]> {
  const lines = (await pod.triples(deck.reviews)) ?? [];
  const id = card.slice(card.indexOf("#") + 1);
  const named = new RegExp(
    `^<(${escapeRegExp(`${deck.reviews}#${id}`)}(?:@back-to-front)?(?:@fsrs6)?)> `,
  );
  const reviewOf = new RegExp(
    `^<([^>]+)> <${escapeRegExp(`${SM}reviewOf`)}> <${escapeRegExp(card)}> \\.$`,
  );
  const found = new Set(
    lines.flatMap((line) => named.exec(line)?.[1] ?? reviewOf.exec(line)?.[1] ?? []),
  );
  return [...found].sort();
}

/** The SM-2 states among these: the workbench's Undo brings back those alone, FSRS-6 estimates from them (docs/studio.md). */
function sm2(states: string[]): string[] {
  return states.filter((state) => !state.endsWith("@fsrs6"));
}

/** The card, about to be removed, has a state of each scheduler's, so that their removal means something. */
async function expectBothSchedulers(
  pod: OtherApp,
  deck: DeckDocuments,
  front: string,
  card: string,
): Promise<void> {
  const states = await statesOf(pod, deck, card);
  expect(sm2(states), `${front}: a state of SM-2's`).not.toEqual([]);
  expect(
    states.filter((state) => state.endsWith("@fsrs6")),
    `${front}: a state of FSRS-6's`,
  ).not.toEqual([]);
}

/** Every review state in the deck's reviews document (subjects typed sm:ReviewState), sorted. */
async function reviewStatesIn(pod: OtherApp, deck: DeckDocuments): Promise<string[]> {
  const pattern = new RegExp(
    `^<([^>]+)> ${escapeRegExp(RDF_TYPE)} <${escapeRegExp(`${SM}ReviewState`)}> \\.$`,
  );
  const lines = (await pod.triples(deck.reviews)) ?? [];
  return [...new Set(lines.flatMap((line) => pattern.exec(line)?.[1] ?? []))].sort();
}

/** The answers in the instance's answer log, every month of it, counted by the card they name. */
async function answersTo(pod: OtherApp, folder: string): Promise<Record<string, number>> {
  const pattern = new RegExp(`^<[^>]+> <${escapeRegExp(`${SM}answeredCard`)}> <([^>]+)> \\.$`);
  const counts: Record<string, number> = {};
  for (const month of await pod.contents(`${folder}history/`))
    for (const line of (await pod.triples(month)) ?? []) {
      const card = pattern.exec(line)?.[1];
      if (card !== undefined) counts[card] = (counts[card] ?? 0) + 1;
    }
  return counts;
}

/** How many answers, all cards together. */
function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
