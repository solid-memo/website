// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCopy, LibraryDeck } from "@solid-memo/domain/library";
import type { Session } from "@solid-memo/domain/session";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { queryKeys } from "./queryKeys";
import { retryable } from "./retryable";
import type { StatisticsRange } from "./router";
import { rangeRead, STATISTICS_STALE_MS } from "./studyFigures";

/** How long the cards' progress waits to be read again when it left out a deck for a reason that may pass, in milliseconds. */
const LEFT_OUT_RETRY_MS = 60_000;

/** Whether the check found a document it could not read: it is made again, as a failed one is. */
function hasUnreadable(report: ValidationReport | undefined): boolean {
  return report?.documents.some((document) => document.status === "unreadable") ?? false;
}

/**
 * Every cached read of pod data Solid Memo's screens make, and the
 * Studio's screens share (docs/architecture.md#query-keys), each defined
 * once: its key (queryKeys), the use case that fills it, and how long
 * what it read stays fresh. A screen reads by spreading a definition
 * into useQuery, useQueries or a QueryClient's prefetch, and adds only
 * what is its own: when it reads (`enabled`), and what it makes of the
 * data (`select`). A definition given no argument to read with (null or
 * undefined) reads nothing (skipToken). Reads only the Studio makes are
 * in apps/studio/src/ui/queries.ts, built on these. No read gives its
 * key anywhere else (`npm run check:keys`).
 */
export const queries = {
  /** A session's account (UseCases.discoverAccount). */
  account: (useCases: Pick<UseCases, "discoverAccount">, session: Session | null) =>
    queryOptions({
      queryKey: queryKeys.account(session?.webId),
      queryFn: session === null ? skipToken : () => useCases.discoverAccount(session),
    }),
  /** A session's profile document as read (UseCases.viewWebIdDocument). */
  webIdDocument: (useCases: Pick<UseCases, "viewWebIdDocument">, session: Session | null) =>
    queryOptions({
      queryKey: queryKeys.webIdDocument(session?.webId ?? ""),
      queryFn: session === null ? skipToken : () => useCases.viewWebIdDocument(session),
    }),
  /** A session's instances. */
  instances: (useCases: Pick<UseCases, "listInstances">, session: Session) =>
    queryOptions({
      queryKey: queryKeys.instances(session.webId),
      queryFn: () => useCases.listInstances(session),
    }),
  /** The storages a session's profile names. */
  storages: (useCases: Pick<UseCases, "listStorages">, session: Session) =>
    queryOptions({
      queryKey: queryKeys.storages(session.webId),
      queryFn: () => useCases.listStorages(session),
    }),
  /** Whether a document is in the learner's own pod. */
  inOwnPod: (useCases: Pick<UseCases, "isInOwnPod">, url: string | null) =>
    queryOptions({
      queryKey: queryKeys.inOwnPod(url),
      queryFn: url === null ? skipToken : () => useCases.isInOwnPod(url),
    }),
  /** Where a session's instances are registered, and may be. */
  registrationOptions: (useCases: Pick<UseCases, "getRegistrationOptions">, session: Session) =>
    queryOptions({
      queryKey: queryKeys.registrationOptions(session.webId),
      queryFn: () => useCases.getRegistrationOptions(session),
    }),

  /** An instance's decks. */
  decks: (useCases: Pick<UseCases, "listDecks">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.decks(instanceUrl),
      queryFn: instanceUrl === null ? skipToken : () => useCases.listDecks(instanceUrl),
    }),
  /**
   * An instance's decks as the user arranged them. Not read again on
   * focus: the arrangement is edited on the screen before it is written
   * (useDeckTreeEditor), and a read begun then could bring back the
   * list as it was.
   */
  deckTree: (useCases: Pick<UseCases, "listDeckTree">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.deckTree(instanceUrl),
      queryFn: instanceUrl === null ? skipToken : () => useCases.listDeckTree(instanceUrl),
      refetchOnWindowFocus: false,
    }),
  /** A deck's cards. */
  cards: (useCases: Pick<UseCases, "listCards">, deck: Deck | null | undefined) =>
    queryOptions({
      queryKey: queryKeys.cards(deck?.cardsDocumentUrl),
      queryFn: deck === null || deck === undefined ? skipToken : () => useCases.listCards(deck),
    }),
  /** A deck's review states. */
  reviews: (useCases: Pick<UseCases, "listDeckReviewStates">, deck: Deck) =>
    queryOptions({
      queryKey: queryKeys.reviews(deck.reviewsDocumentUrl),
      queryFn: () => useCases.listDeckReviewStates(deck),
    }),

  /**
   * A deck's study queue for today, as of the clock given (`now`). Read
   * as its screen opens, and kept as the session goes on: a queue read
   * again in the middle of a session would put the cards answered back.
   */
  studyQueue: (
    useCases: Pick<UseCases, "getStudyQueue">,
    instanceUrl: string,
    deck: Deck,
    now: () => Date,
  ) =>
    queryOptions({
      queryKey: queryKeys.studyQueue(deck.url),
      queryFn: () => useCases.getStudyQueue(instanceUrl, deck, now()),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: "always",
    }),
  /**
   * A deck's study counts for its deck-list row. Fresh for a little
   * while, so counts fetched while the instance is checked (Workspace)
   * serve the list that follows.
   */
  studyCounts: (
    useCases: Pick<UseCases, "getStudyCounts">,
    instanceUrl: string,
    deck: Deck | null,
  ) =>
    queryOptions({
      queryKey: queryKeys.studyCounts(deck?.url ?? null),
      queryFn:
        deck === null ? skipToken : () => useCases.getStudyCounts(instanceUrl, deck, new Date()),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    }),
  /** What pausing a deck until a day (null: for a while) is likely to cost; undefined: no day to ask of. */
  pauseOutlook: (
    useCases: Pick<UseCases, "getPauseOutlook">,
    instanceUrl: string,
    deck: Deck,
    day: string | null | undefined,
  ) =>
    queryOptions({
      queryKey: queryKeys.pauseOutlook(deck.url, day ?? null),
      queryFn:
        day === undefined
          ? skipToken
          : () => useCases.getPauseOutlook(instanceUrl, deck, day, new Date()),
    }),
  /** What is likely left of a deck that resumed from a pause; not read again on focus. */
  comeback: (useCases: Pick<UseCases, "getComeback">, instanceUrl: string, deck: Deck) =>
    queryOptions({
      queryKey: queryKeys.comeback(deck.url),
      queryFn: () => useCases.getComeback(instanceUrl, deck, new Date()),
      refetchOnWindowFocus: false,
    }),

  /** An instance's preferences. */
  preferences: (useCases: Pick<UseCases, "getPreferences">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.preferences(instanceUrl),
      queryFn: instanceUrl === null ? skipToken : () => useCases.getPreferences(instanceUrl),
    }),
  /** Whether an instance's stored preferences do not fit their shape: read as the preferences are. */
  preferencesMisfit: (useCases: Pick<UseCases, "preferencesMisfit">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.preferencesMisfit(instanceUrl),
      queryFn: () => useCases.preferencesMisfit(instanceUrl),
    }),
  /**
   * Whether logging in skips the Connected screen. Read once: a slow
   * retry would hold up the login, and the screen shows on any failure.
   */
  connectedScreen: (useCases: Pick<UseCases, "connectedScreenChoice">, session: Session | null) =>
    queryOptions({
      queryKey: queryKeys.connectedScreen(session?.webId),
      queryFn: session === null ? skipToken : () => useCases.connectedScreenChoice(session),
      retry: false,
      refetchOnWindowFocus: false,
    }),
  /** Whether an instance's preferences show the Connected screen. */
  connectedScreenShown: (useCases: Pick<UseCases, "connectedScreenShown">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.connectedScreenShown(instanceUrl),
      queryFn: () => useCases.connectedScreenShown(instanceUrl),
    }),
  /** The theme an instance's preferences show the app in. */
  instanceTheme: (useCases: Pick<UseCases, "instanceTheme">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.instanceAppearancePart(instanceUrl ?? "", "theme"),
      queryFn: instanceUrl === null ? skipToken : () => useCases.instanceTheme(instanceUrl),
    }),
  /** The palette an instance's preferences show the app in. */
  instancePalette: (useCases: Pick<UseCases, "instancePalette">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.instanceAppearancePart(instanceUrl ?? "", "palette"),
      queryFn: instanceUrl === null ? skipToken : () => useCases.instancePalette(instanceUrl),
    }),
  /** The text size an instance's preferences show the app in. */
  instanceTextSize: (useCases: Pick<UseCases, "instanceTextSize">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.instanceAppearancePart(instanceUrl ?? "", "textSize"),
      queryFn: instanceUrl === null ? skipToken : () => useCases.instanceTextSize(instanceUrl),
    }),
  /** The palettes the user designed in an instance. */
  palettes: (useCases: Pick<UseCases, "listPalettes">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.palettes(instanceUrl),
      queryFn: () => useCases.listPalettes(instanceUrl),
    }),

  /**
   * The check made as an instance is opened (UseCases.checkInstance):
   * made once, as it reads every document. A check that failed, or could
   * not read a document, holds data back, so it is made again when the
   * user comes back to the tab.
   */
  instanceCheck: (useCases: Pick<UseCases, "checkInstance">, instanceUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.instanceCheck(instanceUrl),
      queryFn: instanceUrl === null ? skipToken : () => useCases.checkInstance(instanceUrl),
      staleTime: Infinity,
      refetchOnWindowFocus: (query) =>
        query.state.status === "error" || hasUnreadable(query.state.data) ? "always" : false,
    }),
  /** The developer report's check of every document (UseCases.validateInstance): made once, as it reads every document, until asked again. */
  fullValidation: (useCases: Pick<UseCases, "validateInstance">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.fullValidation(instanceUrl),
      queryFn: () => useCases.validateInstance(instanceUrl),
      staleTime: Infinity,
    }),
  /** An instance's format update plan: made once a session, as it reads every document. */
  migration: (useCases: Pick<UseCases, "planMigration">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.migration(instanceUrl),
      queryFn: () => useCases.planMigration(instanceUrl),
      staleTime: Infinity,
    }),
  /** A guest's move into an instance that stopped under way, looked for once. */
  interruptedMove: (
    useCases: Pick<UseCases, "findInterruptedGuestMove">,
    session: Session,
    instance: Instance,
  ) =>
    queryOptions({
      queryKey: queryKeys.interruptedMove(instance.url),
      queryFn: () => useCases.findInterruptedGuestMove(session, instance),
      staleTime: Infinity,
    }),
  /** What a guest studied, to bring over. */
  guestStudy: (useCases: Pick<UseCases, "findGuestStudy">) =>
    queryOptions({
      queryKey: queryKeys.guestStudy(),
      queryFn: () => useCases.findGuestStudy(),
    }),
  /** How a guest's study joins an instance. */
  guestMergePlan: (
    useCases: Pick<UseCases, "planGuestMerge">,
    guestInstance: Instance,
    target: Instance,
  ) =>
    queryOptions({
      queryKey: queryKeys.guestMergePlan(guestInstance.url, target.url),
      queryFn: () => useCases.planGuestMerge(guestInstance, target),
    }),
  /** The registrations earlier versions wrote for an instance's data, still in the type indexes. */
  oldRegistrations: (
    useCases: Pick<UseCases, "oldRegistrations">,
    session: Session,
    instance: Instance,
  ) =>
    queryOptions({
      queryKey: queryKeys.oldRegistrations(session.webId, instance.url),
      queryFn: () => useCases.oldRegistrations(session, instance),
    }),

  /**
   * The library's index of decks, as the deck list tells its copies by
   * it (useCopies), and as the library screen, a library deck's page and
   * the try page show it. The index changes only with a deploy: read
   * once a page, not each time a screen shows or the window is focused,
   * so the index Workspace reads beside the deck list's arrangement
   * serves the list.
   */
  library: (useCases: Pick<UseCases, "listLibraryDecks">) =>
    queryOptions({
      queryKey: queryKeys.library(),
      queryFn: () => useCases.listLibraryDecks(),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }),
  /** A library deck's cards. */
  libraryCards: (
    useCases: Pick<UseCases, "listLibraryCards">,
    deck: LibraryDeck | null | undefined,
  ) =>
    queryOptions({
      queryKey: queryKeys.libraryCards(deck?.url),
      queryFn:
        deck === null || deck === undefined ? skipToken : () => useCases.listLibraryCards(deck),
    }),
  /** A library course's outline and cards, for its preview. */
  libraryCourse: (useCases: Pick<UseCases, "getLibraryCourse">, deck: LibraryDeck) =>
    queryOptions({
      queryKey: queryKeys.libraryCourse(deck.url),
      queryFn: () => useCases.getLibraryCourse(deck),
    }),
  /**
   * What upgrading a copy would do (UseCases.planLibraryUpgrade), with the
   * copy's series when it is known (`copy`), kept for the session.
   * Planned for the deck as it is: once an upgrade moves it to another
   * release, the plan for the deck as it was no longer applies. The plan
   * kept is the very one planned, not a copy shared with the one before
   * it (structural sharing): its lists stay frozen, so what is counted of
   * them is counted once (activeCountOf).
   */
  libraryUpgradePlan: (
    useCases: Pick<UseCases, "planLibraryUpgrade">,
    deck: Deck,
    copy?: LibraryCopy,
  ) =>
    queryOptions({
      queryKey: queryKeys.libraryUpgradePlan(deck.url, deck.sourceUrl, deck.cardsDocumentUrl),
      queryFn: () =>
        copy === undefined
          ? useCases.planLibraryUpgrade(deck)
          : useCases.planLibraryUpgrade(deck, copy),
      staleTime: Infinity,
      structuralSharing: false,
    }),
  /**
   * Adds the languages a copy's release states to the copy, once a
   * session: whether it added any. The decks are read again when it did.
   */
  releaseLanguages: (
    useCases: Pick<UseCases, "addReleaseLanguages">,
    queryClient: QueryClient,
    deck: Deck,
  ) =>
    queryOptions({
      queryKey: queryKeys.releaseLanguages(deck.url, deck.sourceUrl),
      queryFn: async () => {
        const updated = await useCases.addReleaseLanguages(deck);
        if (updated !== null)
          await queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() });
        return updated !== null;
      },
      staleTime: Infinity,
    }),
  /** The release a deck was copied from, read once; none for a deck that names none. */
  deckRelease: (useCases: Pick<UseCases, "deckRelease">, deck: Deck | undefined) =>
    queryOptions({
      queryKey: queryKeys.deckRelease(deck?.sourceUrl),
      queryFn: deck?.sourceUrl === undefined ? skipToken : () => useCases.deckRelease(deck),
      staleTime: Infinity,
    }),
  /** Whether a release is a course, asked once for the page's life. */
  releaseIsCourse: (useCases: Pick<UseCases, "releaseIsCourse">, sourceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.releaseIsCourse(sourceUrl),
      queryFn: () => useCases.releaseIsCourse(sourceUrl),
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
    }),
  /** Where a mistake in a release is reported, read once. */
  reportPlace: (useCases: Pick<UseCases, "reportPlace">, releaseUrl: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.reportPlace(releaseUrl),
      queryFn: releaseUrl === undefined ? skipToken : () => useCases.reportPlace(releaseUrl),
      staleTime: Infinity,
    }),
  /** A release read from a link the user gave; not read again on focus. */
  releaseFromLink: (useCases: Pick<UseCases, "readReleaseFromLink">, url: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.releaseFromLink(url),
      queryFn: url === undefined ? skipToken : () => useCases.readReleaseFromLink(url),
      refetchOnWindowFocus: false,
    }),

  /** A course as the learner has it; no deck (null), none. */
  course: (useCases: Pick<UseCases, "getCourse">, deck: Deck | null) =>
    queryOptions({
      queryKey: queryKeys.course(deck?.url ?? ""),
      queryFn: deck === null ? skipToken : () => useCases.getCourse(deck),
    }),
  /**
   * What the course strip needs of a course deck (UseCases.getCourseSummary),
   * with the release it is of. Fresh for a little while, so summaries
   * fetched as the deck list's arrangement is read (Workspace) serve the
   * strip that follows.
   */
  courseStrip: (useCases: Pick<UseCases, "getCourseSummary">, deck: Deck) =>
    queryOptions({
      queryKey: queryKeys.courseStrip(deck.url, deck.sourceUrl),
      queryFn: () => useCases.getCourseSummary(deck),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    }),

  /**
   * The statistics of a range, of every deck of the instance or of one
   * (by its URL). Fresh for STATISTICS_STALE_MS: any change made clears
   * them at once (keepStudyFiguresFresh).
   */
  statistics: (
    useCases: Pick<UseCases, "getStatistics">,
    instanceUrl: string,
    range: StatisticsRange,
    deckUrl?: string,
  ) => {
    const read = rangeRead(range);
    return queryOptions({
      queryKey:
        deckUrl !== undefined
          ? queryKeys.deckStatistics(instanceUrl, deckUrl, range)
          : queryKeys.statisticsOfRange(instanceUrl, range),
      queryFn: () =>
        useCases.getStatistics(
          instanceUrl,
          new Date(),
          deckUrl === undefined ? read : { ...read, deckUrl },
        ),
      staleTime: STATISTICS_STALE_MS,
    });
  },
  /** The today strip's figures, kept as the statistics are. */
  todayFigures: (useCases: Pick<UseCases, "getTodayFigures">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.todayFigures(instanceUrl),
      queryFn: () => useCases.getTodayFigures(instanceUrl, new Date()),
      staleTime: STATISTICS_STALE_MS,
    }),
  /** An instance's courses' statistics, kept as the statistics are. */
  courseStatistics: (
    useCases: Pick<UseCases, "getCourseStatistics">,
    instanceUrl: string,
    courses: readonly Deck[],
  ) =>
    queryOptions({
      queryKey: queryKeys.courseStatistics(
        instanceUrl,
        courses.map((deck) => [deck.url, deck.sourceUrl, deck.completedChapters ?? []]),
      ),
      queryFn: () => useCases.getCourseStatistics(instanceUrl, new Date(), courses),
      staleTime: STATISTICS_STALE_MS,
    }),
  /**
   * The cards' progress of every deck of the instance, or of the one deck
   * given, kept as the statistics are. One that left a deck out is stale
   * at once, and read again every LEFT_OUT_RETRY_MS while it is shown
   * when the reason may pass (retryable), keeping what it has meanwhile.
   */
  cardProgress: (
    useCases: Pick<UseCases, "getCardProgress">,
    instanceUrl: string,
    deck: Deck | undefined,
  ) =>
    queryOptions({
      queryKey: queryKeys.deckCardProgress(instanceUrl, deck?.url),
      queryFn: () =>
        useCases.getCardProgress(instanceUrl, new Date(), deck === undefined ? {} : { deck }),
      staleTime: (query) => (query.state.data?.leftOut === undefined ? STATISTICS_STALE_MS : 0),
      refetchInterval: (query) =>
        query.state.data?.leftOut?.some(retryable) ? LEFT_OUT_RETRY_MS : false,
    }),
  /** A card's answers, kept as the statistics are: any change made clears them at once (keepStudyFiguresFresh). */
  cardAnswers: (
    useCases: Pick<UseCases, "cardAnswers">,
    instanceUrl: string,
    deck: Deck,
    cardId: string,
  ) =>
    queryOptions({
      queryKey: queryKeys.cardAnswers(deck.url, cardId),
      queryFn: () => useCases.cardAnswers(instanceUrl, deck, cardId),
      staleTime: STATISTICS_STALE_MS,
    }),
};
