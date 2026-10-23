// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

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
      queryKeys.reportPlace(RELEASE),
      queryKeys.releaseFromLink(RELEASE),
      queryKeys.course(DECK),
      queryKeys.courseStrip(DECK, RELEASE),
      queryKeys.allStatistics(),
      queryKeys.statistics(INSTANCE),
      queryKeys.statisticsOfRange(INSTANCE, "30d"),
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
      ["reportPlace", RELEASE],
      ["releaseFromLink", RELEASE],
      ["course", DECK],
      ["course", DECK, "strip", RELEASE],
      ["statistics"],
      ["statistics", INSTANCE],
      ["statistics", INSTANCE, "range", "30d"],
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
    expectUnder(
      queryKeys.instanceAppearancePart(INSTANCE, "theme"),
      queryKeys.instanceAppearance(INSTANCE),
    );
    expectUnder(queryKeys.migration(INSTANCE), queryKeys.allMigrations());
    expectUnder(queryKeys.libraryUpgradePlan(DECK, RELEASE, CARDS), queryKeys.libraryUpgrade(DECK));
    expectUnder(queryKeys.courseStrip(DECK, RELEASE), queryKeys.course(DECK));
    expectUnder(queryKeys.statistics(INSTANCE), queryKeys.allStatistics());
    expectUnder(queryKeys.statisticsOfRange(INSTANCE, "90d"), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.deckStatistics(INSTANCE, DECK, "12m"), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.courseStatistics(INSTANCE, []), queryKeys.statistics(INSTANCE));
    expectUnder(queryKeys.cardProgress(INSTANCE), queryKeys.allCardProgress());
    expectUnder(queryKeys.deckCardProgress(INSTANCE, DECK), queryKeys.cardProgress(INSTANCE));
    expectUnder(queryKeys.cardAnswers(DECK, "card-1"), queryKeys.allCardAnswers());
  });
});
