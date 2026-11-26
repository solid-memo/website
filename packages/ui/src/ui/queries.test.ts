// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  MutationObserver,
  QueryClient,
  type QueryObserverOptions,
  skipToken,
} from "@tanstack/react-query";
import type { TodayFigures } from "@solid-memo/domain/studyDigest";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCopy, LibraryDeck } from "@solid-memo/domain/library";
import type { Session } from "@solid-memo/domain/session";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "../test/useCasesFake";
import { queries } from "./queries";
import { queryKeys } from "./queryKeys";
import { keepStudyFiguresFresh, STATISTICS_STALE_MS } from "./studyFigures";

const SESSION: Session = { webId: "https://pod.example/profile/card#me" };
const INSTANCE = "https://pod.example/solid-memo/a/";
const instance: Instance = { url: INSTANCE, name: "A" };
const guest: Instance = { url: "https://guest.example/solid-memo/", name: "Guest" };
const RELEASE = "https://library.example/decks/capitals/v3.ttl";
const deck = {
  url: `${INSTANCE}catalog.ttl#deck-1`,
  cardsDocumentUrl: `${INSTANCE}decks/deck-1/cards.ttl`,
  reviewsDocumentUrl: `${INSTANCE}decks/deck-1/reviews.ttl`,
  sourceUrl: RELEASE,
  completedChapters: ["chapter-1"],
} as Deck;
const ownDeck = { ...deck, sourceUrl: undefined } as Deck;
const libraryDeck = { url: RELEASE } as LibraryDeck;

/** A use cases fake that records each call, and answers it with the use case's name. */
function recording(): { useCases: UseCases; calls: { name: string; args: unknown[] }[] } {
  const calls: { name: string; args: unknown[] }[] = [];
  const useCases = new Proxy({} as UseCases, {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push({ name: String(name), args });
        return Promise.resolve(name === "addReleaseLanguages" ? null : String(name));
      },
  });
  return { useCases, calls };
}

/** What a definition's read gives, with the context a query gives it. */
function read(options: { queryFn?: unknown }): Promise<unknown> {
  expect(options.queryFn).toBeTypeOf("function");
  const context = { signal: new AbortController().signal };
  return (options.queryFn as (context: unknown) => Promise<unknown>)(context);
}

describe("queries", () => {
  const { useCases, calls } = recording();
  const queryClient = new QueryClient();
  const now = () => new Date("2026-10-01T08:00:00Z");
  const copy = { deck } as LibraryCopy;
  const date = expect.any(Date);

  // Each read: its definition, the key it is cached under, and the use case that fills it.
  const reads: [string, { queryKey: unknown; queryFn?: unknown }, unknown, string, unknown[]][] = [
    [
      "account",
      queries.account(useCases, SESSION),
      queryKeys.account(SESSION.webId),
      "discoverAccount",
      [SESSION],
    ],
    [
      "webIdDocument",
      queries.webIdDocument(useCases, SESSION),
      queryKeys.webIdDocument(SESSION.webId),
      "viewWebIdDocument",
      [SESSION],
    ],
    [
      "instances",
      queries.instances(useCases, SESSION),
      queryKeys.instances(SESSION.webId),
      "listInstances",
      [SESSION],
    ],
    [
      "storages",
      queries.storages(useCases, SESSION),
      queryKeys.storages(SESSION.webId),
      "listStorages",
      [SESSION],
    ],
    [
      "inOwnPod",
      queries.inOwnPod(useCases, INSTANCE),
      queryKeys.inOwnPod(INSTANCE),
      "isInOwnPod",
      [INSTANCE],
    ],
    [
      "registrationOptions",
      queries.registrationOptions(useCases, SESSION),
      queryKeys.registrationOptions(SESSION.webId),
      "getRegistrationOptions",
      [SESSION],
    ],
    [
      "decks",
      queries.decks(useCases, INSTANCE),
      queryKeys.decks(INSTANCE),
      "listDecks",
      [INSTANCE],
    ],
    [
      "deckTree",
      queries.deckTree(useCases, INSTANCE),
      queryKeys.deckTree(INSTANCE),
      "listDeckTree",
      [INSTANCE],
    ],
    [
      "cards",
      queries.cards(useCases, deck),
      queryKeys.cards(deck.cardsDocumentUrl),
      "listCards",
      [deck],
    ],
    [
      "reviews",
      queries.reviews(useCases, deck),
      queryKeys.reviews(deck.reviewsDocumentUrl),
      "listDeckReviewStates",
      [deck],
    ],
    [
      "studyQueue",
      queries.studyQueue(useCases, INSTANCE, deck, now),
      queryKeys.studyQueue(deck.url),
      "getStudyQueue",
      [INSTANCE, deck, now()],
    ],
    [
      "studyCounts",
      queries.studyCounts(useCases, INSTANCE, deck),
      queryKeys.studyCounts(deck.url),
      "getStudyCounts",
      [INSTANCE, deck, date],
    ],
    [
      "pauseOutlook",
      queries.pauseOutlook(useCases, INSTANCE, deck, "2026-10-09"),
      queryKeys.pauseOutlook(deck.url, "2026-10-09"),
      "getPauseOutlook",
      [INSTANCE, deck, "2026-10-09", date],
    ],
    [
      "pauseOutlook for a while",
      queries.pauseOutlook(useCases, INSTANCE, deck, null),
      queryKeys.pauseOutlook(deck.url, null),
      "getPauseOutlook",
      [INSTANCE, deck, null, date],
    ],
    [
      "comeback",
      queries.comeback(useCases, INSTANCE, deck),
      queryKeys.comeback(deck.url),
      "getComeback",
      [INSTANCE, deck, date],
    ],
    [
      "preferences",
      queries.preferences(useCases, INSTANCE),
      queryKeys.preferences(INSTANCE),
      "getPreferences",
      [INSTANCE],
    ],
    [
      "preferencesMisfit",
      queries.preferencesMisfit(useCases, INSTANCE),
      queryKeys.preferencesMisfit(INSTANCE),
      "preferencesMisfit",
      [INSTANCE],
    ],
    [
      "connectedScreen",
      queries.connectedScreen(useCases, SESSION),
      queryKeys.connectedScreen(SESSION.webId),
      "connectedScreenChoice",
      [SESSION],
    ],
    [
      "connectedScreenShown",
      queries.connectedScreenShown(useCases, INSTANCE),
      queryKeys.connectedScreenShown(INSTANCE),
      "connectedScreenShown",
      [INSTANCE],
    ],
    [
      "instanceTheme",
      queries.instanceTheme(useCases, INSTANCE),
      queryKeys.instanceAppearancePart(INSTANCE, "theme"),
      "instanceTheme",
      [INSTANCE],
    ],
    [
      "instancePalette",
      queries.instancePalette(useCases, INSTANCE),
      queryKeys.instanceAppearancePart(INSTANCE, "palette"),
      "instancePalette",
      [INSTANCE],
    ],
    [
      "instanceTextSize",
      queries.instanceTextSize(useCases, INSTANCE),
      queryKeys.instanceAppearancePart(INSTANCE, "textSize"),
      "instanceTextSize",
      [INSTANCE],
    ],
    [
      "palettes",
      queries.palettes(useCases, INSTANCE),
      queryKeys.palettes(INSTANCE),
      "listPalettes",
      [INSTANCE],
    ],
    [
      "instanceCheck",
      queries.instanceCheck(useCases, INSTANCE),
      queryKeys.instanceCheck(INSTANCE),
      "checkInstance",
      [INSTANCE],
    ],
    [
      "fullValidation",
      queries.fullValidation(useCases, INSTANCE),
      queryKeys.fullValidation(INSTANCE),
      "validateInstance",
      [INSTANCE],
    ],
    [
      "migration",
      queries.migration(useCases, INSTANCE),
      queryKeys.migration(INSTANCE),
      "planMigration",
      [INSTANCE],
    ],
    [
      "interruptedMove",
      queries.interruptedMove(useCases, SESSION, instance),
      queryKeys.interruptedMove(INSTANCE),
      "findInterruptedGuestMove",
      [SESSION, instance],
    ],
    ["guestStudy", queries.guestStudy(useCases), queryKeys.guestStudy(), "findGuestStudy", []],
    [
      "guestMergePlan",
      queries.guestMergePlan(useCases, guest, instance),
      queryKeys.guestMergePlan(guest.url, INSTANCE),
      "planGuestMerge",
      [guest, instance],
    ],
    [
      "oldRegistrations",
      queries.oldRegistrations(useCases, SESSION, instance),
      queryKeys.oldRegistrations(SESSION.webId, INSTANCE),
      "oldRegistrations",
      [SESSION, instance],
    ],
    ["library", queries.library(useCases), queryKeys.library(), "listLibraryDecks", []],
    [
      "libraryCards",
      queries.libraryCards(useCases, libraryDeck),
      queryKeys.libraryCards(RELEASE),
      "listLibraryCards",
      [libraryDeck],
    ],
    [
      "libraryCourse",
      queries.libraryCourse(useCases, libraryDeck),
      queryKeys.libraryCourse(RELEASE),
      "getLibraryCourse",
      [libraryDeck],
    ],
    [
      "libraryUpgradePlan",
      queries.libraryUpgradePlan(useCases, deck),
      queryKeys.libraryUpgradePlan(deck.url, RELEASE, deck.cardsDocumentUrl),
      "planLibraryUpgrade",
      [deck],
    ],
    [
      "libraryUpgradePlan of a copy",
      queries.libraryUpgradePlan(useCases, deck, copy),
      queryKeys.libraryUpgradePlan(deck.url, RELEASE, deck.cardsDocumentUrl),
      "planLibraryUpgrade",
      [deck, copy],
    ],
    [
      "releaseLanguages",
      queries.releaseLanguages(useCases, queryClient, deck),
      queryKeys.releaseLanguages(deck.url, RELEASE),
      "addReleaseLanguages",
      [deck],
    ],
    [
      "deckRelease",
      queries.deckRelease(useCases, deck),
      queryKeys.deckRelease(RELEASE),
      "deckRelease",
      [deck],
    ],
    [
      "releaseIsCourse",
      queries.releaseIsCourse(useCases, RELEASE),
      queryKeys.releaseIsCourse(RELEASE),
      "releaseIsCourse",
      [RELEASE],
    ],
    [
      "reportPlace",
      queries.reportPlace(useCases, RELEASE),
      queryKeys.reportPlace(RELEASE),
      "reportPlace",
      [RELEASE],
    ],
    [
      "releaseFromLink",
      queries.releaseFromLink(useCases, RELEASE),
      queryKeys.releaseFromLink(RELEASE),
      "readReleaseFromLink",
      [RELEASE],
    ],
    ["course", queries.course(useCases, deck), queryKeys.course(deck.url), "getCourse", [deck]],
    [
      "courseStrip",
      queries.courseStrip(useCases, deck),
      queryKeys.courseStrip(deck.url, RELEASE),
      "getCourseSummary",
      [deck],
    ],
    [
      "todayFigures",
      queries.todayFigures(useCases, INSTANCE),
      queryKeys.todayFigures(INSTANCE),
      "getTodayFigures",
      [INSTANCE, date],
    ],
    [
      "courseStatistics",
      queries.courseStatistics(useCases, INSTANCE, [deck]),
      queryKeys.courseStatistics(INSTANCE, [[deck.url, RELEASE, ["chapter-1"]]]),
      "getCourseStatistics",
      [INSTANCE, date, [deck]],
    ],
    [
      "cardProgress",
      queries.cardProgress(useCases, INSTANCE, undefined),
      queryKeys.deckCardProgress(INSTANCE, undefined),
      "getCardProgress",
      [INSTANCE, date, {}],
    ],
    [
      "cardProgress of a deck",
      queries.cardProgress(useCases, INSTANCE, deck),
      queryKeys.deckCardProgress(INSTANCE, deck.url),
      "getCardProgress",
      [INSTANCE, date, { deck }],
    ],
    [
      "cardAnswers",
      queries.cardAnswers(useCases, INSTANCE, deck, "card-1"),
      queryKeys.cardAnswers(deck.url, "card-1"),
      "cardAnswers",
      [INSTANCE, deck, "card-1"],
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

  it("defines a read for each key a screen reads", () => {
    expect(new Set(reads.map(([, options]) => (options.queryKey as unknown[])[0]))).toEqual(
      new Set([
        "account",
        "webIdDocument",
        "instances",
        "storages",
        "inOwnPod",
        "registrationOptions",
        "decks",
        "cards",
        "reviews",
        "studyQueue",
        "preferences",
        "instanceAppearance",
        "palettes",
        "validation",
        "migration",
        "interruptedMove",
        "guestStudy",
        "guestMergePlan",
        "oldRegistrations",
        "library",
        "libraryCards",
        "libraryCourse",
        "libraryUpgrade",
        "releaseLanguages",
        "deckRelease",
        "releaseIsCourse",
        "reportPlace",
        "releaseFromLink",
        "course",
        "statistics",
        "cardProgress",
        "cardAnswers",
      ]),
    );
  });

  // Without what it reads with, a definition reads nothing: its query is disabled, as `enabled: false` makes it.
  it.each([
    ["account", queries.account(useCases, null)],
    ["webIdDocument", queries.webIdDocument(useCases, null)],
    ["inOwnPod", queries.inOwnPod(useCases, null)],
    ["decks", queries.decks(useCases, null)],
    ["deckTree", queries.deckTree(useCases, null)],
    ["cards", queries.cards(useCases, null)],
    ["cards of no deck yet", queries.cards(useCases, undefined)],
    ["studyCounts", queries.studyCounts(useCases, INSTANCE, null)],
    ["pauseOutlook", queries.pauseOutlook(useCases, INSTANCE, deck, undefined)],
    ["preferences", queries.preferences(useCases, null)],
    ["connectedScreen", queries.connectedScreen(useCases, null)],
    ["instanceTheme", queries.instanceTheme(useCases, null)],
    ["instancePalette", queries.instancePalette(useCases, null)],
    ["instanceTextSize", queries.instanceTextSize(useCases, null)],
    ["instanceCheck", queries.instanceCheck(useCases, null)],
    ["libraryCards", queries.libraryCards(useCases, null)],
    ["libraryCards of no deck yet", queries.libraryCards(useCases, undefined)],
    ["deckRelease", queries.deckRelease(useCases, undefined)],
    ["deckRelease of a deck of no release", queries.deckRelease(useCases, ownDeck)],
    ["reportPlace", queries.reportPlace(useCases, undefined)],
    ["releaseFromLink", queries.releaseFromLink(useCases, undefined)],
    ["course", queries.course(useCases, null)],
  ])("reads nothing for %s without its argument", (_, options) => {
    expect(options.queryFn).toBe(skipToken);
    expect(queryClient.defaultQueryOptions(options as QueryObserverOptions).enabled).toBe(false);
  });

  it("keys what it reads nothing for as the screens did", () => {
    expect(queries.account(useCases, null).queryKey).toEqual(queryKeys.account(undefined));
    expect(queries.webIdDocument(useCases, null).queryKey).toEqual(queryKeys.webIdDocument(""));
    expect(queries.studyCounts(useCases, INSTANCE, null).queryKey).toEqual(
      queryKeys.studyCounts(null),
    );
    expect(queries.pauseOutlook(useCases, INSTANCE, deck, undefined).queryKey).toEqual(
      queryKeys.pauseOutlook(deck.url, null),
    );
    expect(queries.instanceTheme(useCases, null).queryKey).toEqual(
      queryKeys.instanceAppearancePart("", "theme"),
    );
    expect(queries.course(useCases, null).queryKey).toEqual(queryKeys.course(""));
  });

  it("makes the opening check again on focus only when it failed or left a document unread", () => {
    const { refetchOnWindowFocus } = queries.instanceCheck(useCases, INSTANCE);
    const onFocus = (state: { status: string; data?: ValidationReport }) =>
      (refetchOnWindowFocus as (query: unknown) => unknown)({ state });
    const report = (status: string) => ({ documents: [{ status }] }) as ValidationReport;
    expect(onFocus({ status: "error" })).toBe("always");
    expect(onFocus({ status: "success", data: report("unreadable") })).toBe("always");
    expect(onFocus({ status: "success", data: report("valid") })).toBe(false);
    expect(onFocus({ status: "pending" })).toBe(false);
  });

  it("reads the cards' progress that left a deck out again soon, while the reason may pass", () => {
    const { staleTime, refetchInterval } = queries.cardProgress(useCases, INSTANCE, undefined);
    const at = (data: unknown) => ({ state: { data } });
    const stale = staleTime as (query: unknown) => number;
    const interval = refetchInterval as (query: unknown) => number | false;
    expect(stale(at({}))).toBe(STATISTICS_STALE_MS);
    expect(stale(at({ leftOut: [] }))).toBe(0);
    expect(interval(at({}))).toBe(false);
    expect(interval(at({ leftOut: [new AppError("deckGone", { deck: "Capitals" })] }))).toBe(false);
    expect(interval(at({ leftOut: [new TypeError("Failed to fetch")] }))).toBe(60_000);
  });

  it("reads the decks again once a release's languages were added to a copy", async () => {
    const added = makeUseCasesFake({ addReleaseLanguages: vi.fn(async () => deck) });
    const client = new QueryClient();
    client.setQueryData(queryKeys.decks(INSTANCE), []);
    expect(await read(queries.releaseLanguages(added, client, deck))).toBe(true);
    expect(client.getQueryState(queryKeys.decks(INSTANCE))?.isInvalidated).toBe(true);
    const none = new QueryClient();
    none.setQueryData(queryKeys.decks(INSTANCE), []);
    expect(await read(queries.releaseLanguages(useCases, none, deck))).toBe(false);
    expect(none.getQueryState(queryKeys.decks(INSTANCE))?.isInvalidated).toBe(false);
  });
});

describe("queries.statistics", () => {
  it("reads the range asked for, of the instance or of a deck", async () => {
    const useCases = makeUseCasesFake();
    const deckUrl = `${INSTANCE}catalog.ttl#deck-1`;
    expect(queries.statistics(useCases, INSTANCE, "12m").queryKey).toEqual([
      "statistics",
      INSTANCE,
      "range",
      "12m",
    ]);
    expect(queries.statistics(useCases, INSTANCE, "all").queryKey).toEqual([
      "statistics",
      INSTANCE,
      "range",
      "all",
    ]);
    expect(queries.statistics(useCases, INSTANCE, "30d", deckUrl).queryKey).toEqual([
      "statistics",
      INSTANCE,
      deckUrl,
      "30d",
    ]);
    await read(queries.statistics(useCases, INSTANCE, "12m"));
    expect(useCases.getStatistics).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date), {});
    await read(queries.statistics(useCases, INSTANCE, "90d", deckUrl));
    expect(useCases.getStatistics).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date), {
      range: 90,
      deckUrl,
    });
  });
});

describe("queries.todayFigures", () => {
  it("reads the today strip's figures under a key of its own, which a change made clears", async () => {
    const useCases = makeUseCasesFake();
    const query = queries.todayFigures(useCases, INSTANCE);
    expect(query.queryKey).toEqual(["statistics", INSTANCE, "today"]);
    expect(query.queryKey).not.toEqual(queries.statistics(useCases, INSTANCE, "12m").queryKey);
    const queryClient = new QueryClient();
    queryClient.setQueryData(query.queryKey, (await read(query)) as TodayFigures);
    expect(useCases.getTodayFigures).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date));
    keepStudyFiguresFresh(queryClient);
    await new MutationObserver(queryClient, { mutationFn: async () => undefined }).mutate();
    expect(queryClient.getQueryState(query.queryKey)?.isInvalidated).toBe(true);
  });
});
