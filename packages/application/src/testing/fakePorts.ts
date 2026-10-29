// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { vi } from "vitest";
import { NO_PORTS } from "./noPorts";
import type { Answer } from "@solid-memo/domain/answer";
import type {
  AnswerLog,
  Since,
  DeckLibrary,
  DeckRepository,
  InstanceRepository,
  PreferencesRepository,
  ReviewStateRepository,
  SessionGateway,
  StorageGateway,
  WebIdDocumentRepository,
  ShapeValidator,
  RepairRepository,
  InstanceCopier,
} from "../ports";
import { DECK_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { PromptStates } from "@solid-memo/domain/grading";
import type { ReviewState, ReviewStates } from "@solid-memo/domain/review";
import type { Catalog } from "@solid-memo/domain/catalog";
import type { Session } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";

/**
 * What the use cases' tests are written against: a user, their pod and
 * instance, a deck with a card, a library deck, and every port the use
 * cases are given, each a fake (`vi.fn` per method) a test can change.
 */

export const session: Session = { webId: "https://alice.example/profile/card#me" };
export const document: WebIdDocument = {
  url: "https://alice.example/profile/card",
  subjects: [],
};
export const storage: Storage = { url: "https://alice.example/", source: "profile" };
export const catalog: Catalog = {
  title: "Main",
  description: "My decks.",
  publisher: { webId: session.webId, name: "Alice" },
};
/** A deck's states, SM-2's alone: no FSRS-6 state beside them. */
export const sm2s = (sm2: ReviewState[]): ReviewStates => ({ sm2, fsrs: [] });
/** A prompt's states, SM-2's alone. */
export const promptOf = (sm2: ReviewState | null): PromptStates => ({ sm2, fsrs: null });

export const instance: Instance = {
  url: "https://alice.example/solid-memo/main/",
  name: "Main",
};
export const deck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: DECK_FORMAT_VERSION,
  authors: [],
};
export const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
export const libraryDeck: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
  title: { en: "Capitals" },
  cardCount: 1,
  languages: [],
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  sources: [],
};
export const libraryContent: LibraryDeckContent = {
  url: libraryDeck.url,
  title: { en: "Capitals" },
  formatVersion: 1,
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  version: "1",
  seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
  themes: [],
  keywords: {},
  cards: [{ id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 }],
};

export function makeDeps() {
  const sessionGateway: SessionGateway = {
    restore: vi.fn(async () => ({ session, origin: "login" as const })),
    discoverOidcIssuer: vi.fn(async () => "https://issuer.example"),
    login: vi.fn(async () => undefined),
    loginWithIssuer: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    onSessionExpired: vi.fn(() => () => undefined),
  };
  const webIdDocumentRepository: WebIdDocumentRepository = {
    fetchWebIdDocument: vi.fn(async () => document),
  };
  const storageGateway: StorageGateway = {
    discoverStorages: vi.fn(async () => [storage]),
    probeStorage: vi.fn(async () => storage),
  };
  const instanceRepository: InstanceRepository = {
    listInstances: vi.fn(async () => [instance]),
    getRegistrationOptions: vi.fn(async () => ({
      privateIndexExists: true,
      publicIndexExists: false,
    })),
    createInstance: vi.fn(async () => instance),
    attachInstance: vi.fn(async () => instance),
    deleteInstance: vi.fn(async () => ({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    })),
    readMeta: vi.fn(async () => null),
    saveMeta: vi.fn(async () => undefined),
    renameRegistrations: vi.fn(async () => undefined),
    upgradeMeta: vi.fn(async () => true),
    readDataClassRegistrations: vi.fn(async () => ({
      registrations: [],
      privateIndexMissing: false,
      unreadableIndexes: [],
    })),
    registerDataClasses: vi.fn(async () => undefined),
  };
  const deckRepository: DeckRepository = {
    listDecks: vi.fn(async () => [deck]),
    readCatalog: vi.fn(async () => catalog),
    saveCatalog: vi.fn(async () => undefined),
    createDeck: vi.fn(async () => deck),
    renameDeck: vi.fn(async () => deck),
    saveDeck: vi.fn(async (saved) => saved),
    saveDecks: vi.fn(async (saved) => [...saved]),
    removeDeck: vi.fn(async () => ({ keptDocuments: [] })),
    removeDecks: vi.fn(async () => ({ keptDocuments: [] })),
    readDeckTree: vi.fn(async () => ({
      children: [{ kind: "deck" as const, deck }],
      readOnly: false,
    })),
    editDeckTree: vi.fn(async () => ({
      children: [{ kind: "deck" as const, deck }],
      readOnly: false,
    })),
    listCards: vi.fn(async () => [card]),
    addCard: vi.fn(async () => card),
    updateCard: vi.fn(async () => card),
    removeCard: vi.fn(async () => undefined),
    upgradeCards: vi.fn(async () => true),
    stateCardLanguages: vi.fn(async (_deck, ids) => ids.length),
    applyCardChanges: vi.fn(async () => undefined),
    importDeck: vi.fn(async () => deck),
    addDeck: vi.fn(async (added) => added),
    readCardsSince: vi.fn(async (d) => ({
      unchanged: false as const,
      value: await deckRepository.listCards(d),
      version: null,
    })),
    readDeck: vi.fn(async () => deck),
    upgradeDecks: vi.fn(async () => true),
    upgradeDeckEntry: vi.fn(async (_current, next) => next),
    deleteDocument: vi.fn(async () => undefined),
    unclaimedDocuments: vi.fn(async () => []),
    claimDocuments: vi.fn(async () => undefined),
    completeChapter: vi.fn(async (completed, chapterUrl) => ({
      ...completed,
      completedChapters: [...(completed.completedChapters ?? []), chapterUrl],
    })),
    setCompletedChapters: vi.fn(async (edited) => edited),
    setCardLanguage: vi.fn(async (edited, language) =>
      language === null ? edited : { ...edited, cardLanguage: language },
    ),
    registerDeck: vi.fn(async (registered) => registered),
  };
  const deckLibrary: DeckLibrary = {
    listLibraryDecks: vi.fn(async () => [libraryDeck]),
    fetchLibraryDeck: vi.fn(async () => libraryContent),
    fetchCourseOutline: vi.fn(async (releaseUrl) => ({ releaseUrl, chapters: [] })),
    readLibraryIndex: vi.fn(async () => ({
      url: "https://site.example/decks/index.ttl",
      publisher: null,
      releases: [],
    })),
    readRelease: vi.fn(async (url: string): Promise<LibraryDeck> => {
      throw new AppError("releaseUnreadable", { url });
    }),
    publishedBeside: vi.fn(async (): Promise<string[] | null> => null),
  };
  const preferencesRepository: PreferencesRepository = {
    getPreferences: vi.fn(async () => null),
    savePreferences: vi.fn(async () => undefined),
    upgradePreferences: vi.fn(async () => true),
    connectedScreenSkipped: vi.fn(async () => false),
    markConnectedScreen: vi.fn(async (): Promise<"written" | "unchanged" | "none"> => "written"),
  };
  const reviewStateRepository: ReviewStateRepository = {
    listReviewStates: vi.fn(async (): Promise<ReviewStates> => ({ sm2: [], fsrs: [] })),
    getReviewState: vi.fn(async (): Promise<PromptStates> => ({ sm2: null, fsrs: null })),
    // As the real one does: the grade applied to the state stored, which getReviewState gives.
    gradeReviewState: vi.fn(async (deck, key, grade) => {
      const current = await reviewStateRepository.getReviewState(deck, key);
      return { state: grade(current), current };
    }),
    createReviewStates: vi.fn(async () => undefined),
    applyReviewChanges: vi.fn(async () => undefined),
    upgradeReviewStates: vi.fn(async () => true),
    // As the real one does: the states made of those stored, which listReviewStates gives.
    writeFsrsStates: vi.fn(async (d, edit) => {
      edit(await reviewStateRepository.listReviewStates(d));
    }),
    readReviewStatesSince: vi.fn(async (d) => ({
      unchanged: false as const,
      value: await reviewStateRepository.listReviewStates(d),
      version: null,
    })),
  };
  const shapeValidator: ShapeValidator = {
    validateDocument: vi.fn(async (url) => ({
      url,
      status: "checked" as const,
      subjects: [],
    })),
    validateDocumentSince: vi.fn(async (url) => ({
      unchanged: false as const,
      value: await shapeValidator.validateDocument(url),
      version: null,
    })),
    validateRelease: vi.fn(async () => []),
  };
  const repairRepository: RepairRepository = {
    applyRepairs: vi.fn(async () => undefined),
  };
  const instanceCopier: InstanceCopier = {
    listResources: vi.fn(async () => [`${instance.url}decks/`, `${instance.url}meta.ttl`]),
    ensureAbsent: vi.fn(async () => undefined),
    createContainer: vi.fn(async () => undefined),
    copyResource: vi.fn(async (from: string) => `version of ${from}`),
    isUnchanged: vi.fn(async () => true),
    versionOf: vi.fn(async (url: string): Promise<string | null> => `version of ${url}`),
    mentions: vi.fn(async () => false),
    deleteRecursively: vi.fn(async () => undefined),
  };
  const updateJournal = {
    begin: vi.fn(),
    end: vi.fn(),
    staging: vi.fn((_sourceUrl: string): string | null => null),
    run: vi.fn((_sourceUrl: string): (() => void) => vi.fn()),
    watch: vi.fn(),
  };
  return {
    ...NO_PORTS,
    sessionGateway,
    webIdDocumentRepository,
    storageGateway,
    instanceRepository,
    deckRepository,
    deckLibrary,
    preferencesRepository,
    reviewStateRepository,
    shapeValidator,
    repairRepository,
    instanceCopier,
    updateJournal,
    now: () => new Date("2026-09-28T10:00:00.000Z"),
    newId: () => "0f3a",
  };
}

/** An answer log kept in memory, by study month. */
export function memoryLog() {
  const byMonth = new Map<string, Answer[]>();
  /** Each month's version: how often it changed. */
  const versions = new Map<string, number>();
  const changed = (month: string) => versions.set(month, (versions.get(month) ?? 0) + 1);
  const log = {
    append: vi.fn(async (_instanceUrl: string, answer: Answer) => {
      const month = answer.studyDay.slice(0, 7);
      const answers = byMonth.get(month);
      if (answers === undefined) byMonth.set(month, [answer]);
      else answers.push(answer);
      changed(month);
    }),
    appendAll: vi.fn(async () => undefined),
    months: vi.fn(async () => [...byMonth.keys()].sort()),
    readMonth: vi.fn(async (_instanceUrl: string, month: string) => byMonth.get(month) ?? []),
    readMonthSince: vi.fn(
      async (
        _instanceUrl: string,
        month: string,
        version: string | undefined,
      ): Promise<Since<Answer[]>> => {
        const now = `v${versions.get(month) ?? 0}`;
        return version === now
          ? { unchanged: true }
          : { unchanged: false, value: byMonth.get(month) ?? [], version: now };
      },
    ),
    removeDay: vi.fn(async (_instanceUrl: string, deckUrl: string, studyDay: string) => {
      for (const [month, answers] of byMonth) {
        byMonth.set(
          month,
          answers.filter((a) => a.deckUrl !== deckUrl || a.studyDay !== studyDay),
        );
        changed(month);
      }
    }),
    removeAnswer: vi.fn(async (_instanceUrl: string, studyDay: string, id: string) => {
      const month = studyDay.slice(0, 7);
      byMonth.set(
        month,
        (byMonth.get(month) ?? []).filter((a) => a.id !== id),
      );
      changed(month);
    }),
  } satisfies AnswerLog;
  return { log, byMonth };
}
