// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { QueryClient, type QueryObserverOptions, skipToken } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { queries as sharedQueries } from "@solid-memo/ui/queries";
import { DRAFT_URL, courseDraft, instanceA, makeDeck } from "../test/fixtures";
import { markdownCheckOf, revisionOf } from "./draftVersions";
import { queries } from "./queries";
import { queryKeys } from "./queryKeys";

const WEB_ID = "https://pod.example/profile/card#me";
const INSTANCE = instanceA.url;
const RELEASE = `${INSTANCE}releases/capitals/v1.ttl`;
const deck = makeDeck("deck-1", { en: "Kanji N5" });
const preferences = { scheduler: "sm2" } as StudyPreferences;

/** A use cases fake that records each call, and answers it with the use case's name. */
function recording(): { useCases: UseCases; calls: { name: string; args: unknown[] }[] } {
  const calls: { name: string; args: unknown[] }[] = [];
  const useCases = new Proxy({} as UseCases, {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push({ name: String(name), args });
        return Promise.resolve(name === "checkReleaseDraft" ? { shapes: [] } : String(name));
      },
  });
  return { useCases, calls };
}

/** What a definition's read gives, with the context a query gives it. */
function read(options: { queryFn?: unknown }, signal = new AbortController().signal) {
  expect(options.queryFn).toBeTypeOf("function");
  return (options.queryFn as (context: unknown) => Promise<unknown>)({ signal });
}

describe("queries", () => {
  const { useCases, calls } = recording();
  const queryClient = new QueryClient();
  const draft = courseDraft();
  const onProgress = () => undefined;

  it("has every read Solid Memo's screens share", () => {
    expect(Object.keys(queries)).toEqual(expect.arrayContaining(Object.keys(sharedQueries)));
    expect(queries.decks(useCases, INSTANCE).queryKey).toEqual(queryKeys.decks(INSTANCE));
  });

  // Each read: its definition, the key it is cached under, and the use case that fills it.
  const reads: [string, { queryKey: unknown; queryFn?: unknown }, unknown, string, unknown[]][] = [
    [
      "libraryUpdates",
      queries.libraryUpdates(useCases, INSTANCE),
      queryKeys.libraryUpdates(INSTANCE),
      "listLibraryUpdates",
      [INSTANCE],
    ],
    [
      "deckTableCards",
      queries.deckTableCards(useCases, deck),
      queryKeys.deckTableCards(deck.cardsDocumentUrl),
      "listCardsInTurn",
      [deck, expect.any(AbortSignal)],
    ],
    [
      "catalog",
      queries.catalog(useCases, INSTANCE),
      queryKeys.catalog(INSTANCE),
      "readCatalog",
      [INSTANCE],
    ],
    [
      "answerLog",
      queries.answerLog(useCases, INSTANCE),
      queryKeys.answerLog(INSTANCE),
      "loadAnswerLog",
      [INSTANCE],
    ],
    [
      "deckInsight",
      queries.deckInsight(useCases, INSTANCE, deck, preferences),
      queryKeys.deckInsight(deck.url, deck.maxReviewsPerDay, preferences),
      "deckInsight",
      [INSTANCE, deck, expect.any(Date), preferences],
    ],
    [
      "instanceGraph",
      queries.instanceGraph(useCases, INSTANCE, WEB_ID, onProgress),
      queryKeys.instanceGraph(INSTANCE, WEB_ID),
      "readInstanceGraph",
      [INSTANCE, WEB_ID, { onProgress }],
    ],
    [
      "releaseDrafts",
      queries.releaseDrafts(useCases, INSTANCE),
      queryKeys.releaseDrafts(INSTANCE),
      "listReleaseDrafts",
      [INSTANCE],
    ],
    [
      "releaseDraft",
      queries.releaseDraft(useCases, DRAFT_URL),
      queryKeys.releaseDraft(DRAFT_URL),
      "getReleaseDraft",
      [DRAFT_URL],
    ],
    [
      "releaseShapes",
      queries.releaseShapes(useCases, draft, "library"),
      queryKeys.releaseShapes(DRAFT_URL, "library", revisionOf(draft)),
      "checkReleaseDraft",
      [draft, markdownCheckOf(DRAFT_URL), "library", { shapes: true }],
    ],
    [
      "releaseDiff",
      queries.releaseDiff(useCases, draft),
      queryKeys.releaseDiff(DRAFT_URL, revisionOf(draft)),
      "diffReleaseDraft",
      [draft],
    ],
    [
      "publishedReleases",
      queries.publishedReleases(useCases, INSTANCE),
      queryKeys.publishedReleases(INSTANCE),
      "listPublishedReleases",
      [INSTANCE],
    ],
    [
      "releasePublic",
      queries.releasePublic(useCases, RELEASE),
      queryKeys.releasePublic(RELEASE),
      "isReleasePublic",
      [RELEASE],
    ],
  ];

  it.each(reads)(
    "keys %s by its queryKeys key, and fills it with its use case",
    async (_, options, key, name, args) => {
      expect(options.queryKey).toEqual(key);
      calls.length = 0;
      await read(options);
      expect(calls).toEqual([{ name, args }]);
    },
  );

  // Without what it reads with, a definition reads nothing: its query is disabled, as `enabled: false` makes it.
  it.each([
    ["deckInsight", queries.deckInsight(useCases, INSTANCE, deck, undefined)],
    ["releaseDraft", queries.releaseDraft(useCases, null)],
    ["releaseCheck", queries.releaseCheck(useCases, queryClient, null, "pod")],
    ["releaseShapes", queries.releaseShapes(useCases, null, "pod")],
    ["releasePublic", queries.releasePublic(useCases, undefined)],
    ["foundDeckHealth", queries.foundDeckHealth(deck)],
    ["foundDeckHealth of no deck", queries.foundDeckHealth(null)],
    ["foundInstanceGraph", queries.foundInstanceGraph(INSTANCE, WEB_ID)],
  ])("reads nothing for %s", (_, options) => {
    expect(options.queryFn).toBe(skipToken);
    expect(queryClient.defaultQueryOptions(options as QueryObserverOptions).enabled).toBe(false);
  });

  it("reads from the cache only what the reads themselves keep", () => {
    expect(queries.foundDeckHealth(deck).queryKey).toEqual(
      queries.deckHealth(useCases, queryClient, INSTANCE, deck).queryKey,
    );
    expect(queries.foundDeckHealth(null).queryKey).toEqual(queryKeys.validation(null));
    expect(queries.foundInstanceGraph(INSTANCE, WEB_ID).queryKey).toEqual(
      queries.instanceGraph(useCases, INSTANCE, WEB_ID, onProgress).queryKey,
    );
    expect(queries.releaseDraft(useCases, null).queryKey).toEqual(queryKeys.releaseDraft(""));
    expect(queries.releasePublic(useCases, undefined).queryKey).toEqual(
      queryKeys.releasePublic(""),
    );
    expect(queries.releaseCheck(useCases, queryClient, null, "pod").queryKey).toEqual(
      queryKeys.releaseCheck(undefined, "pod", 0),
    );
    expect(queries.releaseShapes(useCases, null, "pod").queryKey).toEqual(
      queryKeys.releaseShapes(undefined, "pod", 0),
    );
  });

  it("reads a deck's documents afresh first only when asked to", async () => {
    calls.length = 0;
    await read(queries.deckHealth(useCases, queryClient, INSTANCE, deck));
    expect(calls.map(({ name }) => name)).toEqual(["checkDeck"]);
    calls.length = 0;
    await read(queries.deckHealth(useCases, queryClient, INSTANCE, deck, { afresh: true }));
    expect(calls.map(({ name }) => name)).toEqual(["forgetDeckCheck", "checkDeck"]);
    expect(calls[0]!.args).toEqual([INSTANCE, deck]);
  });

  it("checks a version of a draft, dropping the checks of the other versions no screen shows", async () => {
    const client = new QueryClient();
    const older = queryKeys.releaseCheck(DRAFT_URL, "pod", -1);
    client.setQueryData(older, {});
    const query = queries.releaseCheck(useCases, client, draft, "pod");
    expect(query.queryKey).toEqual(queryKeys.releaseCheck(DRAFT_URL, "pod", revisionOf(draft)));
    calls.length = 0;
    await read(query);
    expect(calls).toEqual([
      { name: "checkReleaseDraft", args: [draft, markdownCheckOf(DRAFT_URL), "pod"] },
    ]);
    expect(client.getQueryState(older)).toBeUndefined();
  });
});
