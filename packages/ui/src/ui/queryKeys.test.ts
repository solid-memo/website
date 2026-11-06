// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { growth } from "@solid-memo/domain/testing/growth";
import { hashKey, QueriesObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { boundedQueryKeyHash, queryKeys } from "./queryKeys";

const WEB_ID = "https://pod.example/profile/card#me";
const INSTANCE = "https://pod.example/solid-memo/a/";
const DECK = `${INSTANCE}decks/deck-1/`;
const CARDS = `${DECK}cards.ttl`;
const REVIEWS = `${DECK}reviews.ttl`;
const RELEASE = "https://library.example/decks/capitals/v3.ttl";

/** The key starts with the shorter one, so invalidating or removing that reaches it. */
function expectUnder(key: readonly unknown[], shorter: readonly unknown[]) {
  expect(key.length).toBeGreaterThan(shorter.length);
  expect(key.slice(0, shorter.length)).toEqual(shorter);
}

describe("queryKeys", () => {
  // The values are the cache's: one changed is a screen that no longer refreshes another's data.
  it("keeps every key's value", () => {
    const course = [[DECK, RELEASE, []]];
    expect([
      queryKeys.account(WEB_ID),
      queryKeys.webIdDocument(WEB_ID),
      queryKeys.allInstances(),
      queryKeys.instances(WEB_ID),
      queryKeys.storages(WEB_ID),
      queryKeys.registrationOptions(WEB_ID),
      queryKeys.allDecks(),
      queryKeys.decks(INSTANCE),
      queryKeys.deckTree(INSTANCE),
      queryKeys.allCards(),
      queryKeys.cards(CARDS),
      queryKeys.allReviews(),
      queryKeys.reviews(REVIEWS),
      queryKeys.reviewState(REVIEWS, { cardId: "card-1", direction: "back-to-front" }),
      queryKeys.allStudyQueues(),
      queryKeys.studyQueue(DECK),
      queryKeys.studyCounts(DECK),
      queryKeys.allPreferences(),
      queryKeys.preferences(INSTANCE),
      queryKeys.connectedScreen(WEB_ID),
      queryKeys.connectedScreenShown(INSTANCE),
      queryKeys.instanceAppearance(INSTANCE),
      queryKeys.instanceAppearancePart(INSTANCE, "textSize"),
      queryKeys.palettes(INSTANCE),
      queryKeys.validation(INSTANCE),
      queryKeys.allMigrations(),
      queryKeys.migration(INSTANCE),
      queryKeys.interruptedMove(INSTANCE),
      queryKeys.guestStudy(),
      queryKeys.guestMergePlan("https://guest.example/", INSTANCE),
      queryKeys.dataClassRegistrations(INSTANCE),
      queryKeys.library(),
      queryKeys.libraryCards(DECK),
      queryKeys.libraryUpgrade(DECK),
      queryKeys.libraryUpgradePlan(DECK, RELEASE, CARDS),
      queryKeys.releaseLanguages(DECK, RELEASE),
      queryKeys.deckRelease(RELEASE),
      queryKeys.releaseIsCourse(RELEASE),
      queryKeys.reportPlace(RELEASE),
      queryKeys.releaseFromLink(RELEASE),
      queryKeys.course(DECK),
      queryKeys.courseStrip(DECK, RELEASE),
      queryKeys.allStatistics(),
      queryKeys.statistics(INSTANCE),
      queryKeys.statisticsOfRange(INSTANCE, "30d"),
      queryKeys.todayFigures(INSTANCE),
      queryKeys.deckStatistics(INSTANCE, DECK, "all"),
      queryKeys.courseStatistics(INSTANCE, course),
      queryKeys.allCardProgress(),
      queryKeys.cardProgress(INSTANCE),
      queryKeys.deckCardProgress(INSTANCE, undefined),
      queryKeys.allCardAnswers(),
      queryKeys.cardAnswers(DECK, "card-1"),
    ]).toEqual([
      ["account", WEB_ID],
      ["webIdDocument", WEB_ID],
      ["instances"],
      ["instances", WEB_ID],
      ["storages", WEB_ID],
      ["registrationOptions", WEB_ID],
      ["decks"],
      ["decks", INSTANCE],
      ["decks", INSTANCE, "tree"],
      ["cards"],
      ["cards", CARDS],
      ["reviews"],
      ["reviews", REVIEWS],
      ["reviews", REVIEWS, "card-1", "back-to-front"],
      ["studyQueue"],
      ["studyQueue", DECK],
      ["studyQueue", DECK, "counts"],
      ["preferences"],
      ["preferences", INSTANCE],
      ["preferences", "connectedScreen", WEB_ID],
      ["preferences", "connectedScreenShown", INSTANCE],
      ["instanceAppearance", INSTANCE],
      ["instanceAppearance", INSTANCE, "textSize"],
      ["palettes", INSTANCE],
      ["validation", INSTANCE],
      ["migration"],
      ["migration", INSTANCE],
      ["interruptedMove", INSTANCE],
      ["guestStudy"],
      ["guestMergePlan", "https://guest.example/", INSTANCE],
      ["dataClassRegistrations", INSTANCE],
      ["library"],
      ["libraryCards", DECK],
      ["libraryUpgrade", DECK],
      ["libraryUpgrade", DECK, RELEASE, CARDS],
      ["releaseLanguages", DECK, RELEASE],
      ["deckRelease", RELEASE],
      ["releaseIsCourse", RELEASE],
      ["reportPlace", RELEASE],
      ["releaseFromLink", RELEASE],
      ["course", DECK],
      ["course", DECK, "strip", RELEASE],
      ["statistics"],
      ["statistics", INSTANCE],
      ["statistics", INSTANCE, "range", "30d"],
      ["statistics", INSTANCE, "today"],
      ["statistics", INSTANCE, DECK, "all"],
      ["statistics", INSTANCE, "courses", course],
      ["cardProgress"],
      ["cardProgress", INSTANCE],
      ["cardProgress", INSTANCE, undefined],
      ["cardAnswers"],
      ["cardAnswers", DECK, "card-1"],
    ]);
  });

  it("puts each nested key under the key that refreshes it", () => {
    expectUnder(queryKeys.instances(WEB_ID), queryKeys.allInstances());
    expectUnder(queryKeys.decks(INSTANCE), queryKeys.allDecks());
    expectUnder(queryKeys.deckTree(INSTANCE), queryKeys.decks(INSTANCE));
    expectUnder(queryKeys.cards(CARDS), queryKeys.allCards());
    expectUnder(queryKeys.reviews(REVIEWS), queryKeys.allReviews());
    expectUnder(
      queryKeys.reviewState(REVIEWS, { cardId: "card-1", direction: "front-to-back" }),
      queryKeys.reviews(REVIEWS),
    );
    expectUnder(queryKeys.studyQueue(DECK), queryKeys.allStudyQueues());
    expectUnder(queryKeys.studyCounts(DECK), queryKeys.studyQueue(DECK));
    expectUnder(queryKeys.preferences(INSTANCE), queryKeys.allPreferences());
    expectUnder(queryKeys.connectedScreen(WEB_ID), queryKeys.allPreferences());
    expectUnder(queryKeys.connectedScreenShown(INSTANCE), queryKeys.allPreferences());
    expectUnder(
      queryKeys.instanceAppearancePart(INSTANCE, "theme"),
      queryKeys.instanceAppearance(INSTANCE),
    );
    expectUnder(queryKeys.migration(INSTANCE), queryKeys.allMigrations());
    expectUnder(queryKeys.libraryUpgradePlan(DECK, RELEASE, CARDS), queryKeys.libraryUpgrade(DECK));
    expectUnder(queryKeys.courseStrip(DECK, RELEASE), queryKeys.course(DECK));
    expectUnder(queryKeys.statistics(INSTANCE), queryKeys.allStatistics());
    expectUnder(queryKeys.statisticsOfRange(INSTANCE, "90d"), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.todayFigures(INSTANCE), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.deckStatistics(INSTANCE, DECK, "12m"), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.courseStatistics(INSTANCE, []), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.cardProgress(INSTANCE), queryKeys.allCardProgress());
    expectUnder(queryKeys.deckCardProgress(INSTANCE, DECK), queryKeys.cardProgress(INSTANCE));
    expectUnder(queryKeys.cardAnswers(DECK, "card-1"), queryKeys.allCardAnswers());
  });
});

/** A cards document IRI `length` characters long, the same up to its number. */
function cardsDocument(length: number, number: number): string {
  const start = "https://pod.example/c/";
  const end = `${String(number).padStart(6, "0")}.ttl`;
  return `${start}${"x".repeat(length - start.length - end.length)}${end}`;
}

/** The longest IRI a term may be (MAX_TERM_CHARACTERS, less "<" and ">"). */
const LONGEST_IRI = 16_381;

describe("boundedQueryKeyHash", () => {
  it("hashes a key as TanStack Query does while the hash is short", () => {
    const hash = boundedQueryKeyHash();
    const keys = [
      queryKeys.cards(CARDS),
      queryKeys.cards(undefined),
      queryKeys.reviewState(REVIEWS, { cardId: "card-1", direction: "back-to-front" }),
      ["deckInsight", DECK, 3, { b: 1, a: [null, "x"] }],
      queryKeys.cards(cardsDocument(16_371, 1)),
    ];
    for (const key of keys) expect(hash(key)).toBe(hashKey(key));
    expect(hashKey(keys.at(-1)!)).toHaveLength(16_383);
  });

  it("gives a long key a short id, the same for keys alike and another for every other", () => {
    const hash = boundedQueryKeyHash();
    const long = cardsDocument(LONGEST_IRI, 1);
    const other = cardsDocument(LONGEST_IRI, 2);
    const first = hash(queryKeys.cards(long));
    expect(first.length).toBeLessThan(20);
    expect(first.startsWith("#")).toBe(true);
    expect(hash(queryKeys.cards(long))).toBe(first);
    // Keys alike in JSON are alike here too: an object's fields in any order, an undefined field left out.
    expect(hash(["a", { x: long, y: 1, z: undefined }])).toBe(hash(["a", { y: 1, x: long }]));
    const hashes = [
      first,
      hash(queryKeys.cards(other)),
      hash(queryKeys.studyCounts(long)),
      hash(queryKeys.studyQueue(long)),
      hash([long, "a b"]),
      hash([`${long} a`, "b"]),
      hash(queryKeys.libraryUpgradePlan(DECK, long, CARDS)),
      hash(queryKeys.libraryUpgradePlan(DECK, CARDS, long)),
      hash(["a", { x: long, y: 1 }]),
      hash(["a", { x: long, y: "1" }]),
      hash(queryKeys.cards(cardsDocument(16_372, 1))),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const one of hashes) expect(one.length).toBeLessThanOrEqual(16_383);
  });

  // TanStack Query matches partial keys on the keys, not their hashes: refreshing the shorter key reaches the long one.
  it("keeps exact lookups and partial matches on a client", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { queryKeyHashFn: boundedQueryKeyHash() } },
    });
    const long = cardsDocument(LONGEST_IRI, 1);
    client.setQueryData(queryKeys.cards(long), "long");
    client.setQueryData(queryKeys.cards(cardsDocument(LONGEST_IRI, 2)), "other");
    client.setQueryData(queryKeys.cards(CARDS), "short");
    expect(client.getQueryData(queryKeys.cards(long))).toBe("long");
    expect(client.getQueryData(queryKeys.cards(CARDS))).toBe("short");
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.allCards() })).toHaveLength(3);
    await client.invalidateQueries({ queryKey: queryKeys.allCards() });
    expect(client.getQueryState(queryKeys.cards(long))?.isInvalidated).toBe(true);
    client.removeQueries({ queryKey: queryKeys.cards(long), exact: true });
    expect(client.getQueryData(queryKeys.cards(long))).toBeUndefined();
    expect(client.getQueryData(queryKeys.cards(cardsDocument(LONGEST_IRI, 2)))).toBe("other");
  });

  // One render of the Studio's deck table: a query per deck's cards, keyed by its cards document.
  it.each([
    ["past V8's limit for a hash", 16_373],
    ["under it", 15_803],
  ])("keeps a render of many decks' queries linear, their IRIs %s", (_, length) => {
    const ratio = growth(
      (decks) => {
        const client = new QueryClient({
          defaultOptions: { queries: { queryKeyHashFn: boundedQueryKeyHash() } },
        });
        const queries = Array.from({ length: decks }, (_, deck) => ({
          queryKey: queryKeys.cards(cardsDocument(length, deck)),
          queryFn: () => new Promise<never>(() => {}),
          enabled: false,
        }));
        const observer = new QueriesObserver(client, queries);
        observer.subscribe(() => {});
        return () => observer.setQueries(queries.map((query) => ({ ...query })));
      },
      125,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
