// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReviewKey } from "@solid-memo/domain/review";
import type { StatisticsRange } from "./router";

/**
 * Every query key of pod data Solid Memo's screens cache, and the Studio's
 * screens share (docs/architecture.md#query-keys): a screen reads, and a
 * write refreshes, a key by its function here, never by an array written
 * out (`npm run check:keys`). A key whose first items are another's
 * sits under it: invalidating or removing the shorter key reaches it too,
 * as each one's comment says. Keys only the Studio reads are in
 * apps/studio/src/ui/queryKeys.ts, built on these.
 */
export const queryKeys = {
  /** A WebID's account (UseCases.discoverAccount). */
  account: (webId: string | undefined) => ["account", webId],
  /** A WebID's profile document as read (UseCases.viewWebIdDocument). */
  webIdDocument: (webId: string) => ["webIdDocument", webId],
  /** Every WebID's instances. */
  allInstances: () => ["instances"],
  /** A WebID's instances: under allInstances. */
  instances: (webId: string) => [...queryKeys.allInstances(), webId],
  /** The storages a WebID's profile names. */
  storages: (webId: string) => ["storages", webId],
  /** Where a WebID's instances are registered, and may be. */
  registrationOptions: (webId: string) => ["registrationOptions", webId],

  /** Every instance's decks, and every key under them. */
  allDecks: () => ["decks"],
  /** An instance's decks: under allDecks. */
  decks: (instanceUrl: string | null) => [...queryKeys.allDecks(), instanceUrl],
  /** An instance's decks as the user arranged them: under decks, so whatever refreshes them refreshes it too. */
  deckTree: (instanceUrl: string | null) => [...queryKeys.decks(instanceUrl), "tree"],

  /** Every deck's cards. */
  allCards: () => ["cards"],
  /** A deck's cards, by its cards document: under allCards. */
  cards: (cardsDocumentUrl: string | undefined) => [...queryKeys.allCards(), cardsDocumentUrl],

  /** Every deck's review states. */
  allReviews: () => ["reviews"],
  /** A deck's review states, by its reviews document: under allReviews. */
  reviews: (reviewsDocumentUrl: string) => [...queryKeys.allReviews(), reviewsDocumentUrl],
  /** One prompt's review state, as an answer left it: under reviews. */
  reviewState: (reviewsDocumentUrl: string, { cardId, direction }: ReviewKey) => [
    ...queryKeys.reviews(reviewsDocumentUrl),
    cardId,
    direction,
  ],

  /** Every deck's study queue, and every key under them. */
  allStudyQueues: () => ["studyQueue"],
  /** A deck's study queue for today: under allStudyQueues. */
  studyQueue: (deckUrl: string | null) => [...queryKeys.allStudyQueues(), deckUrl],
  /** A deck's study counts for its deck-list row: under studyQueue, so whatever drops the queue drops them too. */
  studyCounts: (deckUrl: string | null) => [...queryKeys.studyQueue(deckUrl), "counts"],

  /** Every instance's preferences. */
  allPreferences: () => ["preferences"],
  /** An instance's preferences: under allPreferences. */
  preferences: (instanceUrl: string | null) => [...queryKeys.allPreferences(), instanceUrl],
  /** How an instance's preferences show the app, to refetch it after a write. */
  instanceAppearance: (instanceUrl: string) => ["instanceAppearance", instanceUrl],
  /** One part of how an instance's preferences show the app: under instanceAppearance. */
  instanceAppearancePart: (instanceUrl: string, part: "theme" | "palette" | "textSize") => [
    ...queryKeys.instanceAppearance(instanceUrl),
    part,
  ],
  /** The palettes the user designed in an instance. */
  palettes: (instanceUrl: string) => ["palettes", instanceUrl],

  /** An instance's check (useDataCheck), and its decks' health under it. */
  validation: (instanceUrl: string | null) => ["validation", instanceUrl],
  /** Every instance's format update plan. */
  allMigrations: () => ["migration"],
  /** An instance's format update plan: under allMigrations. */
  migration: (instanceUrl: string) => [...queryKeys.allMigrations(), instanceUrl],
  /** A guest's move into an instance that stopped under way. */
  interruptedMove: (instanceUrl: string) => ["interruptedMove", instanceUrl],
  /** What a guest studied, to bring over. */
  guestStudy: () => ["guestStudy"],
  /** How a guest's study joins an instance. */
  guestMergePlan: (guestInstanceUrl: string, targetUrl: string) => [
    "guestMergePlan",
    guestInstanceUrl,
    targetUrl,
  ],
  /** Whether an instance's data classes are registered in the type index. */
  dataClassRegistrations: (instanceUrl: string) => ["dataClassRegistrations", instanceUrl],

  /** The deck library's index. */
  library: () => ["library"],
  /** A library deck's cards. */
  libraryCards: (deckUrl: string | undefined) => ["libraryCards", deckUrl],
  /** A copy's upgrades to a newer release, and the mutation that makes one. */
  libraryUpgrade: (deckUrl: string) => ["libraryUpgrade", deckUrl],
  /** A copy's upgrade plan from the release it came from: under libraryUpgrade. */
  libraryUpgradePlan: (
    deckUrl: string,
    sourceUrl: string | undefined,
    cardsDocumentUrl: string,
  ) => [...queryKeys.libraryUpgrade(deckUrl), sourceUrl, cardsDocumentUrl],
  /** The languages a copy's release states, added to the copy. */
  releaseLanguages: (deckUrl: string, sourceUrl: string | undefined) => [
    "releaseLanguages",
    deckUrl,
    sourceUrl,
  ],
  /** A release, by its URL. */
  deckRelease: (sourceUrl: string | undefined) => ["deckRelease", sourceUrl],
  /** Where a mistake in a release is reported. */
  reportPlace: (releaseUrl: string | undefined) => ["reportPlace", releaseUrl],
  /** A release read from a link the user gave. */
  releaseFromLink: (url: string | undefined) => ["releaseFromLink", url],

  /** A course as the learner has it (UseCases.getCourse). */
  course: (deckUrl: string) => ["course", deckUrl],
  /** What the course strip needs of a course (UseCases.getCourseSummary): under course, as one of its own. */
  courseStrip: (deckUrl: string, sourceUrl: string | undefined) => [
    ...queryKeys.course(deckUrl),
    "strip",
    sourceUrl,
  ],

  /** Every instance's statistics, and every key under them. */
  allStatistics: () => ["statistics"],
  /** An instance's statistics of every deck over the last 12 months: under allStatistics. */
  statistics: (instanceUrl: string) => [...queryKeys.allStatistics(), instanceUrl],
  /** An instance's statistics of every deck over another range: under statistics. */
  statisticsOfRange: (instanceUrl: string, range: StatisticsRange) => [
    ...queryKeys.statistics(instanceUrl),
    "range",
    range,
  ],
  /** An instance's statistics of one deck over a range: under statistics. */
  deckStatistics: (instanceUrl: string, deckUrl: string, range: StatisticsRange) => [
    ...queryKeys.statistics(instanceUrl),
    deckUrl,
    range,
  ],
  /** An instance's courses' statistics, by what each course is: under statistics. */
  courseStatistics: (instanceUrl: string, courses: readonly unknown[]) => [
    ...queryKeys.statistics(instanceUrl),
    "courses",
    courses,
  ],
  /** Every instance's card progress. */
  allCardProgress: () => ["cardProgress"],
  /** An instance's card progress: under allCardProgress. */
  cardProgress: (instanceUrl: string) => [...queryKeys.allCardProgress(), instanceUrl],
  /** An instance's card progress, of one deck or (undefined) every one: under cardProgress. */
  deckCardProgress: (instanceUrl: string, deckUrl: string | undefined) => [
    ...queryKeys.cardProgress(instanceUrl),
    deckUrl,
  ],
  /** Every card's answers. */
  allCardAnswers: () => ["cardAnswers"],
  /** A card's answers: under allCardAnswers. */
  cardAnswers: (deckUrl: string, cardId: string) => [
    ...queryKeys.allCardAnswers(),
    deckUrl,
    cardId,
  ],
};
