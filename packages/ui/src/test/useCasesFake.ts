// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { DeckProgress, StatisticsReport, UseCases } from "@solid-memo/application/useCases";
import type { StudySessionQueue } from "@solid-memo/application/study";
import type { Answer } from "@solid-memo/domain/answer";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Deck } from "@solid-memo/domain/deck";
import { withAbout } from "@solid-memo/domain/deckAbout";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import { withProvenance } from "@solid-memo/domain/deckProvenance";
import { editCompletedChapters } from "@solid-memo/domain/course";
import { describedCatalog } from "@solid-memo/domain/catalog";
import { deckHealth } from "@solid-memo/domain/deckHealth";
import { applyDeckTreeEdit } from "@solid-memo/domain/deckTree";
import { DEFAULT_PREFERENCES, PREFERENCES_FORMAT_VERSION } from "@solid-memo/domain/preferences";
import { REVIEW_STATE_FORMAT_VERSION } from "@solid-memo/domain/review";
import { statisticsOf } from "@solid-memo/domain/statistics";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";

/**
 * The statistics of the answers given up to `today`, as getStatistics
 * reports them: by default of a log that covers its range and begins
 * with the answers' first month (none without answers), its days
 * beginning at the default hour.
 */
export function statisticsReportOf(
  answers: readonly Answer[],
  today: string,
  coverage: string | null = null,
  logBegins = answers.map((answer) => answer.studyDay.slice(0, 7)).sort()[0] ?? null,
): StatisticsReport {
  return {
    ...statisticsOf(answers, today),
    coverage,
    logBegins,
    dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
  };
}

/**
 * A deck's figures in the cards' progress (getCardProgress): nothing
 * studied and nothing hard, unless given.
 */
export function deckProgressOf(deck: Deck, extra: Partial<DeckProgress> = {}): DeckProgress {
  return {
    deck,
    progress: { new: 0, relearning: 0, young: 0, mature: 0 },
    forecast: [],
    intervals: intervalHistogram([]),
    eases: easeHistogram([]),
    overdue: 0,
    daysToClear: 0,
    newCardsPerDay: 5,
    introducedToday: 0,
    hardest: { reviews: 0, cards: [] },
    courseAnswers: 0,
    confusions: [],
    ...extra,
  };
}

/**
 * What a study queue comes with besides its prompts, when a test has
 * nothing to say of it: the default preferences, and no states.
 */
export const QUEUE_DEFAULTS: Pick<StudySessionQueue, "prefs" | "states" | "fsrsStates"> = {
  prefs: DEFAULT_PREFERENCES,
  states: [],
  fsrsStates: [],
};

/** A complete UseCases fake; override the methods a test cares about. */
export function makeUseCasesFake(overrides: Partial<UseCases> = {}): UseCases {
  const fake: UseCases = {
    restoreSession: vi.fn(async () => null),
    startGuest: vi.fn(async () => ({
      webId: "https://guest.solid-memo.invalid/profile/card#me",
      guest: true as const,
    })),
    discardGuest: vi.fn(async () => undefined),
    findGuestStudy: vi.fn(async () => null),
    transferGuestStudy: vi.fn(async () => ({
      ok: true as const,
      instance: { url: "https://pod.example/solid-memo/main/", name: "My study" },
      tidied: true,
    })),
    planGuestMerge: vi.fn(async () => ({ decks: [], drafts: 0 })),
    mergeGuestStudy: vi.fn(async (_session, _guest, target) => ({
      ok: true as const,
      instance: target,
      added: [],
      tidied: true,
    })),
    loginWithWebId: vi.fn(async () => undefined),
    loginWithProvider: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    onSessionExpired: vi.fn(() => () => undefined),
    language: vi.fn(() => "en" as const),
    chooseLanguage: vi.fn(),
    themeChoice: vi.fn(() => "system" as const),
    instanceTheme: vi.fn(async () => null),
    chooseTheme: vi.fn(async () => undefined),
    paletteChoice: vi.fn(() => "standard" as const),
    instancePalette: vi.fn(async () => null),
    choosePalette: vi.fn(async () => undefined),
    customPaletteChoice: vi.fn(() => null),
    chooseCustomPalette: vi.fn(async () => undefined),
    listPalettes: vi.fn(async () => []),
    savePalette: vi.fn(async (_instanceUrl, draft) => ({
      ...draft,
      url: draft.url ?? `${_instanceUrl}palettes.ttl#palette-new`,
    })),
    textSizeChoice: vi.fn(() => "default" as const),
    instanceTextSize: vi.fn(async () => null),
    chooseTextSize: vi.fn(async () => undefined),
    discoverAccount: vi.fn(async (session) => ({
      webId: session.webId,
      podUrl: "https://pod.example/",
      oidcIssuer: "https://issuer.example",
    })),
    viewWebIdDocument: vi.fn(async () => ({ url: "", subjects: [] })),
    validateInstance: vi.fn(async (instanceUrl) => ({
      instanceUrl,
      documents: [],
      violationCount: 0,
      conforms: true,
    })),
    listStorages: vi.fn(async () => []),
    addManualStorage: vi.fn(async () => ({
      url: "https://pod.example/",
      source: "manual" as const,
    })),
    listInstances: vi.fn(async () => []),
    getRegistrationOptions: vi.fn(async () => ({
      privateIndexExists: true,
      publicIndexExists: true,
    })),
    createInstance: vi.fn(async () => ({
      url: "https://pod.example/solid-memo/main/",
      name: "Main",
    })),
    attachInstanceByUrl: vi.fn(async () => ({
      url: "https://pod.example/solid-memo/main/",
      name: "Main",
    })),
    deleteInstance: vi.fn(async () => ({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    })),
    dataClassRegistrations: vi.fn(async () => ({
      registrations: (
        ["instance", "catalog", "deck", "card", "reviewState", "answer", "draft"] as const
      ).map((dataClass) => ({
        dataClass,
        index: "private" as const,
        registered: true,
      })),
      privateIndexMissing: false,
      unreadableIndexes: [],
    })),
    registerDataClasses: vi.fn(async () => undefined),
    listDecks: vi.fn(async () => []),
    createDeck: vi.fn(async () => {
      throw new Error("createDeck fake not configured");
    }),
    renameDeck: vi.fn(async (deck, title) => ({ ...deck, title })),
    // As the real ones relate to them: every listed deck at the top level, an edit made to that tree.
    listDeckTree: vi.fn(async (instanceUrl) => ({
      children: (await fake.listDecks(instanceUrl)).map((deck) => ({
        kind: "deck" as const,
        deck,
      })),
      readOnly: false,
    })),
    newDeckGroup: vi.fn((instanceUrl, title) => ({
      url: `${instanceUrl}catalog.ttl#group-fake`,
      title,
    })),
    editDeckTree: vi.fn(async (instanceUrl, edit) =>
      applyDeckTreeEdit(await fake.listDeckTree(instanceUrl), edit),
    ),
    setDeckDirection: vi.fn(async (deck, direction) => ({ ...deck, direction })),
    // As the real one does: keywords tidied, and left off when there are none.
    describeDeck: vi.fn(async (deck, about) => withAbout(deck, about)),
    setDeckPace: vi.fn(async (deck, pace) => ({ ...deck, ...pace })),
    // As the real one does: the tag in lower case, and left off for null.
    setDeckCardLanguage: vi.fn(async (deck, language) => withCardLanguage(deck, language)),
    // As the real one does: authors tidied, the license one offered.
    setDeckProvenance: vi.fn(async (deck, provenance) => withProvenance(deck, provenance)),
    setDecksDirection: vi.fn(async (decks: readonly Deck[], direction) =>
      decks.map((deck) => ({ ...deck, direction })),
    ),
    setDecksPace: vi.fn(async (decks: readonly Deck[], pace) =>
      decks.map((deck) => ({ ...deck, ...pace })),
    ),
    removeDeck: vi.fn(async () => ({ keptDocuments: [] })),
    removeDecks: vi.fn(async () => ({ keptDocuments: [] })),
    listLibraryDecks: vi.fn(async () => []),
    importLibraryDeck: vi.fn(async () => {
      throw new Error("importLibraryDeck fake not configured");
    }),
    listLibraryCards: vi.fn(async () => []),
    readReleaseFromLink: vi.fn(async () => {
      throw new Error("readReleaseFromLink fake not configured");
    }),
    importReleaseFromUrl: vi.fn(async () => {
      throw new Error("importReleaseFromUrl fake not configured");
    }),
    planLibraryUpgrade: vi.fn(async () => null),
    listLibraryUpdates: vi.fn(async () => []),
    getStatistics: vi.fn(async () => statisticsReportOf([], "2026-09-21")),
    saveAnswers: vi.fn(async () => undefined),
    loadAnswerLog: vi.fn(async () => []),
    cardAnswers: vi.fn(async () => []),
    deckInsight: vi.fn(async () => ({
      today: "2026-09-21",
      maxReviewsPerDay: DEFAULT_PREFERENCES.maxReviewsPerDay,
      forecast: [],
      scheduled: 0,
      intervals: intervalHistogram([]),
      eases: easeHistogram([]),
      lapses: { lapses: new Map(), since: null },
      leeches: [],
    })),
    getCardProgress: vi.fn(async () => ({ today: "2026-09-21", decks: [] })),
    getCourseStatistics: vi.fn(async () => []),
    startCourse: vi.fn(async () => {
      throw new Error("startCourse fake not configured");
    }),
    getCourse: vi.fn(async () => {
      throw new Error("getCourse fake not configured");
    }),
    getCourseSummary: vi.fn(async () => {
      throw new Error("getCourseSummary fake not configured");
    }),
    answerCourseQuestion: vi.fn(async () => ({ effect: "none" as const, state: null })),
    completeChapter: vi.fn(async (deck, chapterUrl) => ({
      ...deck,
      completedChapters: [...(deck.completedChapters ?? []), chapterUrl],
    })),
    setCompletedChapters: vi.fn(async (deck, edit) => {
      const { completedChapters, ...rest } = deck;
      const after = editCompletedChapters(completedChapters ?? [], edit);
      return after.length === 0 ? rest : { ...rest, completedChapters: after };
    }),
    openTrial: vi.fn(async () => ({ ok: false as const, problems: [] })),
    addReleaseLanguages: vi.fn(async () => null),
    deckRelease: vi.fn(async () => null),
    reportPlace: vi.fn(async () => ({ library: false as const })),
    applyLibraryUpgrade: vi.fn(async (deck, plan) => ({
      ok: true as const,
      deck: { ...deck, sourceUrl: plan.releaseUrl },
    })),
    listCards: vi.fn(async () => []),
    listDeckReviewStates: vi.fn(async () => ({ sm2: [], fsrs: [] })),
    addCard: vi.fn(async () => {
      throw new Error("addCard fake not configured");
    }),
    updateCard: vi.fn(async () => {
      throw new Error("updateCard fake not configured");
    }),
    removeCard: vi.fn(async () => undefined),
    stateCardLanguages: vi.fn(async () => 0),
    editCards: vi.fn(async (_instanceUrl, _deck, _ids, _edit, previewed) => previewed),
    undoCardEdit: vi.fn(async () => undefined),
    resetCards: vi.fn(async (_instanceUrl, _deck, ids) => ids.length),
    listReleaseDrafts: vi.fn(async () => []),
    createReleaseDraft: vi.fn(async () => null),
    copyReleaseDraft: vi.fn(async () => {
      throw new Error("copyReleaseDraft fake not configured");
    }),
    getReleaseDraft: vi.fn(async () => {
      throw new Error("getReleaseDraft fake not configured");
    }),
    readReleaseDraft: vi.fn(async () => {
      throw new Error("readReleaseDraft fake not configured");
    }),
    editReleaseDraft: vi.fn(async () => {
      throw new Error("editReleaseDraft fake not configured");
    }),
    deleteReleaseDraft: vi.fn(async () => ({ keptDocuments: [] })),
    checkReleaseDraft: vi.fn(async (_draft, _check, _policy, options) => ({
      rules: [],
      library: [],
      drops: [],
      markdown: [],
      shapes: options?.shapes === true ? [] : null,
    })),
    diffReleaseDraft: vi.fn(async () => null),
    publishRelease: vi.fn(async (_draft, url) => ({ url, public: true })),
    makeReleasePublic: vi.fn(async () => undefined),
    isReleasePublic: vi.fn(async () => true),
    downloadRelease: vi.fn(async () => ({
      name: "release-v1.ttl",
      url: "https://solid-memo.com/decks/release/v1.ttl",
    })),
    listPublishedReleases: vi.fn(async () => []),
    readInstanceGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
    exportDeckFile: vi.fn(async () => undefined),
    openDeckFile: vi.fn(async () => null),
    importDeckFile: vi.fn(async () => {
      throw new Error("importDeckFile fake not configured");
    }),
    rescheduleCards: vi.fn(async (_instanceUrl, _deck, ids) => ids.length),
    transferCards: vi.fn(async (_instanceUrl, _from, _to, ids) => ({
      cards: ids.map((id: string) => ({ from: id, to: id, present: false })),
      missing: [],
      target: { save: [], reviewSaves: [], reviewRemovals: [], fsrsSaves: [], fsrsRemovals: [] },
      source: { remove: [], reviewRemovals: [] },
    })),
    planRepair: vi.fn(() => ({ repairs: [], unrepairable: [] })),
    applyRepairs: vi.fn(async () => undefined),
    planMigration: vi.fn(async () => ({
      decks: [],
      deckCount: 0,
      cardCount: 0,
      reviewCount: 0,
      preferencesOutdated: false,
      instanceOutdated: false,
      catalogMissing: false,
      oldestFormat: {
        deck: DECK_FORMAT_VERSION,
        card: CARD_FORMAT_VERSION,
        reviewState: REVIEW_STATE_FORMAT_VERSION,
        preferences: PREFERENCES_FORMAT_VERSION,
      },
    })),
    updateInstance: vi.fn(async () => ({ updated: [], failed: [] })),
    findInterruptedGuestMove: vi.fn(async () => null),
    removeInterruptedGuestMove: vi.fn(async () => undefined),
    getPreferences: vi.fn(async () => DEFAULT_PREFERENCES),
    savePreferences: vi.fn(async () => undefined),
    switchScheduler: vi.fn(async () => ({
      switched: true,
      decks: 0,
      replayed: 0,
      estimated: 0,
      failed: [],
    })),
    dismissSchedulerInvitation: vi.fn(async () => undefined),
    renameInstance: vi.fn(async (_session, instance, name) => ({ ...instance, name: name.trim() })),
    readCatalog: vi.fn(async (instanceUrl) => ({
      title: "Main",
      description: "My decks.",
      publisher: { webId: `${new URL(instanceUrl).origin}/profile/card#me`, name: "Alice" },
    })),
    // As the real one does: of the catalog as it is read.
    describeCatalog: vi.fn(async (instanceUrl, about) =>
      describedCatalog((await fake.readCatalog(instanceUrl))!, about),
    ),
    getStudyQueue: vi.fn(async () => ({
      due: [],
      newPrompts: [],
      studiedToday: 0,
      ...QUEUE_DEFAULTS,
    })),
    resetStudyDay: vi.fn(async () => 0),
    // The state of the prompt answered, as a first answer leaves it.
    recordReview: vi.fn(async (_instanceUrl, _deck, prompt) => {
      const key = { cardId: prompt.card.id, direction: prompt.direction };
      return {
        state: {
          ...key,
          easeFactor: 2.6,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-09-22",
          firstReviewedAt: "2026-09-21T10:00:00.000Z",
          lastReviewedAt: "2026-09-21T10:00:00.000Z",
          formatVersion: 2,
        },
        undo: { key, before: null, answer: { id: "answer-1", studyDay: "2026-09-21" } },
      };
    }),
    undoReview: vi.fn(async (_instanceUrl, _deck, undo) => undo.before),
    // As the real ones relate to them: the counts of the queue, the check of the full check.
    getStudyCounts: vi.fn(async (instanceUrl, deck, now) => {
      const queue = await fake.getStudyQueue(instanceUrl, deck, now);
      return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
    }),
    checkInstance: vi.fn((instanceUrl) => fake.validateInstance(instanceUrl)),
    claimDeckDocuments: vi.fn(async () => undefined),
    // A deck's health, of the instance's check, its cards, and no release.
    checkDeck: vi.fn(async (instanceUrl, deck, text) =>
      deckHealth(deck, await fake.checkInstance(instanceUrl), await fake.listCards(deck), [], text),
    ) as UseCases["checkDeck"],
    refreshStudyDigest: vi.fn(async () => undefined),
    ...overrides,
  };
  return fake;
}
