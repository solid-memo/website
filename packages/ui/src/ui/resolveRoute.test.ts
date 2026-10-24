// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Card } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard } from "@solid-memo/domain/library";
import type { Storage } from "@solid-memo/domain/storage";
import { CH1, CH2, courseDeck, courseLibraryDeck, makeCourse } from "../test/course";
import { type Loaded, type Lookup, resolveRoute } from "./resolveRoute";
import { routeToHash, type RouteRef } from "./router";

const instanceA: Instance = { url: "https://pod.example/solid-memo/a/", name: "A" };
const instanceB: Instance = { url: "https://pod.example/solid-memo/b/", name: "B" };
const instanceUrl = instanceA.url;
const deckUrl = courseDeck.url;
const plainDeck = { ...courseDeck, sourceUrl: undefined };
const card: Card = {
  id: "card-1",
  url: `${instanceUrl}decks/deck-1.ttl#card-1`,
  createdAt: "2026-10-07T10:00:00.000Z",
  formatVersion: 7,
  front: { en: "Front" },
  back: { en: "Back" },
};
const libraryCard: LibraryCard = {
  id: "sweden",
  formatVersion: 5,
  front: { en: "Sweden" },
  back: { en: "Stockholm" },
};
const storageA: Storage = { url: "https://pod.example/", source: "profile" };
const storageB: Storage = { url: "https://backup.example/", source: "profile" };
const libraryDeckUrl = courseLibraryDeck.seriesUrl;

const unneeded = { status: "unneeded" } as const;
const loading = { status: "loading" } as const;
const failed = { status: "failed" } as const;
const missing = { status: "missing" } as const;
const found = <T>(value: T): Lookup<T> => ({ status: "found", value });

/** What the workspace has read: the instance A alone, and nothing else needed. */
function loaded(route: RouteRef | null, read: Partial<Loaded> = {}): Loaded {
  return {
    hash: route === null ? "" : routeToHash(route),
    instances: [instanceA],
    deck: unneeded,
    card: unneeded,
    libraryDeck: unneeded,
    libraryCard: unneeded,
    course: unneeded,
    courseRereading: false,
    storages: undefined,
    ...read,
  };
}

/** Where the route goes with what is read, null when it opens. */
function resolve(route: RouteRef | null, read: Partial<Loaded> = {}) {
  return resolveRoute(route, loaded(route, read));
}

const go = (to: RouteRef) => ({ to, triedUnknown: false });

describe("resolveRoute", () => {
  it("decides nothing until the instances are read", () => {
    expect(resolve(null, { instances: undefined })).toBeNull();
    expect(
      resolve({ screen: "home", instanceUrl: instanceB.url }, { instances: undefined }),
    ).toBeNull();
  });

  it("opens a route whose data is all there", () => {
    expect(resolve({ screen: "home", instanceUrl })).toBeNull();
    expect(resolve({ screen: "instancePicker" })).toBeNull();
    expect(
      resolve({ screen: "deckDetail", instanceUrl, deckUrl }, { deck: found(courseDeck) }),
    ).toBeNull();
  });

  describe("no route", () => {
    it("goes to the only instance's decks", () => {
      expect(resolve(null)).toEqual(go({ screen: "home", instanceUrl }));
    });

    it("goes to the instance picker with several", () => {
      expect(resolve(null, { instances: [instanceA, instanceB] })).toEqual(
        go({ screen: "instancePicker" }),
      );
    });

    it("goes to the storage picker with none", () => {
      expect(resolve(null, { instances: [] })).toEqual(go({ screen: "storagePicker" }));
    });
  });

  describe("an unknown instance", () => {
    it("goes to the instance picker", () => {
      expect(resolve({ screen: "home", instanceUrl: instanceB.url })).toEqual(
        go({ screen: "instancePicker" }),
      );
    });

    it("goes to the storage picker when there are no instances", () => {
      expect(resolve({ screen: "home", instanceUrl }, { instances: [] })).toEqual(
        go({ screen: "storagePicker" }),
      );
    });

    it("wins over every lookup of the route", () => {
      const route: RouteRef = {
        screen: "card",
        instanceUrl: instanceB.url,
        deckUrl,
        cardUrl: card.url,
      };
      expect(resolve(route, { deck: missing, card: missing })).toEqual(
        go({ screen: "instancePicker" }),
      );
    });
  });

  describe("an unknown deck", () => {
    it("goes to the instance's decks once the decks are read", () => {
      const route: RouteRef = { screen: "study", instanceUrl, deckUrl };
      expect(resolve(route, { deck: loading })).toBeNull();
      expect(resolve(route, { deck: failed })).toBeNull();
      expect(resolve(route, { deck: missing })).toEqual(go({ screen: "home", instanceUrl }));
    });

    it("wins over its card's lookup", () => {
      const route: RouteRef = { screen: "card", instanceUrl, deckUrl, cardUrl: card.url };
      expect(resolve(route, { deck: missing, card: missing })).toEqual(
        go({ screen: "home", instanceUrl }),
      );
    });

    it("wins over a deck's statistics' range", () => {
      const route: RouteRef = { screen: "deckStatistics", instanceUrl, deckUrl };
      expect(resolve(route, { deck: missing, hash: `${routeToHash(route)}&range=decade` })).toEqual(
        go({ screen: "home", instanceUrl }),
      );
    });

    it("wins over a course's rules", () => {
      const route: RouteRef = { screen: "courseChapter", instanceUrl, deckUrl, chapterUrl: CH2 };
      expect(resolve(route, { deck: missing, course: found(makeCourse()) })).toEqual(
        go({ screen: "home", instanceUrl }),
      );
    });
  });

  describe("the statistics", () => {
    const route: RouteRef = { screen: "statistics", instanceUrl };

    it("say a range or tab they do not know as the default", () => {
      expect(resolve(route, { hash: `${routeToHash(route)}&range=decade` })).toEqual(go(route));
      expect(resolve(route, { hash: `${routeToHash(route)}&view=nonsense` })).toEqual(go(route));
    });

    it("open with one they know", () => {
      const known: RouteRef = { ...route, range: "12m", view: "memory" };
      expect(resolve(known)).toBeNull();
    });

    it("of a deck do so too", () => {
      const deckRoute: RouteRef = { screen: "deckStatistics", instanceUrl, deckUrl };
      expect(
        resolve(deckRoute, {
          deck: found(courseDeck),
          hash: `${routeToHash(deckRoute)}&range=90d`,
        }),
      ).toEqual(go(deckRoute));
    });
  });

  describe("an unknown card", () => {
    const route: RouteRef = { screen: "card", instanceUrl, deckUrl, cardUrl: card.url };

    it("goes to the deck's cards once they are read", () => {
      expect(resolve(route, { deck: found(courseDeck), card: loading })).toBeNull();
      expect(resolve(route, { deck: found(courseDeck), card: missing })).toEqual(
        go({ screen: "browser", instanceUrl, deckUrl }),
      );
    });

    it("opens when it is there", () => {
      expect(resolve(route, { deck: found(courseDeck), card: found(card) })).toBeNull();
    });
  });

  describe("an unknown library deck", () => {
    it("goes to the library once it is read", () => {
      const route: RouteRef = { screen: "libraryDeck", instanceUrl, libraryDeckUrl };
      expect(resolve(route, { libraryDeck: loading })).toBeNull();
      expect(resolve(route, { libraryDeck: failed })).toBeNull();
      expect(resolve(route, { libraryDeck: missing })).toEqual(
        go({ screen: "library", instanceUrl }),
      );
    });

    it("wins over its card's lookup", () => {
      const route: RouteRef = {
        screen: "libraryCard",
        instanceUrl,
        libraryDeckUrl,
        cardId: "sweden",
      };
      expect(resolve(route, { libraryDeck: missing, libraryCard: missing })).toEqual(
        go({ screen: "library", instanceUrl }),
      );
    });
  });

  describe("an unknown library card", () => {
    const route: RouteRef = {
      screen: "libraryCard",
      instanceUrl,
      libraryDeckUrl,
      cardId: "sweden",
    };
    const read = { libraryDeck: found(courseLibraryDeck) };

    it("goes to the deck's cards once they are read", () => {
      expect(resolve(route, { ...read, libraryCard: loading })).toBeNull();
      expect(resolve(route, { ...read, libraryCard: missing })).toEqual(
        go({ screen: "libraryBrowser", instanceUrl, libraryDeckUrl }),
      );
    });

    it("opens when it is there", () => {
      expect(resolve(route, { ...read, libraryCard: found(libraryCard) })).toBeNull();
    });
  });

  describe("a link to a library deck (#/try)", () => {
    const route: RouteRef = { screen: "try", libraryDeckUrl };

    it("waits for the library", () => {
      expect(resolve(route, { libraryDeck: loading })).toBeNull();
    });

    it("goes on to the deck's page in the only instance", () => {
      expect(resolve(route, { libraryDeck: found(courseLibraryDeck) })).toEqual(
        go({ screen: "libraryDeck", instanceUrl, libraryDeckUrl }),
      );
    });

    it("goes to the library, saying so, for a deck it does not have", () => {
      expect(resolve(route, { libraryDeck: missing })).toEqual({
        to: { screen: "library", instanceUrl },
        triedUnknown: true,
      });
    });

    it("goes to the library, saying nothing of the deck, when the library cannot be read", () => {
      expect(resolve(route, { libraryDeck: failed })).toEqual(
        go({ screen: "library", instanceUrl }),
      );
    });

    it("stays for the learner to choose among several instances", () => {
      expect(
        resolve(route, {
          instances: [instanceA, instanceB],
          libraryDeck: found(courseLibraryDeck),
        }),
      ).toBeNull();
    });

    it("goes to the storage picker with no instance", () => {
      expect(resolve(route, { instances: [], libraryDeck: missing })).toEqual(
        go({ screen: "storagePicker" }),
      );
    });
  });

  describe("a course", () => {
    const courseRoute: RouteRef = { screen: "course", instanceUrl, deckUrl };
    const chapter = (chapterUrl: string): RouteRef => ({
      screen: "courseChapter",
      instanceUrl,
      deckUrl,
      chapterUrl,
    });
    const review: RouteRef = { screen: "courseReview", instanceUrl, deckUrl, chapterUrl: CH1 };
    /** The first chapter's steps done, its review not. */
    const stepsDone = makeCourse(["q-1", "q-2", "q-3"]);

    it("goes to the deck's page for a deck that is no copy of a release", () => {
      for (const route of [courseRoute, chapter(CH1), review]) {
        expect(resolve(route, { deck: found(plainDeck), course: loading })).toEqual(
          go({ screen: "deckDetail", instanceUrl, deckUrl }),
        );
      }
    });

    it("waits for the course before it judges a chapter", () => {
      expect(resolve(chapter(CH2), { deck: found(courseDeck), course: loading })).toBeNull();
    });

    it("opens its page and an open chapter", () => {
      const read = { deck: found(courseDeck), course: found(makeCourse()) };
      expect(resolve(courseRoute, read)).toBeNull();
      expect(resolve(chapter(CH1), read)).toBeNull();
    });

    it("goes to the course for a chapter still locked, or one it does not have", () => {
      const read = { deck: found(courseDeck), course: found(makeCourse()) };
      expect(resolve(chapter(CH2), read)).toEqual(go(courseRoute));
      expect(resolve(chapter(`${CH1}-gone`), read)).toEqual(go(courseRoute));
      expect(resolve({ ...review, chapterUrl: CH2 }, read)).toEqual(go(courseRoute));
    });

    it("goes to the chapter for a final review with steps not done, once the course is read afresh", () => {
      const read = { deck: found(courseDeck), course: found(makeCourse(["q-1"])) };
      expect(resolve(review, { ...read, courseRereading: true })).toBeNull();
      expect(resolve(review, read)).toEqual(go(chapter(CH1)));
    });

    it("opens a final review once the chapter's steps are done", () => {
      expect(resolve(review, { deck: found(courseDeck), course: found(stepsDone) })).toBeNull();
    });

    it("says a deck that is no copy before it judges the chapter", () => {
      expect(
        resolve(chapter(CH2), { deck: found(plainDeck), course: found(makeCourse()) }),
      ).toEqual(go({ screen: "deckDetail", instanceUrl, deckUrl }));
    });
  });

  describe("the storage picker", () => {
    const route: RouteRef = { screen: "storagePicker" };

    it("goes on to the instance creator with a single storage", () => {
      expect(resolve(route, { storages: [storageA] })).toEqual(
        go({ screen: "instanceCreator", storageUrl: storageA.url, source: storageA.source }),
      );
    });

    it("stays while they are read, and to choose among several", () => {
      expect(resolve(route)).toBeNull();
      expect(resolve(route, { storages: [storageA, storageB] })).toBeNull();
    });

    it("does not go on from another screen", () => {
      expect(resolve({ screen: "instancePicker" }, { storages: [storageA] })).toBeNull();
    });
  });
});
