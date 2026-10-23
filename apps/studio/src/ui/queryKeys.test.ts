// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { queryKeys as sharedKeys } from "@solid-memo/ui/queryKeys";
import { queryKeys } from "./queryKeys";

const WEB_ID = "https://pod.example/profile/card#me";
const INSTANCE = "https://pod.example/solid-memo/a/";
const DECK = `${INSTANCE}decks/deck-1/`;
const CARDS = `${DECK}cards.ttl`;
const DRAFT = `${INSTANCE}drafts/capitals/`;
const RELEASE = `${INSTANCE}releases/capitals/v1.ttl`;

describe("queryKeys", () => {
  it("has every key Solid Memo's screens share", () => {
    expect(queryKeys.decks(INSTANCE)).toEqual(sharedKeys.decks(INSTANCE));
    expect(Object.keys(queryKeys)).toEqual(expect.arrayContaining(Object.keys(sharedKeys)));
  });

  // The values are the cache's: one changed is a screen that no longer refreshes another's data.
  it("keeps every key's value", () => {
    const preferences = { scheduler: "sm2" };
    expect([
      queryKeys.libraryUpdates(INSTANCE),
      queryKeys.deckHealth(INSTANCE, DECK, CARDS),
      queryKeys.catalog(INSTANCE),
      queryKeys.answerLog(INSTANCE),
      queryKeys.deckInsight(DECK, 20, preferences),
      queryKeys.instanceGraph(INSTANCE, WEB_ID),
      queryKeys.releaseDrafts(INSTANCE),
      queryKeys.releaseDraft(DRAFT),
      queryKeys.releaseDraftWrites(DRAFT),
      queryKeys.releaseCheck(DRAFT, "pod", 2),
      queryKeys.releaseShapes(undefined, "library", 0),
      queryKeys.releaseDiff(DRAFT, 3),
      queryKeys.publishedReleases(INSTANCE),
      queryKeys.releasePublic(RELEASE),
    ]).toEqual([
      ["decks", INSTANCE, "libraryUpdates"],
      ["validation", INSTANCE, "deck", DECK, CARDS],
      ["catalog", INSTANCE],
      ["answerLog", INSTANCE],
      ["deckInsight", DECK, 20, preferences],
      ["instanceGraph", INSTANCE, WEB_ID],
      ["releaseDrafts", INSTANCE],
      ["releaseDraft", DRAFT],
      ["editReleaseDraft", DRAFT],
      ["releaseCheck", DRAFT, "pod", 2],
      ["releaseShapes", undefined, "library", 0],
      ["releaseDiff", DRAFT, 3],
      ["publishedReleases", INSTANCE],
      ["releasePublic", RELEASE],
    ]);
  });

  it("puts each nested key under the key that refreshes it", () => {
    const decks = queryKeys.decks(INSTANCE);
    expect(queryKeys.libraryUpdates(INSTANCE).slice(0, decks.length)).toEqual(decks);
    const check = queryKeys.validation(INSTANCE);
    expect(queryKeys.deckHealth(INSTANCE, DECK, CARDS).slice(0, check.length)).toEqual(check);
  });
});
