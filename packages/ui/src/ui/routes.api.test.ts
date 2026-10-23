// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import {
  BROWSER_LANGUAGE_FILTERS,
  DEFAULT_STATISTICS_RANGE,
  STATISTICS_RANGES,
  STATISTICS_VIEWS,
  STORAGE_SOURCES,
  isStudioHash,
  parseHash,
  routeToHash,
  studioHref,
  type RouteRef,
} from "./router";

const INSTANCE = "https://pod.example/solid-memo/main/";
const DECK = "https://pod.example/solid-memo/main/catalog.ttl#deck-1";
const CARD = "https://pod.example/solid-memo/main/decks/deck-1.ttl#card-1";
const CHAPTER = "https://library.example/decks/solid/v1.ttl#chapter-1";
const LIBRARY_DECK = "https://library.example/decks/capitals/v1.ttl";
const STORAGE = "https://pod.example/";

/** A route of each screen, and one for each optional parameter's values. */
const ROUTES: RouteRef[] = [
  { screen: "storagePicker" },
  { screen: "instancePicker" },
  ...STORAGE_SOURCES.map(
    (source): RouteRef => ({ screen: "instanceCreator", storageUrl: STORAGE, source }),
  ),
  { screen: "home", instanceUrl: INSTANCE },
  { screen: "deckCreator", instanceUrl: INSTANCE },
  { screen: "library", instanceUrl: INSTANCE },
  { screen: "libraryDeck", instanceUrl: INSTANCE, libraryDeckUrl: LIBRARY_DECK },
  { screen: "libraryBrowser", instanceUrl: INSTANCE, libraryDeckUrl: LIBRARY_DECK },
  { screen: "libraryBrowser", instanceUrl: INSTANCE, libraryDeckUrl: LIBRARY_DECK, page: 2 },
  { screen: "libraryCard", instanceUrl: INSTANCE, libraryDeckUrl: LIBRARY_DECK, cardId: "card-1" },
  { screen: "libraryPreview", instanceUrl: INSTANCE, libraryDeckUrl: LIBRARY_DECK },
  { screen: "importUrl", instanceUrl: INSTANCE },
  { screen: "importUrl", instanceUrl: INSTANCE, url: LIBRARY_DECK },
  { screen: "deckDetail", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "deckPreferences", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "deckPreferences", instanceUrl: INSTANCE, deckUrl: DECK, section: "languages" },
  { screen: "browser", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "browser", instanceUrl: INSTANCE, deckUrl: DECK, page: 2 },
  ...BROWSER_LANGUAGE_FILTERS.map(
    (languages): RouteRef => ({
      screen: "browser",
      instanceUrl: INSTANCE,
      deckUrl: DECK,
      languages,
    }),
  ),
  { screen: "cardCreator", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "card", instanceUrl: INSTANCE, deckUrl: DECK, cardUrl: CARD },
  { screen: "study", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "cram", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "cramAll", instanceUrl: INSTANCE },
  { screen: "course", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "courseChapter", instanceUrl: INSTANCE, deckUrl: DECK, chapterUrl: CHAPTER },
  { screen: "courseReview", instanceUrl: INSTANCE, deckUrl: DECK, chapterUrl: CHAPTER },
  { screen: "preferences", instanceUrl: INSTANCE },
  { screen: "palette", instanceUrl: INSTANCE },
  { screen: "palette", instanceUrl: INSTANCE, paletteUrl: `${INSTANCE}palettes.ttl#palette-1` },
  { screen: "validation", instanceUrl: INSTANCE },
  { screen: "try", libraryDeckUrl: LIBRARY_DECK },
  ...[
    { screen: "statistics", instanceUrl: INSTANCE } as const,
    { screen: "deckStatistics", instanceUrl: INSTANCE, deckUrl: DECK } as const,
  ].flatMap((route): RouteRef[] => [
    route,
    // The defaults are left out of the hash, so it is the others a hash names.
    ...STATISTICS_RANGES.filter((range) => range !== DEFAULT_STATISTICS_RANGE).map((range) => ({
      ...route,
      range,
    })),
    ...STATISTICS_VIEWS.filter((view) => view !== "overview").map((view) => ({ ...route, view })),
  ]),
];

/**
 * The app's hash routes, part of its public API
 * (docs/releasing.md#the-public-api): people bookmark and share them.
 * For each screen, the hash it opens at, with each of its optional
 * parameters' values, and the hash Solid Memo opens Solid Memo Studio
 * at. Each is checked to parse back to the route it was made from, so it
 * is a hash the app opens. A line that goes, a screen moved or a
 * parameter renamed or no longer read, is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/routes/app.txt to the hashes the app opens", async () => {
  const lines = ROUTES.map((route) => {
    const hash = routeToHash(route);
    expect(parseHash(hash)).toEqual(route);
    return hash;
  });
  const studio = studioHref(INSTANCE);
  expect(isStudioHash(studio)).toBe(true);
  expect(parseHash(studio)).toBeNull();
  lines.push(studio);
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../api/routes/app.txt",
  );
});
