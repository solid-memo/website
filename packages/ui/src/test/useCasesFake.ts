import { vi } from "vitest";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { withAbout } from "@solid-memo/domain/deckAbout";
import { withProvenance } from "@solid-memo/domain/deckProvenance";
import { editCompletedChapters } from "@solid-memo/domain/course";
import { describedCatalog } from "@solid-memo/domain/catalog";
import { deckHealth } from "@solid-memo/domain/deckHealth";
import { applyDeckTreeEdit } from "@solid-memo/domain/deckTree";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { statisticsOf } from "@solid-memo/domain/statistics";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";

/** A complete UseCases fake; override the methods a test cares about. */
export function makeUseCasesFake(overrides: Partial<UseCases> = {}): UseCases {
  const fake: UseCases = {
    restoreSession: vi.fn(async () => null),
    startGuest: vi.fn(async () => ({ webId: "https://guest.solid-memo.invalid/profile/card#me", guest: true as const })),
    discardGuest: vi.fn(async () => undefined),
    findGuestStudy: vi.fn(async () => null),
    transferGuestStudy: vi.fn(async () => ({
      ok: true as const,
      instance: { url: "https://pod.example/solid-memo/main/", name: "My study" },
      tidied: true,
    })),
    planGuestMerge: vi.fn(async () => ({ decks: [] })),
    mergeGuestStudy: vi.fn(async (_session, _guest, target) => ({ ok: true as const, instance: target, added: [], tidied: true })),
    loginWithWebId: vi.fn(async () => undefined),
    loginWithProvider: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    onSessionExpired: vi.fn(() => () => undefined),
    language: vi.fn(() => "en" as const),
    chooseLanguage: vi.fn(),
    themeChoice: vi.fn(() => "system" as const),
    instanceTheme: vi.fn(async () => null),
    chooseTheme: vi.fn(async () => undefined),
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
    deleteInstance: vi.fn(async () => ({ keptFolder: null })),
    dataClassRegistrations: vi.fn(async () => ({
      registrations: (["instance", "catalog", "deck", "card", "reviewState", "answer"] as const).map((dataClass) => ({
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
      children: (await fake.listDecks(instanceUrl)).map((deck) => ({ kind: "deck" as const, deck })),
      readOnly: false,
    })),
    newDeckGroup: vi.fn((instanceUrl, title) => ({ url: `${instanceUrl}catalog.ttl#group-fake`, title })),
    editDeckTree: vi.fn(async (instanceUrl, edit) => applyDeckTreeEdit(await fake.listDeckTree(instanceUrl), edit)),
    setDeckDirection: vi.fn(async (deck, direction) => ({ ...deck, direction })),
    // As the real one does: keywords tidied, and left off when there are none.
    describeDeck: vi.fn(async (deck, about) => withAbout(deck, about)),
    setDeckPace: vi.fn(async (deck, pace) => ({ ...deck, ...pace })),
    // As the real one does: authors tidied, the licence one offered.
    setDeckProvenance: vi.fn(async (deck, provenance) => withProvenance(deck, provenance)),
    setDecksDirection: vi.fn(async (decks: readonly Deck[], direction) => decks.map((deck) => ({ ...deck, direction }))),
    setDecksPace: vi.fn(async (decks: readonly Deck[], pace) => decks.map((deck) => ({ ...deck, ...pace }))),
    removeDeck: vi.fn(async () => undefined),
    removeDecks: vi.fn(async () => undefined),
    listLibraryDecks: vi.fn(async () => []),
    importLibraryDeck: vi.fn(async () => {
      throw new Error("importLibraryDeck fake not configured");
    }),
    listLibraryCards: vi.fn(async () => []),
    planLibraryUpgrade: vi.fn(async () => null),
    listLibraryUpdates: vi.fn(async () => []),
    getStatistics: vi.fn(async () => statisticsOf([], "2026-09-21")),
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
    startCourse: vi.fn(async () => {
      throw new Error("startCourse fake not configured");
    }),
    getCourse: vi.fn(async () => {
      throw new Error("getCourse fake not configured");
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
    addReleaseLanguages: vi.fn(async () => null),
    deckRelease: vi.fn(async () => null),
    applyLibraryUpgrade: vi.fn(async (deck, plan) => ({
      ok: true as const,
      deck: { ...deck, sourceUrl: plan.releaseUrl },
    })),
    listCards: vi.fn(async () => []),
    listDeckReviewStates: vi.fn(async () => []),
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
    rescheduleCards: vi.fn(async (_instanceUrl, _deck, ids) => ids.length),
    transferCards: vi.fn(async (_instanceUrl, _from, _to, ids) => ({
      cards: ids.map((id: string) => ({ from: id, to: id, present: false })),
      missing: [],
      target: { save: [], reviewSaves: [], reviewRemovals: [] },
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
    })),
    updateInstance: vi.fn(async () => ({ updated: [], failed: [] })),
    findInterruptedGuestMove: vi.fn(async () => null),
    removeInterruptedGuestMove: vi.fn(async () => undefined),
    getPreferences: vi.fn(async () => DEFAULT_PREFERENCES),
    savePreferences: vi.fn(async () => undefined),
    renameInstance: vi.fn(async (_session, instance, name) => ({ ...instance, name: name.trim() })),
    readCatalog: vi.fn(async (instanceUrl) => ({
      title: "Main",
      description: "My decks.",
      publisher: { webId: `${new URL(instanceUrl).origin}/profile/card#me`, name: "Alice" },
    })),
    // As the real one does: of the catalogue as it is read.
    describeCatalog: vi.fn(async (instanceUrl, about) => describedCatalog((await fake.readCatalog(instanceUrl))!, about)),
    getStudyQueue: vi.fn(async () => ({
      due: [],
      newPrompts: [],
      studiedToday: 0,
    })),
    resetStudyDay: vi.fn(async () => 0),
    recordReview: vi.fn(async () => ({
      cardId: "card-1",
      direction: "front-to-back" as const,
      easeFactor: 2.6,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: "2026-09-21T10:00:00.000Z",
      lastReviewedAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 2,
    })),
    // As the real ones relate to them: the counts of the queue, the check of the full check.
    getStudyCounts: vi.fn(async (instanceUrl, deck, now) => {
      const queue = await fake.getStudyQueue(instanceUrl, deck, now);
      return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
    }),
    checkInstance: vi.fn((instanceUrl) => fake.validateInstance(instanceUrl)),
    // A deck's health, of the instance's check, its cards, and no release.
    checkDeck: vi.fn(async (instanceUrl, deck, text) =>
      deckHealth(deck, await fake.checkInstance(instanceUrl), await fake.listCards(deck), [], text),
    ) as UseCases["checkDeck"],
    refreshStudyDigest: vi.fn(async () => undefined),
    ...overrides,
  };
  return fake;
}
