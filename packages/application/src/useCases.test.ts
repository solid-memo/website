import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import type {
  AnswerLog,
  DigestRepository,
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
  GuestPod,
} from "./ports";
import { GUEST_INSTANCE_URL, GUEST_ORIGIN, GUEST_SESSION, GUEST_WEBID, guestDeckStamp } from "@solid-memo/domain/guest";
import { createUseCases } from "./useCases";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import type { ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import type { Catalog } from "@solid-memo/domain/catalog";
import type { Session } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import {
  sameDeckState,
  withDeckChanges,
  type DeckUpgradeProgress,
} from "@solid-memo/domain/deckUpgrade";
import type { LibraryCard } from "@solid-memo/domain/library";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { Locale } from "@solid-memo/domain/locale";

const session: Session = { webId: "https://alice.example/profile/card#me" };
const document: WebIdDocument = {
  url: "https://alice.example/profile/card",
  subjects: [],
};
const storage: Storage = { url: "https://alice.example/", source: "profile" };
const catalog: Catalog = {
  title: "Main",
  description: "My decks.",
  publisher: { webId: session.webId, name: "Alice" },
};
const instance: Instance = {
  url: "https://alice.example/solid-memo/main/",
  name: "Main",
};
const deck: Deck = {
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
const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
const libraryDeck: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
  title: { en: "Capitals" },
  cardCount: 1,
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  sources: [],
};
const libraryContent: LibraryDeckContent = {
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

function makeDeps() {
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
    deleteInstance: vi.fn(async () => ({ keptFolder: null })),
    deleteInstanceData: vi.fn(async () => ({ keptFolder: null })),
    readMeta: vi.fn(async () => null),
    upgradeMeta: vi.fn(async () => true),
    readDataClassRegistrations: vi.fn(async () => ({ registrations: [], privateIndexMissing: false, unreadableIndexes: [] })),
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
    removeDeck: vi.fn(async () => undefined),
    removeDecks: vi.fn(async () => undefined),
    readDeckTree: vi.fn(async () => ({ children: [{ kind: "deck" as const, deck }], readOnly: false })),
    editDeckTree: vi.fn(async () => ({ children: [{ kind: "deck" as const, deck }], readOnly: false })),
    listCards: vi.fn(async () => [card]),
    addCard: vi.fn(async () => card),
    updateCard: vi.fn(async () => card),
    removeCard: vi.fn(async () => undefined),
    upgradeCards: vi.fn(async () => true),
    stateCardLanguages: vi.fn(async (_deck, ids) => ids.length),
    applyCardChanges: vi.fn(async () => undefined),
    importDeck: vi.fn(async () => deck),
    addDeck: vi.fn(async (added) => added),
    readCardsSince: vi.fn(async (d) => ({ unchanged: false as const, value: await deckRepository.listCards(d), version: null })),
    readDeck: vi.fn(async () => deck),
    upgradeDecks: vi.fn(async () => true),
    upgradeDeckEntry: vi.fn(async (_current, next) => next),
    deleteDocument: vi.fn(async () => undefined),
    completeChapter: vi.fn(async (completed, chapterUrl) => ({
      ...completed,
      completedChapters: [...(completed.completedChapters ?? []), chapterUrl],
    })),
  };
  const deckLibrary: DeckLibrary = {
    listLibraryDecks: vi.fn(async () => [libraryDeck]),
    fetchLibraryDeck: vi.fn(async () => libraryContent),
    fetchCourseOutline: vi.fn(async (releaseUrl) => ({ releaseUrl, chapters: [] })),
  };
  const preferencesRepository: PreferencesRepository = {
    getPreferences: vi.fn(async () => null),
    savePreferences: vi.fn(async () => undefined),
    upgradePreferences: vi.fn(async () => true),
  };
  const reviewStateRepository: ReviewStateRepository = {
    listReviewStates: vi.fn(async () => []),
    getReviewState: vi.fn(async () => null),
    saveReviewState: vi.fn(async () => undefined),
    createReviewStates: vi.fn(async () => undefined),
    applyReviewChanges: vi.fn(async () => undefined),
    upgradeReviewStates: vi.fn(async () => true),
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

describe("createUseCases", () => {
  describe("language", () => {
    it("speaks the chosen language, and keeps a new choice", () => {
      let chosen: Locale | null = "sv";
      const languagePreference = {
        chosen: () => chosen,
        choose: vi.fn((locale: Locale) => {
          chosen = locale;
        }),
      };
      const useCases = createUseCases({ ...makeDeps(), languagePreference });
      expect(useCases.language(["en-US"])).toBe("sv");
      useCases.chooseLanguage("en");
      expect(languagePreference.choose).toHaveBeenCalledWith("en");
      expect(useCases.language(["sv-SE"])).toBe("en");
    });

    it("speaks the browser's language when none is kept", () => {
      const useCases = createUseCases(makeDeps());
      useCases.chooseLanguage("en");
      expect(useCases.language(["sv-SE"])).toBe("sv");
    });
  });

  describe("theme", () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";

    function devicePreference(initial: ThemeChoice = "system") {
      let chosen = initial;
      return {
        chosen: () => chosen,
        choose: vi.fn((choice: ThemeChoice) => {
          chosen = choice;
        }),
      };
    }

    function stored(theme: ThemeChoice) {
      return { preferences: { ...DEFAULT_PREFERENCES, theme }, formatVersion: 4 };
    }

    it("keeps the theme chosen on this device", async () => {
      const themePreference = devicePreference("dark");
      const deps = makeDeps();
      const useCases = createUseCases({ ...deps, themePreference });
      expect(useCases.themeChoice()).toBe("dark");
      await useCases.chooseTheme("light", null);
      expect(useCases.themeChoice()).toBe("light");
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
    });

    it("follows the browser when nothing is kept", async () => {
      const useCases = createUseCases(makeDeps());
      await useCases.chooseTheme("dark", null);
      expect(useCases.themeChoice()).toBe("system");
    });

    it("reads an instance's theme, and keeps it on this device for the first paint", async () => {
      const themePreference = devicePreference("light");
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("dark"));
      const useCases = createUseCases({ ...deps, themePreference });
      await expect(useCases.instanceTheme(INSTANCE)).resolves.toBe("dark");
      expect(useCases.themeChoice()).toBe("dark");
    });

    it("has no instance theme before the instance's first preferences, and leaves the device's", async () => {
      const themePreference = devicePreference("light");
      const useCases = createUseCases({ ...makeDeps(), themePreference });
      await expect(useCases.instanceTheme(INSTANCE)).resolves.toBeNull();
      expect(themePreference.choose).not.toHaveBeenCalled();
    });

    it("keeps a choice in the instance's preferences once it has them", async () => {
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("system"));
      const useCases = createUseCases(deps);
      await useCases.chooseTheme("dark", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledExactlyOnceWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        theme: "dark",
      });
    });

    it("keeps a choice on this device alone before the instance's first preferences, or when they already say it", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await useCases.chooseTheme("dark", INSTANCE);
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("dark"));
      await useCases.chooseTheme("dark", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
    });

    it("writes one choice after another, a failed one not stopping the next", async () => {
      const deps = makeDeps();
      let theme: ThemeChoice = "system";
      vi.mocked(deps.preferencesRepository.getPreferences).mockImplementation(async () => stored(theme));
      vi.mocked(deps.preferencesRepository.savePreferences)
        .mockRejectedValueOnce(new Error("412"))
        .mockImplementation(async (_, preferences) => {
          theme = preferences.theme;
        });
      const useCases = createUseCases(deps);
      const first = useCases.chooseTheme("dark", INSTANCE);
      const second = useCases.chooseTheme("light", INSTANCE);
      await expect(first).rejects.toThrow("412");
      await second;
      expect(theme).toBe("light");
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledTimes(2);
    });

    it("keeps the theme of saved preferences on this device too", async () => {
      const themePreference = devicePreference();
      const useCases = createUseCases({ ...makeDeps(), themePreference });
      await useCases.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, theme: "light" });
      expect(useCases.themeChoice()).toBe("light");
    });
  });

  it("restoreSession delegates to the session gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.restoreSession()).resolves.toEqual({
      session,
      origin: "login",
    });
    expect(deps.sessionGateway.restore).toHaveBeenCalledOnce();
  });

  it("loginWithWebId trims the WebID before delegating", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.loginWithWebId("  https://alice.example/profile/card#me ");
    expect(deps.sessionGateway.login).toHaveBeenCalledWith(
      "https://alice.example/profile/card#me",
    );
  });

  it("loginWithWebId rejects an invalid WebID without contacting the gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(
      useCases.loginWithWebId("http://alice.example/profile/card#me"),
    ).rejects.toThrow("A WebID must start with https://.");
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });

  it("loginWithProvider starts login at the chosen issuer", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.loginWithProvider("https://login.inrupt.com");
    expect(deps.sessionGateway.loginWithIssuer).toHaveBeenCalledWith(
      "https://login.inrupt.com",
    );
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });

  it("loginWithProvider rejects an issuer that is not an https URL", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(
      useCases.loginWithProvider("http://idp.example"),
    ).rejects.toThrow("An identity provider must be an https:// URL.");
    expect(deps.sessionGateway.loginWithIssuer).not.toHaveBeenCalled();
  });

  it("discoverAccount combines the first storage with the profile's issuer", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).resolves.toEqual({
      webId: session.webId,
      name: undefined,
      podUrl: storage.url,
      oidcIssuer: "https://issuer.example",
    });
    expect(deps.storageGateway.discoverStorages).toHaveBeenCalledWith(
      session.webId,
    );
    expect(deps.sessionGateway.discoverOidcIssuer).toHaveBeenCalledWith(
      session.webId,
    );
  });

  it("discoverAccount takes the name from the profile's foaf:name", async () => {
    const deps = makeDeps();
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
      url: document.url,
      subjects: [
        {
          url: session.webId,
          properties: [
            {
              predicate: "http://xmlns.com/foaf/0.1/name",
              values: [{ type: "langString", value: "Alice", language: "en" }],
            },
          ],
        },
      ],
    });
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.name).toBe("Alice");
    expect(
      deps.webIdDocumentRepository.fetchWebIdDocument,
    ).toHaveBeenCalledWith(session.webId);
  });

  it("discoverAccount tolerates an unreadable profile document", async () => {
    const deps = makeDeps();
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(
      new Error("profile unreachable"),
    );
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.name).toBeUndefined();
    expect(account.podUrl).toBe(storage.url);
  });

  it("discoverAccount leaves the Pod out when no storage is advertised", async () => {
    const deps = makeDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockResolvedValue([]);
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.podUrl).toBeUndefined();
  });

  it("discoverAccount tolerates a failed issuer lookup", async () => {
    const deps = makeDeps();
    vi.mocked(deps.sessionGateway.discoverOidcIssuer).mockRejectedValue(
      new Error("no issuer"),
    );
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).resolves.toEqual({
      webId: session.webId,
      name: undefined,
      podUrl: storage.url,
      oidcIssuer: undefined,
    });
  });

  it("discoverAccount fails when storage discovery fails", async () => {
    const deps = makeDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockRejectedValue(
      new Error("profile unreachable"),
    );
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).rejects.toThrow(
      "profile unreachable",
    );
  });

  it("logout delegates to the session gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.logout();
    expect(deps.sessionGateway.logout).toHaveBeenCalledOnce();
  });

  it("onSessionExpired delegates to the session gateway", () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const listener = () => undefined;
    const unsubscribe = useCases.onSessionExpired(listener);
    expect(deps.sessionGateway.onSessionExpired).toHaveBeenCalledWith(
      listener,
    );
    expect(typeof unsubscribe).toBe("function");
  });

  it("viewWebIdDocument fetches the document for the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.viewWebIdDocument(session)).resolves.toEqual(
      document,
    );
    expect(
      deps.webIdDocumentRepository.fetchWebIdDocument,
    ).toHaveBeenCalledWith(session.webId);
  });

  it("listStorages discovers storages for the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.listStorages(session)).resolves.toEqual([storage]);
    expect(deps.storageGateway.discoverStorages).toHaveBeenCalledWith(
      session.webId,
    );
  });

  it("addManualStorage trims the URL before probing", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(
      useCases.addManualStorage("  https://alice.example/ "),
    ).resolves.toEqual(storage);
    expect(deps.storageGateway.probeStorage).toHaveBeenCalledWith(
      "https://alice.example/",
    );
  });

  it("listInstances delegates with the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.listInstances(session)).resolves.toEqual([instance]);
    expect(deps.instanceRepository.listInstances).toHaveBeenCalledWith(
      session.webId,
    );
  });

  it("getRegistrationOptions delegates with the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.getRegistrationOptions(session)).resolves.toEqual({
      privateIndexExists: true,
      publicIndexExists: false,
    });
    expect(
      deps.instanceRepository.getRegistrationOptions,
    ).toHaveBeenCalledWith(session.webId);
  });

  it("describeDeck saves the deck's description in the languages given, topics and keywords, refusing an empty description", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.describeDeck(deck, { description: { en: " Kanji. " }, topics: [], keywords: { en: ["kanji"] } });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({ ...deck, description: { en: "Kanji." }, keywords: { en: ["kanji"] } });
    // Only the language the user stated: no English stands in for it.
    await useCases.describeDeck(deck, { description: { sv: "Kanji." }, topics: [], keywords: {} });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({ ...deck, description: { sv: "Kanji." } });
    await expect(useCases.describeDeck(deck, { description: { en: "" }, topics: [], keywords: {} })).rejects.toThrow(
      "A deck needs a description.",
    );
  });

  it("describeDeck saves keywords under the canonical form of each stated language, refusing a tag that names no language and new untagged keywords", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const legacy = { ...deck, keywords: { "": ["kanji"] } };
    await useCases.describeDeck(legacy, {
      description: { en: "Kanji." },
      topics: [],
      keywords: { "": ["kanji"], "JA-jp": ["漢字"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({
      ...deck,
      description: { en: "Kanji." },
      keywords: { "": ["kanji"], "ja-jp": ["漢字"], he: ["קאנג'י", "כתב"] },
    });
    await expect(
      useCases.describeDeck(deck, { description: { en: "Kanji." }, topics: [], keywords: { Swedish: ["kanji"] } }),
    ).rejects.toThrow("“Swedish” is not a language code.");
    await expect(
      useCases.describeDeck(legacy, { description: { en: "Kanji." }, topics: [], keywords: { "": ["kanji", "N5"] } }),
    ).rejects.toThrow("Choose the language of the keywords.");
  });

  it("describeDeck keeps the keyword tags the deck already has as stored, checking only the ones the user states", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    // Tags another app wrote: ones the app would refuse ("und", "en-x-custom")
    // or re-tag ("iw") if the user chose them.
    const stored = { ...deck, keywords: { und: ["foo"], "en-x-custom": ["bar"], iw: ["קאנג'י"] } };
    await useCases.describeDeck(stored, {
      description: { en: "Only the description changed." },
      topics: [],
      keywords: { und: ["foo"], "EN-x-Custom": ["bar"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({
      ...deck,
      description: { en: "Only the description changed." },
      keywords: { und: ["foo"], "en-x-custom": ["bar"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    // A tag the deck does not have is still checked.
    await expect(
      useCases.describeDeck(stored, { description: { en: "Kanji." }, topics: [], keywords: { "fr-x-custom": ["baz"] } }),
    ).rejects.toThrow("“fr-x-custom” is not a language code.");
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledTimes(1);
  });

  describe("stateCardLanguages", () => {
    const cardOf = (id: string, content: Partial<Card>): Card => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      ...content,
    });

    it("re-keys only the untagged sides, leaving tagged sides and unchanged cards alone", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        cardOf("both", {}),
        cardOf("back-only", { front: { ja: "火" } }),
        cardOf("tagged", { front: { ja: "木" }, back: { en: "tree" } }),
      ]);
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, { front: "JA", back: "en" })).resolves.toBe(2);
      // The tag as the app stores it, lower-cased.
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenCalledWith(deck, ["both", "back-only"], {
        front: "ja",
        back: "en",
      });
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).resolves.toBe(1);
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenLastCalledWith(deck, ["both"], { front: "ja" });
      expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    });

    it("skips the cards still as the deck's library release has them", async () => {
      const deps = makeDeps();
      const imported = { ...deck, sourceUrl: libraryContent.url };
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        cardOf("sweden", { front: { "": "Sweden" }, back: { "": "Stockholm" } }),
        cardOf("mine", { front: { "": "Norway" }, back: { "": "Oslo" } }),
      ]);
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(imported, { front: "en", back: "en" })).resolves.toBe(1);
      expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryContent.url);
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenCalledWith(imported, ["mine"], { front: "en", back: "en" });
    });

    it("writes nothing when no side is to change, or the language is no language code", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, {})).resolves.toBe(0);
      expect(deps.deckRepository.listCards).not.toHaveBeenCalled();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValueOnce([{ ...card, front: { ja: "水" }, back: { en: "water" } }]);
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).resolves.toBe(0);
      await expect(useCases.stateCardLanguages(deck, { front: "en", back: "x-klingon" })).rejects.toThrow(
        "“x-klingon” is not a language code.",
      );
      expect(deps.deckRepository.listCards).toHaveBeenCalledTimes(1);
      expect(deps.deckRepository.stateCardLanguages).not.toHaveBeenCalled();
    });

    it("passes on the pod's refusal of a cards document changed since it was read", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.stateCardLanguages).mockRejectedValue(
        new AppError("changedElsewhere", { url: deck.cardsDocumentUrl }),
      );
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).rejects.toMatchObject({ code: "changedElsewhere" });
    });
  });

  it("listDeckReviewStates reads the deck's review states as stored", async () => {
    const deps = makeDeps();
    const stored: ReviewState[] = [
      {
        cardId: "card-1",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-27",
        firstReviewedAt: "2026-09-26T10:00:00.000Z",
        lastReviewedAt: "2026-09-26T10:00:00.000Z",
        formatVersion: 2,
      },
    ];
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(stored);
    const useCases = createUseCases(deps);
    await expect(useCases.listDeckReviewStates(deck)).resolves.toBe(stored);
    expect(deps.reviewStateRepository.listReviewStates).toHaveBeenCalledWith(deck);
  });

  it("setDeckPace saves the deck's own daily limits, refusing one that is not a whole number", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.setDeckPace({ ...deck, maxReviewsPerDay: 50 }, { newCardsPerDay: 5 });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({ ...deck, newCardsPerDay: 5 });
    await expect(useCases.setDeckPace(deck, { newCardsPerDay: 1.5 })).rejects.toThrow(
      "A daily limit is a whole number, 0 or more.",
    );
  });

  it("sets several decks' direction or pace in one save, and removes several decks at once", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const other = { ...deck, id: "deck-2", url: `${deck.url}-2`, newCardsPerDay: 9 };
    await expect(useCases.setDecksDirection([deck, other], "back-to-front")).resolves.toEqual([
      { ...deck, direction: "back-to-front" },
      { ...other, direction: "back-to-front" },
    ]);
    await useCases.setDecksPace([deck, other], { maxReviewsPerDay: 40 });
    expect(deps.deckRepository.saveDecks).toHaveBeenLastCalledWith([
      { ...deck, maxReviewsPerDay: 40 },
      { ...deck, id: "deck-2", url: `${deck.url}-2`, maxReviewsPerDay: 40 },
    ]);
    expect(deps.deckRepository.saveDecks).toHaveBeenCalledTimes(2);
    await expect(useCases.setDecksPace([deck], { newCardsPerDay: -1 })).rejects.toThrow(
      "A daily limit is a whole number, 0 or more.",
    );
    expect(deps.deckRepository.saveDecks).toHaveBeenCalledTimes(2);
    await useCases.removeDecks([deck, other]);
    expect(deps.deckRepository.removeDecks).toHaveBeenCalledWith([deck, other]);
  });

  it("createInstance trims inputs and passes the WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.createInstance(session, {
      containerUrl: " https://alice.example/solid-memo/main/ ",
      name: " Main ",
      registrationTarget: "private",
    });
    expect(deps.instanceRepository.createInstance).toHaveBeenCalledWith({
      webId: session.webId,
      containerUrl: "https://alice.example/solid-memo/main/",
      name: "Main",
      registrationTarget: "private",
    });
    expect(deps.deckRepository.saveCatalog).toHaveBeenCalledWith(instance.url, {
      title: instance.name,
      description: `Flashcard decks of the Solid Memo instance ${instance.name}.`,
      publisher: { webId: session.webId, name: session.webId },
    });
  });

  it("attachInstanceByUrl trims the URL and passes the WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.attachInstanceByUrl(
      session,
      " https://alice.example/solid-memo/main/ ",
      "public",
    );
    expect(deps.instanceRepository.attachInstance).toHaveBeenCalledWith({
      webId: session.webId,
      instanceUrl: "https://alice.example/solid-memo/main/",
      registrationTarget: "public",
    });
  });

  it("deleteInstance passes the WebID and the instance, and says what it kept", async () => {
    const deps = makeDeps();
    vi.mocked(deps.instanceRepository.deleteInstance).mockResolvedValue({ keptFolder: instance.url });
    const useCases = createUseCases(deps);
    await expect(useCases.deleteInstance(session, instance)).resolves.toEqual({ keptFolder: instance.url });
    expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
      webId: session.webId,
      instance,
    });
  });

  it("dataClassRegistrations and registerDataClasses pass the WebID and the instance, titled with its name", async () => {
    const deps = makeDeps();
    const registrations = {
      registrations: [{ dataClass: "deck" as const, index: "private" as const, registered: false }],
      privateIndexMissing: false,
      unreadableIndexes: [],
    };
    vi.mocked(deps.instanceRepository.readDataClassRegistrations).mockResolvedValue(registrations);
    const useCases = createUseCases(deps);
    await expect(useCases.dataClassRegistrations(session, instance)).resolves.toEqual(registrations);
    expect(deps.instanceRepository.readDataClassRegistrations).toHaveBeenCalledWith({
      webId: session.webId,
      instanceUrl: instance.url,
    });
    await useCases.registerDataClasses(session, instance);
    expect(deps.instanceRepository.registerDataClasses).toHaveBeenCalledWith({
      webId: session.webId,
      instanceUrl: instance.url,
      title: instance.name,
    });
  });

  it("deck tree use cases name a new group with a fresh id, and tidy a group's name", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await expect(useCases.listDeckTree(instance.url)).resolves.toEqual({ children: [{ kind: "deck", deck }], readOnly: false });
    expect(deps.deckRepository.readDeckTree).toHaveBeenCalledWith(instance.url);

    const group = useCases.newDeckGroup(instance.url, { sv: " Språk " });
    expect(group).toEqual({ url: `${instance.url}catalog.ttl#group-0f3a`, title: { sv: "Språk" } });
    expect(() => useCases.newDeckGroup(instance.url, { en: " " })).toThrow("A deck group needs a name");

    const combine = { kind: "combine" as const, dragged: deck.url, target: `${deck.url}-2`, group };
    await expect(useCases.editDeckTree(instance.url, combine)).resolves.toEqual({ children: [{ kind: "deck", deck }], readOnly: false });
    expect(deps.deckRepository.editDeckTree).toHaveBeenLastCalledWith(instance.url, combine);
    await useCases.editDeckTree(instance.url, { kind: "rename", group: group.url, title: { en: " Languages ", sv: "" } });
    expect(deps.deckRepository.editDeckTree).toHaveBeenLastCalledWith(instance.url, {
      kind: "rename",
      group: group.url,
      title: { en: "Languages" },
    });
    await expect(useCases.editDeckTree(instance.url, { kind: "rename", group: group.url, title: {} })).rejects.toThrow(
      "A deck group needs a name",
    );
    expect(deps.deckRepository.editDeckTree).toHaveBeenCalledTimes(2);
  });

  it("deck use cases delegate to the deck repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await expect(useCases.listDecks(instance.url)).resolves.toEqual([deck]);
    expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(instance.url);

    await useCases.createDeck(instance.url, { en: " Kanji N5 " });
    expect(deps.deckRepository.createDeck).toHaveBeenCalledWith(instance.url, { en: "Kanji N5" });
    // A name in the language the user stated, and only in it: no English stands in for it.
    await useCases.createDeck(instance.url, { sv: "Huvudstäder", en: " " });
    expect(deps.deckRepository.createDeck).toHaveBeenLastCalledWith(instance.url, { sv: "Huvudstäder" });
    await expect(useCases.createDeck(instance.url, { sv: " " })).rejects.toThrow("A deck needs a name");
    await expect(useCases.createDeck(instance.url, { "": "Kanji" })).rejects.toThrow("cannot be untagged");
    // Tags as the pod reads them: lower case.
    await useCases.createDeck(instance.url, { "pt-BR": "Capitais" });
    expect(deps.deckRepository.createDeck).toHaveBeenLastCalledWith(instance.url, { "pt-br": "Capitais" });

    // The name in every language it is to have: one left out is removed.
    await useCases.renameDeck(deck, { ja: " 漢字 N4 ", en: "Kanji N4" });
    expect(deps.deckRepository.renameDeck).toHaveBeenCalledWith(deck, { ja: "漢字 N4", en: "Kanji N4" });
    await expect(useCases.renameDeck(deck, {})).rejects.toThrow("A deck needs a name");

    await expect(
      useCases.setDeckDirection(deck, "bidirectional"),
    ).resolves.toEqual({ ...deck, direction: "bidirectional" });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({
      ...deck,
      direction: "bidirectional",
    });

    await useCases.removeDeck(deck);
    expect(deps.deckRepository.removeDeck).toHaveBeenCalledWith(deck);

    await expect(useCases.listCards(deck)).resolves.toEqual([card]);
    expect(deps.deckRepository.listCards).toHaveBeenCalledWith(deck);

    await useCases.addCard(deck, { front: { ja: " 火 " }, back: { en: " fire " } });
    expect(deps.deckRepository.addCard).toHaveBeenCalledWith(deck, {
      front: { ja: "火" },
      back: { en: "fire" },
    });

    // The front's untagged text, untouched, stays as it was saved.
    await useCases.updateCard(deck, card, {
      front: { "": " 水 " },
      back: { en: " water (mizu) " },
      frontImageUrl: " https://img.example/water.png ",
      backImageUrl: "",
    });
    expect(deps.deckRepository.updateCard).toHaveBeenCalledWith(deck, card, {
      front: { "": "水" },
      back: { en: "water (mizu)" },
      frontImageUrl: "https://img.example/water.png",
    });

    await useCases.removeCard(deck, card);
    expect(deps.deckRepository.removeCard).toHaveBeenCalledWith(deck, card);
  });

  it("addCard and updateCard reject incomplete content without writing", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(
      useCases.addCard(deck, { front: {}, back: { en: "fire" } }),
    ).rejects.toThrow("The front needs text or an image.");
    await expect(
      useCases.updateCard(deck, card, {
        front: { en: "f" },
        back: { en: "b" },
        backImageUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow("The back image must be an http(s) URL.");
    // Text in no stated language is never written anew.
    await expect(useCases.addCard(deck, { front: { "": "火" }, back: { en: "fire" } })).rejects.toThrow(
      "Choose the language of the front.",
    );
    await expect(useCases.updateCard(deck, card, { front: { "": "水" }, back: { "": "water!" } })).rejects.toThrow(
      "Choose the language of the back.",
    );
    expect(deps.deckRepository.addCard).not.toHaveBeenCalled();
    expect(deps.deckRepository.updateCard).not.toHaveBeenCalled();
  });

  describe("format migration", () => {
    const other: Deck = {
      ...deck,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      cardsDocumentUrl: `${instance.url}decks/deck-2.ttl`,
    };
    const old = (id: string): Card => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      formatVersion: 1,
    });
    const current = (id: string): Card => ({ ...old(id), formatVersion: CARD_FORMAT_VERSION });

    const oldReview = (cardId: string): ReviewState => ({
      cardId,
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: "2026-09-21T10:00:00.000Z",
      lastReviewedAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    });

    it("planMigration reads every document and writes nothing", async () => {
      const deps = makeDeps();
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({
        name: "Main",
        createdAt: "2026-09-21T10:00:00.000Z",
        formatVersion: 2,
      });
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: DEFAULT_PREFERENCES,
        formatVersion: 1,
      });
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, other]);
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
      vi.mocked(deps.deckRepository.listCards).mockImplementation(async (d) =>
        d === deck ? [old("a"), current("b"), old("c")] : [current("d")],
      );
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(
        async (d) => (d === other ? [oldReview("d")] : []),
      );
      const useCases = createUseCases(deps);

      await expect(useCases.planMigration(instance.url)).resolves.toEqual({
        catalogMissing: true,
        decks: [
          { deck, deckOutdated: false, cardCount: 2, reviewCount: 0 },
          { deck: other, deckOutdated: false, cardCount: 0, reviewCount: 1 },
        ],
        deckCount: 0,
        cardCount: 2,
        reviewCount: 1,
        preferencesOutdated: true,
        instanceOutdated: false,
      });
      expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(instance.url);
      expect(deps.deckRepository.listCards).toHaveBeenCalledTimes(2);
      expect(deps.reviewStateRepository.listReviewStates).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.upgradeCards).not.toHaveBeenCalled();
      expect(deps.deckRepository.saveDeck).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
      expect(deps.instanceRepository.upgradeMeta).not.toHaveBeenCalled();
    });

    const META = `${instance.url}meta.ttl`;
    const PREFERENCES = `${instance.url}preferences.ttl`;
    const CATALOG = `${instance.url}catalog.ttl`;
    const REVIEWS = deck.reviewsDocumentUrl;
    const CARDS = deck.cardsDocumentUrl;
    const oldMeta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 1 };

    /**
     * An instance where everything is outdated — its record, its
     * preferences, a deck's cards and review states, another deck's entry —
     * each document's upgrade noted in `written`, in order.
     */
    function outdated() {
      const deps = makeDeps();
      const oldEntry: Deck = { ...other, reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`, formatVersion: 1 };
      const written: string[] = [];
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue(oldMeta);
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: { ...DEFAULT_PREFERENCES, newCardsPerDay: 7 },
        formatVersion: 1,
      });
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, oldEntry]);
      vi.mocked(deps.deckRepository.listCards).mockImplementation(async (d) =>
        d.cardsDocumentUrl.endsWith("deck-2.ttl") ? [current("d")] : [old("a"), current("b")],
      );
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (d) =>
        d.reviewsDocumentUrl.endsWith("reviews/deck-1.ttl") ? [oldReview("a"), { ...oldReview("b"), formatVersion: 2 }] : [],
      );
      vi.mocked(deps.instanceRepository.upgradeMeta).mockImplementation(async (url) => (written.push(`${url}meta.ttl`), true));
      vi.mocked(deps.preferencesRepository.upgradePreferences).mockImplementation(async (url) => (written.push(`${url}preferences.ttl`), true));
      vi.mocked(deps.deckRepository.upgradeCards).mockImplementation(async (d) => (written.push(d.cardsDocumentUrl), true));
      vi.mocked(deps.reviewStateRepository.upgradeReviewStates).mockImplementation(async (d) => (written.push(d.reviewsDocumentUrl), true));
      vi.mocked(deps.deckRepository.upgradeDecks).mockImplementation(async (url) => (written.push(`${url}catalog.ttl`), true));
      return { deps, oldEntry, written };
    }

    const UPDATED = [
      { url: META, holds: "instance" },
      { url: PREFERENCES, holds: "preferences" },
      { url: CARDS, holds: "cards", deck: deck.title },
      { url: REVIEWS, holds: "reviews", deck: deck.title },
      { url: CATALOG, holds: "catalog" },
    ];

    it("updateInstance brings each outdated document up to date on its own, one after another, then adds the missing registrations", async () => {
      const { deps, written } = outdated();
      const progress: string[] = [];
      const outcome = await createUseCases(deps).updateInstance(session, instance, (p) =>
        progress.push(`${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`),
      );
      expect(outcome).toEqual({ updated: UPDATED, failed: [] });
      // Each document once, in this order: the record, the preferences, each deck's cards and review states, the catalogue last.
      expect(written).toEqual(UPDATED.map((document) => document.url));
      expect(deps.deckRepository.upgradeCards).toHaveBeenCalledExactlyOnceWith(deck);
      expect(deps.reviewStateRepository.upgradeReviewStates).toHaveBeenCalledExactlyOnceWith(deck);
      // A catalogue there is not written anew: only the outdated entries are.
      expect(deps.deckRepository.upgradeDecks).toHaveBeenCalledExactlyOnceWith(instance.url, null);
      // Nothing but the documents' own conditional writes: no copy, no check of a copy, no hold of the instance.
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      expect(deps.instanceCopier.copyResource).not.toHaveBeenCalled();
      expect(deps.shapeValidator.validateDocument).not.toHaveBeenCalled();
      expect(deps.updateJournal.begin).not.toHaveBeenCalled();
      // Once updated, the registrations of its data that are missing are added.
      expect(deps.instanceRepository.registerDataClasses).toHaveBeenCalledExactlyOnceWith({
        webId: session.webId,
        instanceUrl: instance.url,
        title: instance.name,
      });
      expect(progress).toEqual([
        "read 0/3",
        "write 1/3 (0 of 5)",
        ...[1, 2, 3, 4].map((n) => `write 1/3 (${n} of 5)`),
        "register 2/3",
        "register 3/3",
      ]);
    });

    it("updateInstance goes on past a document it cannot update, naming it with why, and adds no registration until all are", async () => {
      const { deps, written } = outdated();
      const refused = new AppError("changedElsewhere", { url: CARDS });
      const offline = new TypeError("Failed to fetch");
      vi.mocked(deps.deckRepository.upgradeCards).mockRejectedValue(refused);
      vi.mocked(deps.preferencesRepository.upgradePreferences).mockRejectedValue(offline);
      const outcome = await createUseCases(deps).updateInstance(session, instance);
      expect(outcome).toEqual({
        updated: [UPDATED[0], UPDATED[3], UPDATED[4]],
        failed: [
          { ...UPDATED[1], error: offline },
          { ...UPDATED[2], error: refused },
        ],
      });
      // Nothing is put back: each document written stays written, each failed one as it was.
      expect(written).toEqual([META, REVIEWS, CATALOG]);
      expect(deps.instanceRepository.registerDataClasses).not.toHaveBeenCalled();
    });

    it("updateInstance runs again on what is still outdated, as it finds it then, and finishes", async () => {
      const { deps, oldEntry } = outdated();
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({ ...oldMeta, formatVersion: 2 });
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({ preferences: DEFAULT_PREFERENCES, formatVersion: 4 });
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, { ...oldEntry, formatVersion: DECK_FORMAT_VERSION }]);
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([]);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({ updated: [UPDATED[2]], failed: [] });
      expect(deps.instanceRepository.upgradeMeta).not.toHaveBeenCalled();
      expect(deps.deckRepository.upgradeDecks).not.toHaveBeenCalled();
      expect(deps.instanceRepository.registerDataClasses).toHaveBeenCalledOnce();
    });

    it("updateInstance counts a document brought up to date meanwhile, elsewhere, as neither updated nor failed", async () => {
      const { deps } = outdated();
      vi.mocked(deps.deckRepository.upgradeCards).mockResolvedValue(false);
      vi.mocked(deps.instanceRepository.upgradeMeta).mockResolvedValue(false);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({
        updated: [UPDATED[1], UPDATED[3], UPDATED[4]],
        failed: [],
      });
      // With nothing outdated left at all, it writes nothing, and adds the missing registrations.
      const done = makeDeps();
      vi.mocked(done.deckRepository.listCards).mockResolvedValue([current("a")]);
      const progress: string[] = [];
      expect(await createUseCases(done).updateInstance(session, instance, (p) => progress.push(`${p.step} ${p.part === undefined ? "" : "counted"}`))).toEqual({
        updated: [],
        failed: [],
      });
      expect(done.deckRepository.upgradeCards).not.toHaveBeenCalled();
      expect(done.instanceRepository.registerDataClasses).toHaveBeenCalledOnce();
      expect(progress).toEqual(["read ", "write ", "register ", "register "]);
    });

    it("updateInstance writes a document two decks share as one, each deck's part in turn, failed when either part fails", async () => {
      const deps = makeDeps();
      const twin: Deck = { ...other, cardsDocumentUrl: CARDS, reviewsDocumentUrl: REVIEWS };
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, twin]);
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([old("a")]);
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([oldReview("a")]);
      // The first deck's part written, the second finds nothing left to write.
      vi.mocked(deps.deckRepository.upgradeCards).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      vi.mocked(deps.reviewStateRepository.upgradeReviewStates).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({ updated: [UPDATED[2], UPDATED[3]], failed: [] });
      expect(vi.mocked(deps.deckRepository.upgradeCards).mock.calls).toEqual([[deck], [twin]]);
      expect(vi.mocked(deps.reviewStateRepository.upgradeReviewStates).mock.calls).toEqual([[deck], [twin]]);

      // The second deck's part refused: the document is named, what the first part wrote stays.
      const refused = makeDeps();
      vi.mocked(refused.deckRepository.listDecks).mockResolvedValue([deck, twin]);
      vi.mocked(refused.deckRepository.listCards).mockResolvedValue([old("a")]);
      const error = new AppError("changedElsewhere", { url: CARDS });
      vi.mocked(refused.deckRepository.upgradeCards).mockResolvedValueOnce(true).mockRejectedValueOnce(error);
      expect(await createUseCases(refused).updateInstance(session, instance)).toEqual({ updated: [], failed: [{ ...UPDATED[2], error }] });
    });

    it("updateInstance gives an instance without a catalogue one, named as its record names it, published by the owner", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({ ...oldMeta, formatVersion: 2 });
      vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
        url: document.url,
        subjects: [
          {
            url: session.webId,
            properties: [{ predicate: "http://xmlns.com/foaf/0.1/name", values: [{ type: "literal", value: "Alice" }] }],
          },
        ],
      } as WebIdDocument);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({ updated: [UPDATED[4]], failed: [] });
      expect(deps.deckRepository.upgradeDecks).toHaveBeenCalledExactlyOnceWith(instance.url, {
        title: "Main",
        description: "Flashcard decks of the Solid Memo instance Main.",
        publisher: { webId: session.webId, name: "Alice" },
      });

      const anonymous = makeDeps();
      vi.mocked(anonymous.deckRepository.readCatalog).mockResolvedValue(null);
      vi.mocked(anonymous.deckRepository.listCards).mockResolvedValue([]);
      vi.mocked(anonymous.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(new Error("offline"));
      await createUseCases(anonymous).updateInstance(session, instance);
      expect(anonymous.deckRepository.upgradeDecks).toHaveBeenLastCalledWith(instance.url, {
        title: instance.url,
        description: `Flashcard decks of the Solid Memo instance ${instance.url}.`,
        publisher: { webId: session.webId, name: session.webId },
      });
    });

    it("updateInstance reads afresh, and throws, writing nothing, when what is outdated cannot be read", async () => {
      const { deps } = outdated();
      vi.mocked(deps.deckRepository.readCatalog).mockRejectedValue(new Error("503"));
      await expect(createUseCases(deps).updateInstance(session, instance)).rejects.toThrow("503");
      expect(deps.instanceRepository.upgradeMeta).not.toHaveBeenCalled();
      expect(deps.deckRepository.upgradeCards).not.toHaveBeenCalled();
    });

    it("updateInstance is done even when the registrations of the instance's data cannot be added", async () => {
      const { deps } = outdated();
      vi.mocked(deps.instanceRepository.registerDataClasses).mockRejectedValue(new Error("index refused"));
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({ updated: UPDATED, failed: [] });
    });
  });

  it("planRepair plans from a report, and applyRepairs hands the repairs to the repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    expect(useCases.planRepair({ instanceUrl: instance.url, documents: [], violationCount: 0, conforms: true })).toEqual({
      repairs: [],
      unrepairable: [],
    });
    const repairs = [{ kind: "describe-deck" as const, documentUrl: "d", subjectUrl: "d#x", version: 3 }];
    await useCases.applyRepairs(repairs);
    expect(deps.repairRepository.applyRepairs).toHaveBeenCalledWith(repairs);
  });

  it("validateInstance checks every document of the instance", async () => {
    const deps = makeDeps();
    vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
      url.endsWith("catalog.ttl")
        ? {
            url,
            status: "checked",
            subjects: [
              {
                url: `${url}#deck-1`,
                status: "checked",
                shape: "deck",
                version: 2,
                violations: [{ message: { en: "no title" }, severity: "violation", constraint: "MinCount" }],
              },
            ],
          }
        : { url, status: "missing", subjects: [] },
    );
    const report = await createUseCases(deps).validateInstance(instance.url);
    expect(report).toMatchObject({ instanceUrl: instance.url, violationCount: 1, conforms: false });
    expect(report.documents.map((d) => d.url)).toEqual([
      `${instance.url}meta.ttl`,
      `${instance.url}preferences.ttl`,
      `${instance.url}catalog.ttl`,
      deck.cardsDocumentUrl,
      deck.reviewsDocumentUrl,
    ]);
  });

  it("listLibraryDecks delegates to the deck library", async () => {
    const deps = makeDeps();
    await expect(createUseCases(deps).listLibraryDecks()).resolves.toEqual([
      libraryDeck,
    ]);
  });

  it("listLibraryCards fetches the deck and returns its cards", async () => {
    const deps = makeDeps();
    await expect(
      createUseCases(deps).listLibraryCards(libraryDeck),
    ).resolves.toEqual(libraryContent.cards);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(
      libraryDeck.url,
    );
    expect(deps.deckRepository.importDeck).not.toHaveBeenCalled();
  });

  it("planLibraryUpgrade compares the release a copy came from with the deck's current one, and writes nothing", async () => {
    const deps = makeDeps();
    const copy: Deck = { ...deck, sourceUrl: libraryDeck.url };
    const current: LibraryDeck = { ...libraryDeck, url: "https://solid-memo.com/decks/capitals/v2.ttl", version: "2" };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      { ...libraryDeck, seriesUrl: "https://solid-memo.com/decks/index.ttl#rivers", url: "https://solid-memo.com/decks/rivers/v1.ttl" },
      current,
    ]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === current.url
        ? { ...libraryContent, url, version: "2", cards: [...libraryContent.cards, { id: "norway", front: { "": "Norway" }, back: { "": "Oslo" }, formatVersion: 1 }] }
        : libraryContent,
    );
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    await expect(createUseCases(deps).planLibraryUpgrade(copy)).resolves.toMatchObject({
      fromVersion: "1",
      toVersion: "2",
      add: [{ id: "norway" }],
    });
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(copy.sourceUrl);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(current.url);
    expect(deps.deckRepository.saveDeck).not.toHaveBeenCalled();
  });

  it("planLibraryUpgrade plans a copy more than one release behind with the releases in between, whose cards are the library's", async () => {
    const deps = makeDeps();
    const LIB = "https://solid-memo.com/decks/capitals/";
    const backs = ["Stockholm?", "Stockholm", "Stockholm, Sweden"];
    const releases = backs.map((_, index) => ({ url: `${LIB}v${index + 1}.ttl`, version: String(index + 1) }));
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([{ ...libraryDeck, url: releases[2]!.url, version: "3", releases }]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => {
      const index = releases.findIndex((release) => release.url === url);
      return { ...libraryContent, url, version: String(index + 1), cards: [{ ...libraryContent.cards[0]!, back: { "": backs[index]! } }] };
    });
    // Copied from release 1; an upgrade to release 2, cut off before it moved the deck's entry, wrote its card.
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
      { ...libraryContent.cards[0]!, back: { "": "Stockholm" }, url: `${deck.cardsDocumentUrl}#sweden`, createdAt: "", formatVersion: 4 },
    ]);
    await expect(createUseCases(deps).planLibraryUpgrade({ ...deck, sourceUrl: releases[0]!.url })).resolves.toMatchObject({
      toVersion: "3",
      change: [{ id: "sweden", back: { "": "Stockholm, Sweden" } }],
      kept: [],
    });
    expect(vi.mocked(deps.deckLibrary.fetchLibraryDeck).mock.calls.map(([url]) => url).sort()).toEqual(releases.map((release) => release.url));
  });

  it("planLibraryUpgrade offers nothing for a home-made deck, or one whose deck the library no longer has", async () => {
    const deps = makeDeps();
    await expect(createUseCases(deps).planLibraryUpgrade(deck)).resolves.toBeNull();
    const stray: Deck = { ...deck, sourceUrl: "https://solid-memo.com/decks/gone/v1.ttl" };
    await expect(createUseCases(deps).planLibraryUpgrade(stray)).resolves.toBeNull();
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
  });

  it("planLibraryUpgrade offers nothing for a copy of the current release, or of none older, reading neither a release nor the copy's cards", async () => {
    const deps = makeDeps();
    const current: Deck = { ...deck, sourceUrl: libraryDeck.url };
    await expect(createUseCases(deps).planLibraryUpgrade(current)).resolves.toBeNull();
    // The index says the copy's release is v2 while its current one is still v1.
    const v2 = "https://solid-memo.com/decks/capitals/v2.ttl";
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      { ...libraryDeck, releases: [...libraryDeck.releases, { url: v2, version: "2" }] },
    ]);
    await expect(createUseCases(deps).planLibraryUpgrade({ ...deck, sourceUrl: v2 })).resolves.toBeNull();
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    expect(deps.deckRepository.listCards).not.toHaveBeenCalled();
  });

  it("addReleaseLanguages gives a copy the languages its release adds, and saves it; nothing for a home-made deck or nothing to add", async () => {
    const deps = makeDeps();
    const copy: Deck = { ...deck, title: { en: "Capitals" }, sourceUrl: libraryDeck.url };
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockResolvedValueOnce({ ...libraryContent, title: { en: "Capitals", sv: "Huvudstäder" } });
    await expect(createUseCases(deps).addReleaseLanguages(copy)).resolves.toMatchObject({ title: { en: "Capitals", sv: "Huvudstäder" } });
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledOnce();
    await expect(createUseCases(deps).addReleaseLanguages(copy)).resolves.toBeNull();
    await expect(createUseCases(deps).addReleaseLanguages({ ...deck, sourceUrl: undefined })).resolves.toBeNull();
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledOnce();
  });

  it("deckRelease reads the release a copy came from; none for a home-made deck", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.deckRelease({ ...deck, sourceUrl: libraryDeck.url })).resolves.toEqual(libraryContent);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    await expect(useCases.deckRelease({ ...deck, sourceUrl: undefined })).resolves.toBeNull();
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledOnce();
  });

  it("importLibraryDeck fetches the deck's content and imports it", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(
      useCases.importLibraryDeck(instance.url, libraryDeck),
    ).resolves.toEqual(deck);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(
      libraryDeck.url,
    );
    expect(deps.deckRepository.importDeck).toHaveBeenCalledWith(
      instance.url,
      libraryContent,
    );
  });

  it("getPreferences overlays defaults when nothing is stored", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.getPreferences(instance.url)).resolves.toEqual({
      newCardsPerDay: 5,
      maxReviewsPerDay: 200,
      dayBoundaryHour: 4,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system" as const,
    });
  });

  it("getPreferences shares one read between concurrent callers, but never caches", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await Promise.all([
      useCases.getPreferences(instance.url),
      useCases.getPreferences(instance.url),
      useCases.getStudyQueue(instance.url, deck, new Date()),
    ]);
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledOnce();

    await useCases.getPreferences(instance.url);
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledTimes(2);
  });

  it("getPreferences does not share reads across instances, nor keep a failed one", async () => {
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockRejectedValueOnce(
      new Error("preferences unreachable"),
    );
    const useCases = createUseCases(deps);

    await expect(useCases.getPreferences(instance.url)).rejects.toThrow(
      "preferences unreachable",
    );
    await expect(
      useCases.getPreferences("https://alice.example/solid-memo/other/"),
    ).resolves.toEqual(expect.objectContaining({ dayBoundaryHour: 4 }));
    await expect(useCases.getPreferences(instance.url)).resolves.toBeDefined();
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledTimes(3);
  });

  it("getPreferences returns stored preferences unchanged", async () => {
    const deps = makeDeps();
    const stored = {
      newCardsPerDay: 5,
      maxReviewsPerDay: 50,
      dayBoundaryHour: 0,
      answerScale: "minimal" as const,
      developerMode: true,
      invalidDataPolicy: "block-instance" as const,
      theme: "system" as const,
    };
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: stored,
      formatVersion: 2,
    });
    const useCases = createUseCases(deps);
    await expect(useCases.getPreferences(instance.url)).resolves.toEqual(
      stored,
    );
  });

  it("savePreferences delegates to the repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const preferences = {
      newCardsPerDay: 5,
      maxReviewsPerDay: 50,
      dayBoundaryHour: 0,
      answerScale: "minimal" as const,
      developerMode: true,
      invalidDataPolicy: "block-instance" as const,
      theme: "system" as const,
    };
    await useCases.savePreferences(instance.url, preferences);
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(
      instance.url,
      preferences,
    );
  });

  it("getStudyQueue draws new cards with the injected random source", async () => {
    const deps = makeDeps();
    const newCards = ["n1", "n2", "n3"].map((id) => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
    }));
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue(newCards);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([]);
    const useCases = createUseCases({ ...deps, random: () => 0 });

    const queue = await useCases.getStudyQueue(
      instance.url,
      deck,
      new Date(2026, 8, 21, 12, 0),
    );
    expect(queue.newPrompts.map((p) => p.card.id)).toEqual(["n2", "n3", "n1"]);
  });

  it("getStudyQueue composes cards, review states and preferences", async () => {
    const deps = makeDeps();
    const dueCard = { ...card, id: "card-due", url: `${deck.cardsDocumentUrl}#card-due` };
    const newCard = { ...card, id: "card-new", url: `${deck.cardsDocumentUrl}#card-new` };
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
      dueCard,
      newCard,
    ]);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([
      {
        cardId: "card-due",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-20",
        firstReviewedAt: "2026-09-19T10:00:00.000Z",
        lastReviewedAt: "2026-09-19T10:00:00.000Z",
        formatVersion: 2,
      },
    ]);
    const useCases = createUseCases(deps);

    const queue = await useCases.getStudyQueue(
      instance.url,
      deck,
      new Date(2026, 8, 21, 12, 0),
    );
    expect(queue.due.map((p) => p.card.id)).toEqual(["card-due"]);
    expect(queue.newPrompts.map((p) => p.card.id)).toEqual(["card-new"]);

    const capped = await useCases.getStudyQueue(
      instance.url,
      { ...deck, newCardsPerDay: 0, maxReviewsPerDay: 0 },
      new Date(2026, 8, 21, 12, 0),
    );
    expect(capped.due).toEqual([]);
    expect(capped.newPrompts).toEqual([]);
  });

  it("recordReview starts fresh for a never-reviewed card", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const now = new Date(2026, 8, 21, 12, 0);

    const state = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      5,
      now,
    );

    expect(state).toEqual({
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.6,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: now.toISOString(),
      lastReviewedAt: now.toISOString(),
      formatVersion: 2,
    });
    expect(deps.reviewStateRepository.saveReviewState).toHaveBeenCalledWith(
      deck,
      state,
    );
  });

  it("recordReview transitions an existing state and keeps firstReviewedAt", async () => {
    const deps = makeDeps();
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-10T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    });
    const useCases = createUseCases(deps);
    const now = new Date(2026, 8, 21, 12, 0);

    const state = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      now,
    );

    expect(state.easeFactor).toBeCloseTo(2.5);
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBe(15);
    expect(state.due).toBe("2026-10-06");
    expect(state.firstReviewedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(state.lastReviewedAt).toBe(now.toISOString());
    expect(state.previous).toEqual({
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
    });
  });

  it("recordReview stores no snapshot for a never-reviewed card", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const state = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      new Date(2026, 8, 21, 12, 0),
    );
    expect(state).not.toHaveProperty("previous");
  });

  describe("resetStudyDay", () => {
    const now = new Date(2026, 8, 21, 12, 0);
    const earlier = new Date(2026, 8, 15, 12, 0).toISOString();
    const morning = {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      lastReviewedAt: earlier,
    };

    it("restores reviewed cards and forgets cards introduced today, in one write", async () => {
      const deps = makeDeps();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([
        {
          cardId: "reviewed",
          direction: "front-to-back",
          easeFactor: 2.6,
          intervalDays: 15,
          repetitions: 3,
          due: "2026-10-06",
          firstReviewedAt: earlier,
          lastReviewedAt: now.toISOString(),
          formatVersion: 2,
          previous: morning,
        },
        {
          cardId: "introduced",
          direction: "front-to-back",
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-09-22",
          firstReviewedAt: now.toISOString(),
          lastReviewedAt: now.toISOString(),
          formatVersion: 2,
        },
        {
          cardId: "untouched",
          direction: "front-to-back",
          easeFactor: 2.5,
          intervalDays: 6,
          repetitions: 2,
          due: "2026-09-30",
          firstReviewedAt: earlier,
          lastReviewedAt: earlier,
          formatVersion: 2,
        },
      ]);
      const useCases = createUseCases(deps);

      await expect(
        useCases.resetStudyDay(instance.url, deck, now),
      ).resolves.toBe(2);

      expect(
        deps.reviewStateRepository.applyReviewChanges,
      ).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [{ cardId: "reviewed", direction: "front-to-back", firstReviewedAt: earlier, formatVersion: 2, ...morning }],
        remove: [{ cardId: "introduced", direction: "front-to-back" }],
      });
    });

    it("writes nothing when nothing was studied today", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(
        useCases.resetStudyDay(instance.url, deck, now),
      ).resolves.toBe(0);
      expect(
        deps.reviewStateRepository.applyReviewChanges,
      ).not.toHaveBeenCalled();
    });

    it("uses the instance's day boundary", async () => {
      const deps = makeDeps();
      const lateNight = new Date(2026, 8, 21, 3, 0).toISOString();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([
        {
          cardId: "night-owl",
          direction: "front-to-back",
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-09-22",
          firstReviewedAt: lateNight,
          lastReviewedAt: lateNight,
          formatVersion: 2,
        },
      ]);
      const useCases = createUseCases(deps);
      await expect(
        useCases.resetStudyDay(instance.url, deck, now),
      ).resolves.toBe(0);

      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: {
          newCardsPerDay: 20,
          maxReviewsPerDay: 200,
          dayBoundaryHour: 0,
          answerScale: "sm2",
          developerMode: false,
          invalidDataPolicy: "block-instance" as const,
          theme: "system" as const,
        },
        formatVersion: 2,
      });
      await expect(
        useCases.resetStudyDay(instance.url, deck, now),
      ).resolves.toBe(1);
    });
  });

  it("recordReview resets on a lapse and reschedules for tomorrow", async () => {
    const deps = makeDeps();
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.2,
      intervalDays: 30,
      repetitions: 5,
      due: "2026-09-21",
      firstReviewedAt: "2026-08-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    });
    const useCases = createUseCases(deps);

    const state = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      0,
      new Date(2026, 8, 21, 12, 0),
    );

    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(1);
    expect(state.easeFactor).toBeCloseTo(2.2);
    expect(state.due).toBe("2026-09-22");
  });
});

describe("the instance digest", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");
  const RULES = "rules-1";
  const review: ReviewState = {
    cardId: "card-1",
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-09-27",
    firstReviewedAt: "2026-09-26T10:00:00.000Z",
    lastReviewedAt: "2026-09-26T10:00:00.000Z",
    formatVersion: 2,
  };
  const current: Card = { ...card, formatVersion: CARD_FORMAT_VERSION };
  const card2: Card = { ...current, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2` };

  /** The deps, with documents at versions "c1" (cards) and "r1" (reviews) and a digest kept in memory. */
  function setup(initial: InstanceDigest | null = null) {
    const deps = makeDeps();
    let stored = initial;
    const digestRepository: DigestRepository = {
      readDigest: vi.fn(async () => stored),
      updateDigest: vi.fn(async (_instanceUrl, change) => {
        stored = change(stored);
      }),
    };
    const at = (version: string, value: unknown) =>
      vi.fn(async (_target: unknown, since: string | undefined) =>
        since === version ? { unchanged: true as const } : { unchanged: false as const, value, version },
      );
    deps.deckRepository.readCardsSince = at("c1", [current, card2]) as DeckRepository["readCardsSince"];
    deps.reviewStateRepository.readReviewStatesSince = at("r1", [review]) as ReviewStateRepository["readReviewStatesSince"];
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string, since: string | undefined) =>
      since === `v-${url}` ? { unchanged: true as const } : { unchanged: false as const, value: { url, status: "checked" as const, subjects: [] }, version: `v-${url}` },
    );
    const useCases = createUseCases({ ...deps, digestRepository, ruleset: RULES });
    return { deps, useCases, digestRepository, stored: () => stored };
  }

  /** What the digest learns from the documents above. */
  async function learned() {
    const { useCases, stored, digestRepository } = setup();
    await useCases.getStudyCounts(instance.url, deck, now);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalled());
    return stored()!;
  }

  it("counts today's study from the documents the first time, and keeps the deck's schedule", async () => {
    const { useCases, stored, digestRepository } = setup();
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({ dueCount: 1, newCount: 1 });
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.schedules[deck.url]).toMatchObject({ cardsVersion: "c1", reviewsVersion: "r1" });
    expect(stored()!.receipts[deck.cardsDocumentUrl]).toEqual({ document: deck.cardsDocumentUrl, version: "c1", latestFormat: true });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({ document: deck.reviewsDocumentUrl, version: "r1", latestFormat: true });
  });

  it("counts from the schedule while neither document changed", async () => {
    const { deps, useCases } = setup(await learned());
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({ dueCount: 1, newCount: 1 });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledExactlyOnceWith(deck, "r1");
  });

  it("counts from the documents again when one changed, or the deck is studied another way", async () => {
    const digest = await learned();
    const changed = setup({ ...digest, schedules: { [deck.url]: { ...digest.schedules[deck.url]!, cardsVersion: "c0" } } });
    await expect(changed.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({ dueCount: 1, newCount: 1 });
    expect(changed.deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c0");

    const otherWay = setup(digest);
    await expect(otherWay.useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 3,
    });
    expect(otherWay.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });

  it("notes no format receipt for a document holding something outdated, and nothing of a document without a version", async () => {
    const outdated = setup();
    outdated.deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: false as const, value: [{ ...card, formatVersion: 0 }], version: "c1" }));
    outdated.deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [{ ...review, formatVersion: 1 }],
      version: "r1",
    }));
    await outdated.useCases.getStudyCounts(instance.url, deck, now);
    await vi.waitFor(() => expect(outdated.digestRepository.updateDigest).toHaveBeenCalled());
    expect(outdated.stored()!.receipts).toEqual({});

    const unversioned = setup();
    unversioned.deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: false as const, value: [card], version: null }));
    await unversioned.useCases.getStudyCounts(instance.url, deck, now);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unversioned.digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("goes on without a digest it cannot read or write", async () => {
    const { deps, useCases, digestRepository } = setup();
    vi.mocked(digestRepository.readDigest).mockRejectedValue(new Error("offline"));
    vi.mocked(digestRepository.updateDigest).mockRejectedValue(new Error("offline"));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({ dueCount: 1, newCount: 1 });
    await expect(createUseCases(deps).getStudyCounts(instance.url, deck, now)).resolves.toEqual({ dueCount: 1, newCount: 1 });
  });

  it("refuses a read without a version that says unchanged", async () => {
    const { deps, useCases } = setup(await learned());
    deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: true as const }));
    await expect(useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now)).rejects.toThrow("came back unchanged");
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("keeps the schedule and checks the reviews document when a study session ends", async () => {
    const { useCases, stored, digestRepository } = setup();
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2));
    expect(stored()!.schedules[deck.url]).toMatchObject({ cardsVersion: "c1", reviewsVersion: "r1" });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: `v-${deck.reviewsDocumentUrl}`,
      conformedTo: RULES,
    });
  });

  it("keeps no receipt of a reviews document that does not conform, or has no version", async () => {
    const { deps, useCases, stored, digestRepository } = setup();
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "checked" as const, subjects: [{ url: `${url}#x`, status: "checked" as const, shape: "reviewState" as const, version: 2, violations: [{ message: { en: "no" }, severity: "violation" as const, constraint: "MinCount" }] }] },
      version: "r1",
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({ document: deck.reviewsDocumentUrl, version: "r1", latestFormat: true });
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "checked" as const, subjects: [] },
      version: null,
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(stored()!.receipts[deck.reviewsDocumentUrl]!.conformedTo).toBeUndefined();
  });

  it("checks only documents changed since they conformed, by these rules", async () => {
    const urls = [`${instance.url}meta.ttl`, `${instance.url}preferences.ttl`, `${instance.url}catalog.ttl`, deck.cardsDocumentUrl, deck.reviewsDocumentUrl];
    const first = setup();
    await expect(first.useCases.checkInstance(instance.url)).resolves.toMatchObject({ conforms: true });
    await vi.waitFor(() => expect(Object.keys(first.stored()!.receipts)).toHaveLength(urls.length));
    expect(first.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(urls[0], undefined);

    const digest = first.stored()!;
    const again = setup({ ...digest, receipts: { ...digest.receipts, [urls[0]!]: { ...digest.receipts[urls[0]!]!, conformedTo: "older-rules" } } });
    const report = await again.useCases.checkInstance(instance.url);
    expect(report.documents.map((d) => d.subjects.length)).toEqual([0, 0, 0, 0, 0]);
    expect(again.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(urls[0], undefined);
    expect(again.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(urls[1], `v-${urls[1]}`);
  });

  it("keeps no receipt of a document that does not conform or has no version", async () => {
    const { deps, useCases, digestRepository } = setup();
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "missing" as const, subjects: [] },
      version: null,
    }));
    await useCases.checkInstance(instance.url);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("plans the format update without reading again documents with nothing outdated, and writes no digest", async () => {
    const { deps, useCases, digestRepository } = setup(await learned());
    const plan = await useCases.planMigration(instance.url);
    expect(plan.cardCount).toBe(0);
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(deck, "r1");
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
});

describe("the answer log", () => {
  /** An answer log kept in memory, by study month. */
  function memoryLog() {
    const byMonth = new Map<string, Answer[]>();
    const log = {
      append: vi.fn(async (_instanceUrl: string, answer: Answer) => {
        const month = answer.studyDay.slice(0, 7);
        byMonth.set(month, [...(byMonth.get(month) ?? []), answer]);
      }),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => [...byMonth.keys()].sort()),
      readMonth: vi.fn(async (_instanceUrl: string, month: string) => byMonth.get(month) ?? []),
      removeDay: vi.fn(async (_instanceUrl: string, deckUrl: string, studyDay: string) => {
        for (const [month, answers] of byMonth) {
          byMonth.set(month, answers.filter((a) => a.deckUrl !== deckUrl || a.studyDay !== studyDay));
        }
      }),
    } satisfies AnswerLog;
    return { log, byMonth };
  }
  const noon = new Date(2026, 8, 21, 12, 0);
  const setup = () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    let id = 0;
    const useCases = createUseCases({ ...deps, answerLog: log, newId: () => `id${++id}-0000-0000` });
    return { deps, log, byMonth, useCases };
  };

  it("keeps every answer with what the statistics need, the prior interval from the second on", async () => {
    const { deps, byMonth, useCases } = setup();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
      cardId: card.id, direction: "back-to-front", easeFactor: 2.5, intervalDays: 6, repetitions: 2,
      due: "2026-09-21", firstReviewedAt: "2026-09-01T10:00:00.000Z", lastReviewedAt: "2026-09-15T10:00:00.000Z", formatVersion: 2,
    });
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 1, noon);
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.get("2026-09")).toEqual([
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id1-0000`,
        deckUrl: deck.url, cardUrl: card.url, direction: "front-to-back", grade: 4,
        answeredAt: noon.toISOString(), studyDay: "2026-09-21", nextIntervalDays: 1,
      },
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id2-0000`,
        deckUrl: deck.url, cardUrl: card.url, direction: "back-to-front", grade: 1,
        answeredAt: noon.toISOString(), studyDay: "2026-09-21", priorIntervalDays: 6, nextIntervalDays: 1,
      },
    ]);
  });

  it("keeps an answer it could not add for later, in order, and does not fail the review", async () => {
    const { log, byMonth, useCases } = setup();
    log.append.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("still offline"));
    await expect(useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon)).resolves.toBeDefined();
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.size).toBe(0);
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.get("2026-09")!.map((answer) => [answer.direction, answer.grade])).toEqual([
      ["front-to-back", 4],
      ["back-to-front", 5],
    ]);
  });

  it("forgets a reset day's answers of the deck, those still on their way too", async () => {
    const { deps, log, byMonth, useCases } = setup();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue([
      { cardId: card.id, direction: "front-to-back", easeFactor: 2.6, intervalDays: 1, repetitions: 1, due: "2026-09-22",
        firstReviewedAt: noon.toISOString(), lastReviewedAt: noon.toISOString(), formatVersion: 2 },
    ]);
    await expect(useCases.resetStudyDay(instance.url, deck, noon)).resolves.toBe(1);
    expect(log.removeDay).toHaveBeenCalledWith(instance.url, deck.url, "2026-09-21");
    expect(log.append.mock.invocationCallOrder[0]).toBeLessThan(log.removeDay.mock.invocationCallOrder[0]!);
    expect(byMonth.get("2026-09")).toEqual([]);
  });

  it("computes the statistics of the months asked for, of every deck or of one", async () => {
    const { byMonth, useCases } = setup();
    const answer = (studyDay: string, deckUrl = deck.url): Answer => ({
      id: `answer-${studyDay}`, deckUrl, cardUrl: card.url, direction: "front-to-back", grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`, studyDay, nextIntervalDays: 1,
    });
    byMonth.set("2025-09", [answer("2025-09-30")]);
    byMonth.set("2025-10", [answer("2025-10-01")]);
    byMonth.set("2026-09", [answer("2026-09-20"), answer("2026-09-21", "https://pod.example/other#deck")]);
    const all = await useCases.getStatistics(instance.url, noon);
    expect(all.days.map((day) => day.studyDay)).toEqual(["2025-10-01", "2026-09-20", "2026-09-21"]);
    expect(all.streaks).toEqual({ current: 2, longest: 2 });
    const one = await useCases.getStatistics(instance.url, noon, { months: 1, deckUrl: deck.url });
    expect(one.days.map((day) => day.studyDay)).toEqual(["2026-09-20"]);
  });

  it("is checked in the full check, one document a month, and is empty without a log", async () => {
    const { deps, byMonth, useCases } = setup();
    byMonth.set("2026-09", []);
    await useCases.validateInstance(instance.url);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(`${instance.url}history/2026-09.ttl`);
    const plain = createUseCases(makeDeps());
    await expect(plain.getStatistics(instance.url, noon)).resolves.toMatchObject({ totals: { answers: 0, studyDays: 0, cards: 0 } });
  });
});

describe("library deck upgrade", () => {
  const LIB = "https://solid-memo.com/decks/capitals/";
  const libraryCard = (id: string, back: string): LibraryCard => ({ id, front: { "": id }, back: { "": back }, formatVersion: 4 });
  const reviewOf = (cardId: string): ReviewState => ({
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-09-29",
    firstReviewedAt: "2026-09-28T08:00:00.000Z",
    lastReviewedAt: "2026-09-28T08:00:00.000Z",
    formatVersion: 2,
  });

  /**
   * A pod holding a copy of release 1, with the library at release 2:
   * Sweden fixed, Latvia removed, Norway added, the title given its
   * Swedish. Each document has a version, moved by every write; a write
   * of the cards held to a version (as the upgrade holds it to the read
   * the plan was made from) fails (changedElsewhere) unless the document
   * is still at it, as the repository answers.
   */
  async function world({
    reviews = [reviewOf("sweden"), reviewOf("latvia")],
    removesLatvia = true,
  }: { reviews?: ReviewState[]; removesLatvia?: boolean } = {}) {
    const deps = makeDeps();
    const v1: LibraryDeckContent = {
      ...libraryContent,
      url: `${LIB}v1.ttl`,
      seriesUrl: librarySeriesUrlOf(`${LIB}v1.ttl`),
      cards: [libraryCard("sweden", "Stockholm?"), libraryCard("denmark", "Copenhagen"), libraryCard("latvia", "Riga")],
    };
    const v2: LibraryDeckContent = {
      ...v1,
      url: `${LIB}v2.ttl`,
      version: "2",
      title: { en: "Capitals", sv: "Huvudstäder" },
      cards: [
        libraryCard("sweden", "Stockholm"),
        libraryCard("denmark", "Copenhagen"),
        ...(removesLatvia ? [] : [libraryCard("latvia", "Riga")]),
        libraryCard("norway", "Oslo"),
      ],
    };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      {
        ...libraryDeck,
        url: v2.url,
        seriesUrl: v1.seriesUrl,
        version: "2",
        releases: [
          { url: v1.url, version: "1" },
          { url: v2.url, version: "2" },
        ],
      },
    ]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => (url === v2.url ? v2 : v1));
    const copy: Deck = { ...deck, title: { en: "Capitals" }, sourceUrl: v1.url };
    const toPodCard = (documentUrl: string, { formatVersion: _version, ...content }: LibraryCard | Card): Card => ({
      ...content,
      url: `${documentUrl}#${content.id}`,
      createdAt: "createdAt" in content ? content.createdAt : "2026-09-28T10:00:00.000Z",
      formatVersion: 4,
    });
    const pod = {
      deck: copy as Deck | null,
      cards: new Map<string, Card[]>([[copy.cardsDocumentUrl, v1.cards.map((c) => toPodCard(copy.cardsDocumentUrl, c))]]),
      reviews: new Map<string, ReviewState[]>([[copy.reviewsDocumentUrl, reviews]]),
      writes: new Map<string, number>(),
      /** Every write of a document of the deck, in order. */
      written: [] as string[],
    };
    const versionOf = (url: string) => `v${pod.writes.get(url) ?? 0}`;
    const wrote = (url: string) => {
      pod.writes.set(url, (pod.writes.get(url) ?? 0) + 1);
      pod.written.push(url);
    };
    const repo = deps.deckRepository;
    vi.mocked(repo.readDeck).mockImplementation(async (url) => (pod.deck?.url === url ? pod.deck : null));
    vi.mocked(repo.listDecks).mockImplementation(async () => (pod.deck === null ? [] : [pod.deck]));
    vi.mocked(repo.listCards).mockImplementation(async (d) => pod.cards.get(d.cardsDocumentUrl) ?? []);
    vi.mocked(repo.readCardsSince).mockImplementation(async (d, version) =>
      version === versionOf(d.cardsDocumentUrl)
        ? { unchanged: true }
        : { unchanged: false, value: pod.cards.get(d.cardsDocumentUrl) ?? [], version: versionOf(d.cardsDocumentUrl) },
    );
    vi.mocked(repo.applyCardChanges).mockImplementation(async (d, { save, remove }, options) => {
      const url = d.cardsDocumentUrl;
      if (options?.version !== undefined && options.version !== versionOf(url)) throw new AppError("changedElsewhere", { url });
      const cards = new Map((pod.cards.get(url) ?? []).map((c) => [c.id, c]));
      for (const id of remove) cards.delete(id);
      for (const { retired, ...c } of save) {
        const { retired: _was, ...before } = cards.get(c.id) ?? toPodCard(url, { ...c, formatVersion: 4 });
        cards.set(c.id, { ...before, ...c, url: `${url}#${c.id}`, formatVersion: 4, ...(retired === true ? { retired } : {}) });
      }
      pod.cards.set(url, [...cards.values()]);
      wrote(url);
    });
    vi.mocked(repo.upgradeDeckEntry).mockImplementation(async (current, next) => {
      if (pod.deck === null || !sameDeckState(pod.deck, current)) throw new AppError("deckChangedDuringUpgrade", { url: current.url });
      pod.deck = withDeckChanges(pod.deck, current, next);
      wrote(current.url);
      return pod.deck;
    });
    const reviewRepo = deps.reviewStateRepository;
    vi.mocked(reviewRepo.listReviewStates).mockImplementation(async (d) => pod.reviews.get(d.reviewsDocumentUrl) ?? []);
    vi.mocked(reviewRepo.applyReviewChanges).mockImplementation(async (d, { remove }) => {
      const url = d.reviewsDocumentUrl;
      const dropped = new Set(remove.map((key) => `${key.cardId} ${key.direction}`));
      pod.reviews.set(url, (pod.reviews.get(url) ?? []).filter((s) => !dropped.has(`${s.cardId} ${s.direction}`)));
      wrote(url);
    });
    const useCases = createUseCases(deps);
    const plan = (await useCases.planLibraryUpgrade(copy))!;
    return { deps, pod, copy, plan, useCases, wrote, v2, versionOf };
  }

  const cardsOf = (pod: Awaited<ReturnType<typeof world>>["pod"], url: string) =>
    pod.cards.get(url)!.map((c) => [c.id, c.back[""], c.retired === true]);

  it("writes the deck where it is: its cards first, held to the read the plan was made from, then the removed cards' states, the entry last", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    expect(plan).toMatchObject({ add: [{ id: "norway" }], change: [{ id: "sweden" }], remove: [{ id: "latvia" }] });
    const progress: DeckUpgradeProgress[] = [];

    const outcome = await useCases.applyLibraryUpgrade(copy, plan, (p) => progress.push(p));

    expect(outcome).toEqual({ ok: true, deck: { ...copy, sourceUrl: `${LIB}v2.ttl`, title: { en: "Capitals", sv: "Huvudstäder" } } });
    // Each document written once, where it is, in this order: what the deck is at is said last.
    expect(pod.written).toEqual([copy.cardsDocumentUrl, copy.reviewsDocumentUrl, copy.url]);
    // One PUT of the whole cards document, only while it is still at the version the plan read.
    expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
      copy,
      { save: [libraryCard("norway", "Oslo"), libraryCard("sweden", "Stockholm")], remove: ["latvia"] },
      { whole: true, version: "v0" },
    );
    expect(cardsOf(pod, copy.cardsDocumentUrl)).toEqual([
      ["sweden", "Stockholm", false],
      ["denmark", "Copenhagen", false],
      ["norway", "Oslo", false],
    ]);
    expect(pod.reviews.get(copy.reviewsDocumentUrl)).toEqual([reviewOf("sweden")]);
    expect(deps.deckRepository.upgradeDeckEntry).toHaveBeenCalledWith(copy, expect.objectContaining({ sourceUrl: `${LIB}v2.ttl` }));
    // Nothing kept beside the deck: no copy, no backup, no note in the browser.
    expect(deps.deckRepository.deleteDocument).not.toHaveBeenCalled();
    expect(deps.updateJournal.begin).not.toHaveBeenCalled();
    expect(deps.shapeValidator.validateDocument).not.toHaveBeenCalled();
    expect(progress.map((p) => `${p.step} ${p.done}/${p.total}`)).toEqual(["read 0/4", "cards 1/4", "reviews 2/4", "entry 3/4", "entry 4/4"]);
  });

  it("does not touch the reviews document when no card with review states is removed, nor read it when no card is", async () => {
    const kept = await world({ reviews: [reviewOf("sweden")] });
    await expect(kept.useCases.applyLibraryUpgrade(kept.copy, kept.plan)).resolves.toMatchObject({ ok: true });
    expect(kept.deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();

    const none = await world({ removesLatvia: false });
    await expect(none.useCases.applyLibraryUpgrade(none.copy, none.plan)).resolves.toMatchObject({ ok: true });
    expect(none.deps.reviewStateRepository.listReviewStates).not.toHaveBeenCalled();
  });

  it("writes no cards when none change, the deck's entry alone", async () => {
    const { deps, pod, copy, useCases, v2 } = await world();
    // Release 2 as the copy already has its cards, and only says the deck's name in Swedish too.
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2.url ? { ...v2, cards: pod.cards.get(copy.cardsDocumentUrl)!.map(({ url: _u, createdAt: _c, ...c }) => c) } : { ...v2, url, version: "1", title: { en: "Capitals" } },
    );
    const plan = (await useCases.planLibraryUpgrade(copy))!;
    expect(plan).toMatchObject({ add: [], change: [], remove: [], title: { en: "Capitals", sv: "Huvudstäder" } });
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ ok: true });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    expect(pod.written).toEqual([copy.url]);
  });

  it("refuses, writing nothing, when the deck no longer calls for what the user agreed to, has moved, or is gone", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    pod.cards.get(copy.cardsDocumentUrl)![0] = { ...pod.cards.get(copy.cardsDocumentUrl)![0], back: { "": "Mine" } };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toEqual({
      ok: false,
      step: "read",
      error: expect.objectContaining({ code: "deckChangedSinceOffer" }),
      changed: false,
    });
    pod.deck = { ...copy, cardsDocumentUrl: "elsewhere" };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ error: expect.objectContaining({ code: "deckChangedSinceOffer" }) });
    pod.deck = { ...copy, sourceUrl: undefined };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ error: expect.objectContaining({ code: "deckChangedSinceOffer" }) });
    pod.deck = null;
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ error: expect.objectContaining({ code: "deckGone" }) });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    expect(pod.written).toEqual([]);
  });

  it("fails at reading when a read without a version answers unchanged", async () => {
    const { deps, copy, plan, useCases } = await world();
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({ unchanged: true });
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ ok: false, step: "read", changed: false });
  });

  it("writes no cards over a document changed since the plan read it (412), and nothing after: the deck is as it was", async () => {
    const { deps, pod, copy, plan, useCases, wrote } = await world();
    // Another device edits the cards just after the upgrade read them.
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementationOnce(async (d) => {
      wrote(copy.cardsDocumentUrl);
      return pod.reviews.get(d.reviewsDocumentUrl) ?? [];
    });
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({ ok: false, step: "cards", error: new AppError("changedElsewhere", { url: copy.cardsDocumentUrl }), changed: false });
    expect(cardsOf(pod, copy.cardsDocumentUrl).map(([id]) => id)).toEqual(["sweden", "denmark", "latvia"]);
    expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    expect(deps.deckRepository.upgradeDeckEntry).not.toHaveBeenCalled();
    // A pod that gives no version holds the cards' write to none.
    const unversioned = await world();
    vi.mocked(unversioned.deps.deckRepository.readCardsSince).mockImplementation(async (d) => ({
      unchanged: false,
      value: unversioned.pod.cards.get(d.cardsDocumentUrl) ?? [],
      version: null,
    }));
    await expect(unversioned.useCases.applyLibraryUpgrade(unversioned.copy, unversioned.plan)).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(unversioned.deps.deckRepository.applyCardChanges).mock.calls[0]![2]).toEqual({ whole: true });
  });

  it("stops where a write fails, nothing put back, and offered again it finishes, no card it wrote taken for the user's", async () => {
    const { deps, pod, copy, plan, useCases, v2 } = await world();
    vi.mocked(deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(new AppError("changedElsewhere", { url: copy.url }));
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({ ok: false, step: "entry", error: new AppError("changedElsewhere", { url: copy.url }), changed: true });
    // The entry's write was refused, so it is not read again to tell whether it was made.
    expect(deps.deckRepository.readDeck).toHaveBeenCalledOnce();
    // The deck reads as its documents are: the newer release's cards, still naming the release it came from.
    expect(pod.deck).toEqual(copy);
    expect(cardsOf(pod, copy.cardsDocumentUrl).map(([id]) => id)).toEqual(["sweden", "denmark", "norway"]);
    expect(pod.reviews.get(copy.reviewsDocumentUrl)).toEqual([reviewOf("sweden")]);

    // Offered again: the cards already as the release has them are the release's, not the user's.
    const again = (await useCases.planLibraryUpgrade(copy))!;
    expect(again).toMatchObject({ releaseUrl: v2.url, add: [], change: [], remove: [], kept: [], gone: ["latvia"] });
    expect(again.applied.map((card) => card.id)).toEqual(["sweden", "norway"]);
    pod.written.length = 0;
    await expect(useCases.applyLibraryUpgrade(copy, again)).resolves.toMatchObject({ ok: true, deck: { sourceUrl: v2.url } });
    // It finishes with the entry alone: the cards and the states are as the release has them already.
    expect(pod.written).toEqual([copy.url]);
    expect(await useCases.planLibraryUpgrade(pod.deck!)).toBeNull();
  });

  it("drops, when offered again, the states left of a card it removed before its write of the review states failed", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    vi.mocked(deps.reviewStateRepository.applyReviewChanges).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ ok: false, step: "reviews", changed: true });
    expect(pod.reviews.get(copy.reviewsDocumentUrl)!.map((s) => s.cardId)).toEqual(["sweden", "latvia"]);
    const again = (await useCases.planLibraryUpgrade(copy))!;
    expect(again.gone).toEqual(["latvia"]);
    pod.written.length = 0;
    await expect(useCases.applyLibraryUpgrade(copy, again)).resolves.toMatchObject({ ok: true });
    expect(pod.written).toEqual([copy.reviewsDocumentUrl, copy.url]);
    expect(pod.reviews.get(copy.reviewsDocumentUrl)).toEqual([reviewOf("sweden")]);
  });

  it("says whether the deck changed by whether a failed write may have been made", async () => {
    // Refused before it was sent (the data would not conform): nothing changed.
    const refused = await world();
    vi.mocked(refused.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(new AppError("dataNotConforming", { problems: "x" }));
    await expect(refused.useCases.applyLibraryUpgrade(refused.copy, refused.plan)).resolves.toMatchObject({ ok: false, step: "cards", changed: false });
    // An answer lost on the way may follow a write the pod made.
    const lost = await world();
    vi.mocked(lost.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lost.useCases.applyLibraryUpgrade(lost.copy, lost.plan)).resolves.toMatchObject({ ok: false, step: "cards", changed: true });
  });

  it("counts an entry's write whose answer was lost as done, when the entry says it happened", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    const upgradeEntry = vi.mocked(deps.deckRepository.upgradeDeckEntry).getMockImplementation()!;
    vi.mocked(deps.deckRepository.upgradeDeckEntry).mockImplementationOnce(async (current, next) => {
      await upgradeEntry(current, next);
      throw new TypeError("Failed to fetch");
    });
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({ ok: true, deck: pod.deck });
    expect(pod.deck).toMatchObject({ sourceUrl: `${LIB}v2.ttl` });

    // Not made, or not to be told (the entry cannot be read): the upgrade failed, its cards written.
    const lost = await world();
    vi.mocked(lost.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lost.useCases.applyLibraryUpgrade(lost.copy, lost.plan)).resolves.toMatchObject({ ok: false, step: "entry", changed: true });
    const unread = await world();
    vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const readDeck = vi.mocked(unread.deps.deckRepository.readDeck).getMockImplementation()!;
    vi.mocked(unread.deps.deckRepository.readDeck).mockImplementation(async (url) => {
      if (vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mock.calls.length > 0) throw new TypeError("offline");
      return readDeck(url);
    });
    await expect(unread.useCases.applyLibraryUpgrade(unread.copy, unread.plan)).resolves.toMatchObject({ ok: false, step: "entry", changed: true });
    // The deck gone meanwhile: nothing to tell by.
    const gone = await world();
    vi.mocked(gone.deps.deckRepository.upgradeDeckEntry).mockImplementationOnce(async () => {
      gone.pod.deck = null;
      throw new TypeError("Failed to fetch");
    });
    await expect(gone.useCases.applyLibraryUpgrade(gone.copy, gone.plan)).resolves.toMatchObject({ ok: false, step: "entry" });
  });

  it("says the deck may have changed when the entry, its only write, lost its answer and cannot be read", async () => {
    const entryOnly = async () => {
      const setup = await world();
      // Release 2 as the copy already has its cards: the upgrade writes the deck's entry alone.
      vi.mocked(setup.deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
        url === setup.v2.url
          ? { ...setup.v2, cards: setup.pod.cards.get(setup.copy.cardsDocumentUrl)!.map(({ url: _u, createdAt: _c, ...c }) => c) }
          : { ...setup.v2, url, version: "1", title: { en: "Capitals" } },
      );
      vi.mocked(setup.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(new TypeError("Failed to fetch"));
      return { ...setup, plan: (await setup.useCases.planLibraryUpgrade(setup.copy))! };
    };
    // The entry read again still names the release the deck came from: its write was not made.
    const unmade = await entryOnly();
    await expect(unmade.useCases.applyLibraryUpgrade(unmade.copy, unmade.plan)).resolves.toMatchObject({ ok: false, step: "entry", changed: false });
    // The entry cannot be read again: its write may have been made.
    const unread = await entryOnly();
    const readDeck = vi.mocked(unread.deps.deckRepository.readDeck).getMockImplementation()!;
    vi.mocked(unread.deps.deckRepository.readDeck).mockImplementation(async (url) => {
      if (vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mock.calls.length > 0) throw new TypeError("offline");
      return readDeck(url);
    });
    await expect(unread.useCases.applyLibraryUpgrade(unread.copy, unread.plan)).resolves.toMatchObject({ ok: false, step: "entry", changed: true });
  });

  describe("guests", () => {
    const guestInstance: Instance = { url: GUEST_INSTANCE_URL, name: "My study" };
    const TARGET = "https://alice.example/solid-memo/main/";

    function guestDeps({ started = true }: { started?: boolean } = {}) {
      const deps = makeDeps();
      let exists = started;
      const guestPod: GuestPod = {
        exists: vi.fn(async () => exists),
        start: vi.fn(async () => {
          exists = true;
        }),
        discard: vi.fn(async () => {
          exists = false;
        }),
      };
      vi.mocked(deps.instanceRepository.listInstances).mockImplementation(async (webId) =>
        webId === GUEST_WEBID ? (exists ? [guestInstance] : []) : [instance],
      );
      vi.mocked(deps.instanceRepository.attachInstance).mockResolvedValue({ url: TARGET, name: "My study" });
      vi.mocked(deps.instanceCopier.listResources).mockResolvedValue([
        `${GUEST_INSTANCE_URL}catalog.ttl`,
        `${GUEST_INSTANCE_URL}digest.ttl`,
        `${GUEST_INSTANCE_URL}history/`,
        `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
      ]);
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
      return { deps: { ...deps, guestPod }, guestPod };
    }

    it("restoreSession gives a guest's session when no one logged in and a guest studied here", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.sessionGateway.restore).mockResolvedValue(null);
      expect(await createUseCases(deps).restoreSession()).toEqual({ session: GUEST_SESSION, origin: "restored" });
      vi.mocked(deps.guestPod.exists).mockResolvedValue(false);
      expect(await createUseCases(deps).restoreSession()).toBeNull();
    });

    it("restoreSession prefers a login to a guest's study", async () => {
      const { deps } = guestDeps();
      expect(await createUseCases(deps).restoreSession()).toEqual({ session, origin: "login" });
    });

    it("startGuest starts the guest's pod and makes their instance, published by the guest", async () => {
      const { deps, guestPod } = guestDeps({ started: false });
      vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
      vi.mocked(deps.instanceRepository.createInstance).mockResolvedValue(guestInstance);
      vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(new Error("no name"));
      expect(await createUseCases(deps).startGuest(" My study ")).toEqual(GUEST_SESSION);
      expect(guestPod.start).toHaveBeenCalledOnce();
      expect(deps.instanceRepository.createInstance).toHaveBeenCalledWith({
        webId: GUEST_WEBID,
        containerUrl: GUEST_INSTANCE_URL,
        name: "My study",
        registrationTarget: "private",
      });
      expect(deps.deckRepository.saveCatalog).toHaveBeenCalledWith(GUEST_INSTANCE_URL, {
        title: "My study",
        description: "Flashcard decks of the Solid Memo instance My study.",
        publisher: { webId: GUEST_WEBID, name: GUEST_WEBID },
      });
    });

    it("startGuest keeps the instance a guest already has", async () => {
      const { deps } = guestDeps();
      await createUseCases(deps).startGuest("My study");
      expect(deps.instanceRepository.createInstance).not.toHaveBeenCalled();
    });

    it("cannot start a guest without a guest pod", async () => {
      const useCases = createUseCases(makeDeps());
      await expect(useCases.startGuest("x")).rejects.toMatchObject({ code: "noGuestPod" });
      expect(await useCases.findGuestStudy()).toBeNull();
      await expect(useCases.discardGuest()).resolves.toBeUndefined();
    });

    it("discoverAccount asks no identity provider about a guest", async () => {
      const { deps } = guestDeps();
      const account = await createUseCases(deps).discoverAccount(GUEST_SESSION);
      expect(account.oidcIssuer).toBeUndefined();
      expect(deps.sessionGateway.discoverOidcIssuer).not.toHaveBeenCalled();
    });

    it("discardGuest deletes the guest's pod", async () => {
      const { deps, guestPod } = guestDeps();
      await createUseCases(deps).discardGuest();
      expect(guestPod.discard).toHaveBeenCalledOnce();
    });

    it("findGuestStudy lists the guest's instances with their decks counted; null when no guest studied here", async () => {
      const { deps } = guestDeps();
      expect(await createUseCases(deps).findGuestStudy()).toEqual({ instances: [{ instance: guestInstance, deckCount: 1 }] });
      expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      vi.mocked(deps.guestPod.exists).mockResolvedValue(false);
      expect(await createUseCases(deps).findGuestStudy()).toBeNull();
    });

    it("transferGuestStudy copies the study into the user's pod as theirs, checks and registers it, then deletes the guest's", async () => {
      const { deps, guestPod } = guestDeps();
      vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
        url: document.url,
        subjects: [
          {
            url: session.webId,
            properties: [{ predicate: "http://xmlns.com/foaf/0.1/name", values: [{ type: "literal", value: "Alice" }] }],
          },
        ],
      } as WebIdDocument);
      const hold = vi.fn(() => vi.fn());
      const progress: string[] = [];
      const outcome = await createUseCases({ ...deps, writeFence: { hold } }).transferGuestStudy(
        session,
        guestInstance,
        { containerUrl: ` ${TARGET.slice(0, -1)} `, registrationTarget: "private" },
        (p) => progress.push(`${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`),
      );
      expect(outcome).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: true });
      const move = { from: GUEST_INSTANCE_URL, to: TARGET, renames: { [GUEST_WEBID]: session.webId } };
      expect(hold).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      expect(deps.instanceCopier.ensureAbsent).toHaveBeenCalledWith(TARGET);
      expect(deps.instanceCopier.createContainer).toHaveBeenCalledWith(TARGET);
      // The digest stays behind; access control is the user's pod's own.
      expect(vi.mocked(deps.instanceCopier.copyResource).mock.calls).toEqual([
        [`${GUEST_INSTANCE_URL}catalog.ttl`, `${TARGET}catalog.ttl`, move],
        [`${GUEST_INSTANCE_URL}history/`, `${TARGET}history/`, move],
        [`${GUEST_INSTANCE_URL}history/2026-10.ttl`, `${TARGET}history/2026-10.ttl`, move],
      ]);
      expect(deps.deckRepository.saveCatalog).toHaveBeenCalledExactlyOnceWith(TARGET, {
        ...catalog,
        publisher: { webId: session.webId, name: "Alice" },
      });
      expect(vi.mocked(deps.instanceCopier.mentions).mock.calls).toEqual([
        [`${TARGET}catalog.ttl`, GUEST_ORIGIN],
        [`${TARGET}history/2026-10.ttl`, GUEST_ORIGIN],
      ]);
      expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(`${TARGET}meta.ttl`);
      expect(deps.instanceRepository.attachInstance).toHaveBeenCalledWith({
        webId: session.webId,
        instanceUrl: TARGET,
        registrationTarget: "private",
      });
      expect(deps.instanceRepository.registerDataClasses).toHaveBeenCalledWith({
        webId: session.webId,
        instanceUrl: TARGET,
        title: "My study",
      });
      expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({ webId: GUEST_WEBID, instance: guestInstance });
      expect(guestPod.discard).not.toHaveBeenCalled();
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(GUEST_INSTANCE_URL, TARGET);
      expect(deps.updateJournal.end).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      expect(deps.updateJournal.run).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      expect(deps.updateJournal.run.mock.results[0]!.value).toHaveBeenCalledOnce();
      expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
      expect(progress).toEqual([
        "stage 0/7 (0 of 3)",
        "stage 0/7 (1 of 3)",
        "stage 0/7 (2 of 3)",
        "copy 1/7 (0 of 3)",
        "copy 1/7 (1 of 3)",
        "copy 1/7 (2 of 3)",
        "adopt 2/7 (0 of 3)",
        "adopt 2/7 (1 of 3)",
        "adopt 2/7 (2 of 3)",
        "validate 3/7",
        "validate 3/7 (0 of 5)",
        "validate 3/7 (1 of 5)",
        "validate 3/7 (2 of 5)",
        "validate 3/7 (3 of 5)",
        "validate 3/7 (4 of 5)",
        "verify 4/7 (0 of 4)",
        "verify 4/7 (1 of 4)",
        "verify 4/7 (2 of 4)",
        "verify 4/7 (3 of 4)",
        "register 5/7",
        "tidy 6/7",
        "tidy 7/7",
      ]);
    });

    it("a move cut off by a closed tab left a partial copy: offered for removal while it is there", async () => {
      const { deps } = guestDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
      vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
      vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("exists"));
      await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBe(TARGET);
      expect(deps.updateJournal.staging).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      expect(deps.updateJournal.end).not.toHaveBeenCalled();
      // Gone meanwhile: forgotten.
      await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
      expect(deps.updateJournal.end).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      // Removed whole, as nothing names it.
      await useCases.removeInterruptedGuestMove(guestInstance);
      expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledWith(TARGET);
      vi.mocked(deps.instanceCopier.deleteRecursively).mockClear();
      vi.mocked(deps.updateJournal.staging).mockReturnValue(null);
      await useCases.removeInterruptedGuestMove(guestInstance);
      expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
    });

    it("a note an earlier version's update left on an instance in a Pod is not a move: nothing offered, nothing removed", async () => {
      const { deps } = guestDeps();
      const useCases = createUseCases(deps);
      vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
      await expect(useCases.findInterruptedGuestMove(instance)).resolves.toBeNull();
      await useCases.removeInterruptedGuestMove(instance);
      expect(deps.updateJournal.staging).not.toHaveBeenCalled();
      expect(deps.updateJournal.end).not.toHaveBeenCalled();
      expect(deps.instanceCopier.ensureAbsent).not.toHaveBeenCalled();
      expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
    });

    it("holds read-only, while it runs, the guest's instance and the copy a move another page runs", () => {
      const holds: { url: string; release: ReturnType<typeof vi.fn> }[] = [];
      const writeFence = {
        hold: vi.fn((url: string) => {
          const release = vi.fn();
          holds.push({ url, release });
          return release;
        }),
      };
      const { deps } = guestDeps();
      createUseCases({ ...deps, writeFence });
      const changed = vi.mocked(deps.updateJournal.watch).mock.calls[0]![0];
      const held = () => holds.filter(({ release }) => release.mock.calls.length === 0).map(({ url }) => url);
      changed(GUEST_INSTANCE_URL, TARGET);
      expect(held()).toEqual([GUEST_INSTANCE_URL, TARGET]);
      // Told again, it holds the copy named now, the old hold let go.
      changed(GUEST_INSTANCE_URL, TARGET);
      expect(held()).toEqual([GUEST_INSTANCE_URL, TARGET]);
      expect(holds).toHaveLength(4);
      // Released when it stops running; one never seen releases nothing.
      changed(GUEST_INSTANCE_URL, null);
      changed(GUEST_INSTANCE_URL, null);
      expect(held()).toEqual([]);
      expect(holds.every(({ release }) => release.mock.calls.length === 1)).toBe(true);
    });

    it("takes no move another page runs for an interrupted one, nor removes its copy", async () => {
      const { deps } = guestDeps();
      const useCases = createUseCases(deps);
      const changed = vi.mocked(deps.updateJournal.watch).mock.calls[0]![0];
      changed(GUEST_INSTANCE_URL, TARGET);
      vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
      await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
      await expect(useCases.removeInterruptedGuestMove(guestInstance)).rejects.toMatchObject({ code: "guestStudyBeingMoved" });
      expect(deps.instanceCopier.ensureAbsent).not.toHaveBeenCalled();
      expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
      expect(deps.updateJournal.end).not.toHaveBeenCalled();
    });

    it("transferGuestStudy deletes the whole guest pod with its last instance", async () => {
      const { deps, guestPod } = guestDeps();
      vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
        vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
        return { keptFolder: null };
      });
      await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "public" });
      expect(guestPod.discard).toHaveBeenCalledOnce();
    });

    it("transferGuestStudy, and the rest of the app, run without a journal, with the system's clock and fresh ids", async () => {
      const { updateJournal: _j, now: _n, newId: _i, ...deps } = guestDeps().deps;
      const useCases = createUseCases(deps);
      await expect(
        useCases.transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).resolves.toMatchObject({ ok: true });
      await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
      expect(useCases.newDeckGroup(instance.url, { en: "Group" }).url).toMatch(/#group-[0-9a-f-]{36}$/);
      await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
    });

    it("transferGuestStudy keeps a catalogue-less study as it is, and adds answers still on their way first", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
      const answerLog: AnswerLog = { append: vi.fn(async () => undefined), appendAll: vi.fn(async () => undefined), months: vi.fn(async () => []), readMonth: vi.fn(async () => []), removeDay: vi.fn(async () => undefined) };
      vi.mocked(answerLog.append).mockRejectedValueOnce(new Error("offline"));
      const useCases = createUseCases({ ...deps, answerLog });
      const guestDeck = { ...deck, url: `${GUEST_INSTANCE_URL}catalog.ttl#deck-1` };
      await useCases.recordReview(GUEST_INSTANCE_URL, guestDeck, { card, direction: "front-to-back" }, 4, new Date("2026-10-03T10:00:00.000Z"));
      await vi.waitFor(() => expect(answerLog.append).toHaveBeenCalledOnce());
      await useCases.transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" });
      expect(answerLog.append).toHaveBeenCalledTimes(2);
      expect(vi.mocked(answerLog.append).mock.invocationCallOrder[1]).toBeLessThan(
        vi.mocked(deps.instanceCopier.listResources).mock.invocationCallOrder[0]!,
      );
      expect(deps.deckRepository.saveCatalog).not.toHaveBeenCalled();
    });

    it("transferGuestStudy tidies the guest's study away even when its data could not be registered", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.instanceRepository.registerDataClasses).mockRejectedValue(new Error("offline"));
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: true });
      expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({ webId: GUEST_WEBID, instance: guestInstance });
    });

    it("transferGuestStudy says the study moved even when the guest's could not be tidied away", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: false });
    });

    it("transferGuestStudy moves only from the guest's pod into a user's", async () => {
      const { deps } = guestDeps();
      const useCases = createUseCases(deps);
      const target = { containerUrl: TARGET, registrationTarget: "private" as const };
      const refusal = "A guest's study moves from the guest's pod into the pod of a user who logged in.";
      await expect(useCases.transferGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(refusal);
      await expect(useCases.transferGuestStudy(session, instance, target)).rejects.toThrow(refusal);
      await expect(
        useCases.transferGuestStudy(session, guestInstance, { ...target, containerUrl: `${GUEST_ORIGIN}x/` }),
      ).rejects.toThrow(refusal);
    });

    it.each([
      ["stage", (deps: ReturnType<typeof makeDeps>) => vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("boom")), false],
      ["copy", (deps: ReturnType<typeof makeDeps>) => vi.mocked(deps.instanceCopier.copyResource).mockRejectedValueOnce(new Error("boom")), true],
      ["adopt", (deps: ReturnType<typeof makeDeps>) => vi.mocked(deps.deckRepository.saveCatalog).mockRejectedValueOnce(new Error("boom")), true],
      ["register", (deps: ReturnType<typeof makeDeps>) => vi.mocked(deps.instanceRepository.attachInstance).mockRejectedValueOnce(new Error("boom")), true],
    ] as const)("transferGuestStudy failing at %s leaves the guest's study as it was and removes the copy", async (step, fail, copied) => {
      const { deps } = guestDeps();
      fail(deps);
      const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" });
      expect(outcome).toEqual({ ok: false, step, error: new Error("boom"), cleanedUp: true });
      expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledTimes(copied ? 1 : 0);
      if (copied) expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledWith(TARGET);
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    });

    it("transferGuestStudy refuses a copy that still names the guest's pod, or does not conform", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.instanceCopier.mentions).mockImplementation(async (url) => url.endsWith("2026-10.ttl"));
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toEqual({
        ok: false,
        step: "adopt",
        error: new AppError("guestUrlsLeft", { url: `${TARGET}history/2026-10.ttl` }),
        cleanedUp: true,
      });
      vi.mocked(deps.instanceCopier.mentions).mockResolvedValue(false);
      const violation = { message: { en: "x" }, severity: "violation" as const, constraint: "MinCount" };
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([]);
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
        url.endsWith("meta.ttl")
          ? { url, status: "checked" as const, subjects: [{ url: `${url}#it`, status: "checked" as const, shape: "instance" as const, version: 2, violations: [violation] }] }
          : { url, status: "missing" as const, subjects: [] },
      );
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toMatchObject({ ok: false, step: "validate", error: new AppError("movedCopyInvalid", { count: 1 }) });
    });

    it("transferGuestStudy refuses to register when the guest's study changed while it was copied", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.instanceCopier.isUnchanged).mockResolvedValueOnce(false);
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toMatchObject({ ok: false, step: "verify", error: new AppError("resourceChangedDuringCopy", { url: `${GUEST_INSTANCE_URL}catalog.ttl` }) });
      expect(deps.instanceRepository.attachInstance).not.toHaveBeenCalled();
      // A resource that appeared meanwhile is a change too.
      const more = guestDeps();
      const listed = await more.deps.instanceCopier.listResources(GUEST_INSTANCE_URL);
      vi.mocked(more.deps.instanceCopier.listResources)
        .mockResolvedValueOnce(listed)
        .mockResolvedValueOnce([...listed, `${GUEST_INSTANCE_URL}new.ttl`]);
      expect(
        await createUseCases(more.deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toMatchObject({ ok: false, step: "verify", error: new AppError("instanceChangedDuringCopy") });
    });

    describe("adding the study to an instance", () => {
      const RELEASE = "https://solid-memo.com/decks/solid-fundamentals/v1.ttl";
      const guestDeckOf = (id: string, extra: Partial<Deck> = {}): Deck => ({
        ...deck,
        id,
        url: `${GUEST_INSTANCE_URL}catalog.ttl#${id}`,
        title: { en: id },
        cardsDocumentUrl: `${GUEST_INSTANCE_URL}decks/${id}.ttl`,
        reviewsDocumentUrl: `${GUEST_INSTANCE_URL}reviews/${id}.ttl`,
        ...extra,
      });
      const course = guestDeckOf("deck-g1", { sourceUrl: RELEASE, completedChapters: [`${RELEASE}#ch-1`] });
      const own = guestDeckOf("deck-g2");
      const guestCard: Card = {
        ...card,
        url: `${course.cardsDocumentUrl}#q-1`,
        id: "q-1",
        distractors: [{ id: "q-1-d1", text: { en: "No" } }],
      };
      const guestState: ReviewState = {
        cardId: "q-1",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-10-02",
        firstReviewedAt: "2026-10-01T10:00:00.000Z",
        lastReviewedAt: "2026-10-01T10:00:00.000Z",
        formatVersion: 2,
      };
      const answerTo = (of: Deck, id: string, extra: Partial<Answer> = {}): Answer => ({
        id,
        deckUrl: of.url,
        cardUrl: `${of.cardsDocumentUrl}#q-1`,
        direction: "front-to-back",
        grade: 4,
        answeredAt: "2026-10-01T10:00:00.000Z",
        studyDay: "2026-10-01",
        nextIntervalDays: 1,
        ...extra,
      });
      const added = (id: string, from: Deck): Deck => ({
        ...from,
        id,
        url: `${TARGET}catalog.ttl#${id}`,
        cardsDocumentUrl: `${TARGET}decks/${id}.ttl`,
        reviewsDocumentUrl: `${TARGET}reviews/${id}.ttl`,
        formatVersion: DECK_FORMAT_VERSION,
      });
      const target: Instance = { url: TARGET, name: "Main" };
      const targetDeck: Deck = { ...deck, url: `${TARGET}catalog.ttl#deck-t`, sourceUrl: RELEASE };
      const GROUP = { url: `${GUEST_INSTANCE_URL}catalog.ttl#group-g`, title: { en: "Solid" } };
      const RESOURCES = [
        `${GUEST_INSTANCE_URL}catalog.ttl`,
        `${GUEST_INSTANCE_URL}decks/`,
        `${GUEST_INSTANCE_URL}decks/deck-g1.ttl`,
        `${GUEST_INSTANCE_URL}digest.ttl`,
        `${GUEST_INSTANCE_URL}history/`,
        `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
        `${GUEST_INSTANCE_URL}reviews/deck-g1.ttl`,
      ];

      function mergeDeps() {
        const { deps, guestPod } = guestDeps();
        const answers = [
          answerTo(course, "answer-1", { mode: "multiple-choice", chosenDistractor: `${course.cardsDocumentUrl}#q-1-d1` }),
          answerTo(own, "answer-2"),
          // A deck the guest removed: its answers have no deck to go with.
          answerTo(guestDeckOf("deck-gone"), "answer-3"),
        ];
        const answerLog: AnswerLog = {
          append: vi.fn(async () => undefined),
          appendAll: vi.fn(async () => undefined),
          months: vi.fn(async (url: string) => (url === GUEST_INSTANCE_URL ? ["2026-10"] : [])),
          readMonth: vi.fn(async () => answers),
          removeDay: vi.fn(async () => undefined),
        };
        vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
          url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck],
        );
        vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({
          readOnly: false,
          children: [{ kind: "group", group: GROUP, children: [{ kind: "deck", deck: course }] }, { kind: "deck", deck: own }],
        });
        vi.mocked(deps.deckRepository.listCards).mockImplementation(async (of) => (of.url === course.url ? [guestCard] : []));
        vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (of) => (of.url === course.url ? [guestState] : []));
        vi.mocked(deps.instanceCopier.listResources).mockResolvedValue(RESOURCES);
        vi.mocked(deps.deckRepository.readDeck).mockResolvedValue(null);
        let id = 0;
        const journal = new Map<string, string>();
        const updateJournal = {
          begin: vi.fn((key: string, value: string) => void journal.set(key, value)),
          end: vi.fn((key: string) => void journal.delete(key)),
          staging: vi.fn((key: string) => journal.get(key) ?? null),
          run: vi.fn(() => () => undefined),
          watch: vi.fn(),
        };
        return {
          deps: { ...deps, answerLog, updateJournal, newId: () => `n${++id}` },
          guestPod,
          answers,
          journal,
        };
      }

      type MergeDeps = ReturnType<typeof mergeDeps>["deps"];
      /** A guest's deck's stamp as read with mergeDeps: the course's documents listed, the other deck's not. */
      const stampOf = (of: Deck) => guestDeckStamp(of, (url) => (of.url === course.url ? `version of ${url}` : ""));
      /** The guest's arrangement around the decks it was added as, as a group's note stamps it. */
      const arrangementOf = (first: Deck, second: Deck) =>
        JSON.stringify([
          { kind: "group", group: GROUP, children: [{ kind: "deck", url: first.url }] },
          { kind: "deck", url: second.url },
        ]);

      it("planGuestMerge lists the guest's decks with the instance's from the same release", async () => {
        const { deps } = mergeDeps();
        expect(await createUseCases(deps).planGuestMerge(guestInstance, target)).toEqual({
          decks: [
            { deck: course, sameRelease: [targetDeck] },
            { deck: own, sameRelease: [] },
          ],
        });
      });

      it("mergeGuestStudy adds each deck whole — documents, entry, answers — groups them as the guest did, then deletes the guest's", async () => {
        const { deps, answers, journal } = mergeDeps();
        const hold = vi.fn(() => vi.fn());
        const progress: string[] = [];
        const outcome = await createUseCases({ ...deps, writeFence: { hold } }).mergeGuestStudy(
          session,
          guestInstance,
          { ...target, url: TARGET.slice(0, -1) },
          {},
          (p) => progress.push(`${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`),
        );
        const first = added("deck-n1", course);
        const second = added("deck-n2", own);
        expect(outcome).toEqual({ ok: true, instance: { ...target, url: TARGET.slice(0, -1) }, added: [first, second], tidied: true });
        expect(hold).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
        // The guest's study, checked whole before anything is written.
        expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(`${GUEST_INSTANCE_URL}history/2026-10.ttl`);
        const { url: _url, formatVersion: _version, ...content } = guestCard;
        expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(first, { save: [content], remove: [] }, { whole: true });
        expect(deps.reviewStateRepository.createReviewStates).toHaveBeenCalledExactlyOnceWith(first, [guestState]);
        expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[first], [second]]);
        // Documents before the entry that names them.
        expect(vi.mocked(deps.deckRepository.applyCardChanges).mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0]!,
        );
        expect(vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(deps.deckRepository.addDeck).mock.invocationCallOrder[0]!,
        );
        expect(vi.mocked(deps.answerLog.appendAll).mock.calls).toEqual([
          [
            TARGET,
            [
              {
                ...answers[0],
                id: "answer-1-deck-n1",
                deckUrl: first.url,
                cardUrl: `${first.cardsDocumentUrl}#q-1`,
                chosenDistractor: `${first.cardsDocumentUrl}#q-1-d1`,
              },
            ],
          ],
          [TARGET, [{ ...answers[1], id: "answer-2-deck-n2", deckUrl: second.url, cardUrl: `${second.cardsDocumentUrl}#q-1` }]],
        ]);
        expect(deps.deckRepository.editDeckTree).toHaveBeenCalledExactlyOnceWith(TARGET, {
          kind: "graft",
          nodes: [
            { kind: "group", group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title }, children: [{ kind: "deck", url: first.url }] },
            { kind: "deck", url: second.url },
          ],
        });
        // The target's preferences stay; the guest's are not read, nor anything registered.
        expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
        expect(deps.instanceRepository.registerDataClasses).not.toHaveBeenCalled();
        expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({ webId: GUEST_WEBID, instance: guestInstance });
        // Each deck's note kept while the guest's study was here, then forgotten.
        expect(deps.updateJournal.begin).toHaveBeenCalledWith(
          `${course.url} added to ${TARGET}`,
          JSON.stringify({ url: first.url, stamp: stampOf(course) }),
        );
        expect(deps.updateJournal.begin).toHaveBeenCalledWith(`${own.url} added to ${TARGET}`, JSON.stringify({ url: second.url, stamp: stampOf(own) }));
        expect(deps.updateJournal.begin).toHaveBeenCalledWith(
          `${GROUP.url} added to ${TARGET}`,
          JSON.stringify({ url: `${TARGET}catalog.ttl#group-n3`, stamp: arrangementOf(first, second) }),
        );
        expect(journal.size).toBe(0);
        expect(progress).toEqual([
          "read 0/5 (0 of 2)",
          "read 0/5 (1 of 2)",
          "decks 1/5 (0 of 2)",
          "decks 1/5 (1 of 2)",
          "arrange 2/5",
          "verify 3/5 (0 of 5)",
          "verify 3/5 (1 of 5)",
          "verify 3/5 (2 of 5)",
          "verify 3/5 (3 of 5)",
          "verify 3/5 (4 of 5)",
          "tidy 4/5",
          "tidy 5/5",
        ]);
      });

      it("mergeGuestStudy leaves out the decks skipped, with their answers and places, and makes no groups when the guest made none", async () => {
        const { deps, guestPod } = mergeDeps();
        vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({ readOnly: false, children: [] });
        vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
          vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
          return { keptFolder: null };
        });
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target, { skip: [course.url] });
        expect(outcome).toMatchObject({ ok: true, added: [added("deck-n1", own)] });
        expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
        expect(deps.reviewStateRepository.createReviewStates).not.toHaveBeenCalled();
        expect(deps.answerLog.appendAll).toHaveBeenCalledExactlyOnceWith(TARGET, [
          expect.objectContaining({ id: "answer-2-deck-n1", deckUrl: `${TARGET}catalog.ttl#deck-n1` }),
        ]);
        expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
        expect(guestPod.discard).toHaveBeenCalledOnce();
      });

      it("mergeGuestStudy adds a deck it added from this device before, unchanged since, only its answers again", async () => {
        const { deps, journal } = mergeDeps();
        const before = added("deck-earlier", course);
        vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
          url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck, before],
        );
        journal.set(`${course.url} added to ${TARGET}`, JSON.stringify({ url: before.url, stamp: stampOf(course) }));
        journal.set(
          `${GROUP.url} added to ${TARGET}`,
          JSON.stringify({ url: `${TARGET}catalog.ttl#group-earlier`, stamp: arrangementOf(before, added("deck-n1", own)) }),
        );
        // A note of a deck the instance no longer has is no reason to leave one out.
        journal.set(`${own.url} added to ${TARGET}`, JSON.stringify({ url: `${TARGET}catalog.ttl#deck-removed`, stamp: stampOf(own) }));
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toMatchObject({ ok: true, added: [before, added("deck-n1", own)] });
        expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[added("deck-n1", own)]]);
        // The same entries as before: adding them again changes nothing.
        expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [expect.objectContaining({ id: "answer-1-deck-earlier", deckUrl: before.url })]);
        expect(vi.mocked(deps.updateJournal.begin).mock.calls.map(([key]) => key)).toEqual([
          `${own.url} added to ${TARGET}`,
          `${GROUP.url} added to ${TARGET}`,
        ]);
        // The group an earlier run made is made under the same URL: a graft already made changes nothing.
        expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
          kind: "graft",
          nodes: [
            { kind: "group", group: { url: `${TARGET}catalog.ttl#group-earlier`, title: GROUP.title }, children: [{ kind: "deck", url: before.url }] },
            { kind: "deck", url: `${TARGET}catalog.ttl#deck-n1` },
          ],
        });
      });

      it("mergeGuestStudy adds again, as a deck of its own, a deck the guest changed since it was added", async () => {
        const { deps, journal } = mergeDeps();
        const before = added("deck-earlier", course);
        vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
          url === GUEST_INSTANCE_URL ? [course] : [before],
        );
        journal.set(`${course.url} added to ${TARGET}`, JSON.stringify({ url: before.url, stamp: "older versions" }));
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: true,
          added: [added("deck-n1", course)],
        });
        // Its answers are entries of their own, beside those of the deck added before: no entry names two decks.
        expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [
          expect.objectContaining({ id: "answer-1-deck-n1", deckUrl: `${TARGET}catalog.ttl#deck-n1` }),
        ]);
      });

      it("mergeGuestStudy adds again a deck whose entry alone the guest changed since, and makes groups arranged otherwise anew", async () => {
        const { deps, journal } = mergeDeps();
        const before = added("deck-earlier", course);
        const renamed = { ...course, title: { en: "Renamed" }, newCardsPerDay: 5 };
        vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
          url === GUEST_INSTANCE_URL ? [renamed, own] : [targetDeck, before],
        );
        journal.set(`${course.url} added to ${TARGET}`, JSON.stringify({ url: before.url, stamp: stampOf(course) }));
        journal.set(
          `${GROUP.url} added to ${TARGET}`,
          JSON.stringify({ url: `${TARGET}catalog.ttl#group-earlier`, stamp: arrangementOf(before, added("deck-n1", own)) }),
        );
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        const again = added("deck-n1", renamed);
        expect(outcome).toMatchObject({ ok: true, added: [again, added("deck-n2", own)] });
        expect(deps.deckRepository.addDeck).toHaveBeenCalledWith(again);
        expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
          kind: "graft",
          nodes: [
            { kind: "group", group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title }, children: [{ kind: "deck", url: again.url }] },
            { kind: "deck", url: `${TARGET}catalog.ttl#deck-n2` },
          ],
        });
      });

      it("mergeGuestStudy refuses, before writing anything, to make groups in an arrangement a newer version wrote", async () => {
        const { deps } = mergeDeps();
        const guestTree = await deps.deckRepository.readDeckTree(GUEST_INSTANCE_URL);
        vi.mocked(deps.deckRepository.readDeckTree).mockImplementation(async (url) =>
          url === TARGET ? { readOnly: true, children: [] } : guestTree,
        );
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: false,
          step: "read",
          error: new AppError("deckTreeTooNew"),
          added: [],
        });
        expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
        expect(deps.deckRepository.addDeck).not.toHaveBeenCalled();
        // A guest who made no group has nothing to arrange there.
        vi.mocked(deps.deckRepository.readDeckTree).mockImplementation(async (url) =>
          url === TARGET ? { readOnly: true, children: [] } : { readOnly: false, children: [] },
        );
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({ ok: true });
      });

      it("mergeGuestStudy adds only from the guest's pod to an instance of a user who logged in", async () => {
        const { deps } = mergeDeps();
        const useCases = createUseCases(deps);
        const refusal = "A guest's study is added from the guest's pod to an instance of a user who logged in.";
        await expect(useCases.mergeGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(refusal);
        await expect(useCases.mergeGuestStudy(session, instance, target)).rejects.toThrow(refusal);
        await expect(useCases.mergeGuestStudy(session, guestInstance, guestInstance)).rejects.toThrow(refusal);
      });

      it("mergeGuestStudy adds nothing from a guest's study that does not conform, or that a newer version wrote", async () => {
        const { deps } = mergeDeps();
        const violation = { message: { en: "x" }, severity: "violation" as const, constraint: "MinCount" };
        vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
          url,
          status: "checked" as const,
          subjects: url.endsWith("catalog.ttl")
            ? [{ url: `${url}#x`, status: "checked" as const, shape: "deck" as const, version: 6, violations: [violation] }]
            : [],
        }));
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toEqual({
          ok: false,
          instance: target,
          step: "read",
          error: new AppError("guestStudyInvalid", { count: 1 }),
          added: [],
        });
        vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
          url,
          status: "checked" as const,
          subjects: [{ url: `${url}#x`, status: "newer" as const, shape: "card" as const, version: 9, latest: 5 }],
        }));
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: false,
          step: "read",
          error: new AppError("guestStudyTooNew"),
        });
        expect(deps.deckRepository.addDeck).not.toHaveBeenCalled();
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      });

      it("mergeGuestStudy writes nothing of a deck that would still name the guest's pod", async () => {
        const { deps } = mergeDeps();
        vi.mocked(deps.deckRepository.listCards).mockResolvedValue([{ ...guestCard, frontImageUrl: `${GUEST_ORIGIN}picture.png` }]);
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: false,
          step: "decks",
          error: new AppError("guestUrlsLeft", { url: `${TARGET}catalog.ttl#deck-n1` }),
          added: [],
        });
        expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      });

      it("mergeGuestStudy stops at a deck it cannot add, keeping the decks added whole and the guest's study, deleting the deck's documents", async () => {
        const { deps, journal } = mergeDeps();
        vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
          url === GUEST_INSTANCE_URL ? [own, course] : [targetDeck],
        );
        vi.mocked(deps.deckRepository.addDeck).mockResolvedValueOnce(added("deck-n1", own)).mockRejectedValueOnce(new Error("offline"));
        vi.mocked(deps.deckRepository.deleteDocument).mockRejectedValueOnce(new Error("still offline"));
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toEqual({ ok: false, instance: target, step: "decks", error: new Error("offline"), added: [added("deck-n1", own)] });
        // The entry was not written after all: the documents nothing names go.
        expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(`${TARGET}catalog.ttl#deck-n2`);
        expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([
          [`${TARGET}decks/deck-n2.ttl`],
          [`${TARGET}reviews/deck-n2.ttl`],
        ]);
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
        expect(journal.size).toBe(1);
        expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
      });

      it("mergeGuestStudy deletes only what it wrote of a deck it could not add, and counts a deck whose entry was written though its answer was lost", async () => {
        const { deps } = mergeDeps();
        vi.mocked(deps.reviewStateRepository.createReviewStates).mockRejectedValueOnce(new AppError("createdElsewhere", { url: "x" }));
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({ ok: false, step: "decks", added: [] });
        expect(deps.deckRepository.readDeck).not.toHaveBeenCalled();
        // The cards document it wrote goes; the reviews document someone else created stays.
        expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([[`${TARGET}decks/deck-n1.ttl`]]);

        const lost = mergeDeps();
        const there = added("deck-n1", course);
        vi.mocked(lost.deps.deckRepository.addDeck).mockRejectedValueOnce(new Error("connection reset"));
        vi.mocked(lost.deps.deckRepository.readDeck).mockResolvedValueOnce(there);
        expect(await createUseCases(lost.deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: true,
          added: [there, added("deck-n2", own)],
        });
        expect(lost.deps.deckRepository.deleteDocument).not.toHaveBeenCalled();

        const unknown = mergeDeps();
        vi.mocked(unknown.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(new Error("connection reset"));
        vi.mocked(unknown.deps.deckRepository.readDeck).mockRejectedValueOnce(new Error("offline"));
        expect(await createUseCases(unknown.deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({ ok: false, step: "decks" });
        // A write whose answer was lost may have been made: its document goes, as nothing names it.
        expect(vi.mocked(unknown.deps.deckRepository.deleteDocument).mock.calls).toEqual([[`${TARGET}decks/deck-n1.ttl`]]);
      });

      it.each([
        ["decks", (deps: MergeDeps) => vi.mocked(deps.answerLog.appendAll).mockRejectedValueOnce(new Error("boom")), 1],
        ["arrange", (deps: MergeDeps) => vi.mocked(deps.deckRepository.editDeckTree).mockRejectedValueOnce(new Error("boom")), 2],
      ] as const)("mergeGuestStudy failing at %s keeps the decks added and the guest's study", async (step, fail, count) => {
        const { deps } = mergeDeps();
        fail(deps);
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toMatchObject({
          ok: false,
          step,
          error: new Error("boom"),
          added: [added("deck-n1", course), added("deck-n2", own)].slice(0, count),
        });
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      });

      it("mergeGuestStudy keeps the guest's study when it changed while it was being added", async () => {
        const { deps } = mergeDeps();
        vi.mocked(deps.instanceCopier.listResources)
          .mockResolvedValueOnce(RESOURCES)
          .mockResolvedValueOnce([...RESOURCES, `${GUEST_INSTANCE_URL}new.ttl`]);
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: false,
          step: "verify",
          error: new AppError("guestStudyChanged"),
        });
        const changed = mergeDeps();
        let reads = 0;
        vi.mocked(changed.deps.instanceCopier.versionOf).mockImplementation(async (url) =>
          url.endsWith("2026-10.ttl") && ++reads > 1 ? "newer" : `version of ${url}`,
        );
        expect(await createUseCases(changed.deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({
          ok: false,
          step: "verify",
          error: new AppError("guestStudyChanged", { url: `${GUEST_INSTANCE_URL}history/2026-10.ttl` }),
        });
        expect(changed.deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      });

      it("mergeGuestStudy says the study was added even when the guest's could not be deleted, and keeps its notes", async () => {
        const { deps, journal } = mergeDeps();
        vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
        expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toMatchObject({ ok: true, tidied: false });
        expect([...journal.keys()]).toEqual([
          `${course.url} added to ${TARGET}`,
          `${own.url} added to ${TARGET}`,
          `${GROUP.url} added to ${TARGET}`,
        ]);
      });

      it("mergeGuestStudy adds answers still on their way to the guest's log first", async () => {
        const { deps } = mergeDeps();
        vi.mocked(deps.answerLog.append).mockRejectedValueOnce(new Error("offline"));
        const useCases = createUseCases(deps);
        await useCases.recordReview(GUEST_INSTANCE_URL, own, { card, direction: "front-to-back" }, 4, new Date("2026-10-03T10:00:00.000Z"));
        await vi.waitFor(() => expect(deps.answerLog.append).toHaveBeenCalledOnce());
        await useCases.mergeGuestStudy(session, guestInstance, target);
        expect(deps.answerLog.append).toHaveBeenCalledTimes(2);
        expect(vi.mocked(deps.answerLog.append).mock.invocationCallOrder[1]).toBeLessThan(
          vi.mocked(deps.instanceCopier.listResources).mock.invocationCallOrder[0]!,
        );
      });
    });

    it("transferGuestStudy names the copy it could not remove", async () => {
      const { deps } = guestDeps();
      vi.mocked(deps.instanceCopier.copyResource).mockRejectedValueOnce("offline");
      vi.mocked(deps.instanceCopier.deleteRecursively).mockRejectedValueOnce(new Error("still offline"));
      expect(
        await createUseCases(deps).transferGuestStudy(session, guestInstance, { containerUrl: TARGET, registrationTarget: "private" }),
      ).toEqual({ ok: false, step: "copy", error: "offline", cleanedUp: false, leftoverUrl: TARGET });
      expect(deps.updateJournal.end).not.toHaveBeenCalled();
    });
  });
});

describe("courses", () => {
  const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
  const at = (id: string) => `${RELEASE}#${id}`;
  const course: LibraryDeck = {
    ...libraryDeck,
    url: RELEASE,
    ...firstRelease(RELEASE),
    title: { en: "Solid fundamentals" },
    isCourse: true,
  };
  const question: LibraryCard = {
    id: "q-iri",
    front: { en: "What can an IRI name?" },
    back: { en: "Any thing at all" },
    formatVersion: 5,
    distractors: [{ id: "q-iri-d1", text: { en: "Only web pages" } }],
  };
  const release: LibraryDeckContent = {
    ...libraryContent,
    url: RELEASE,
    title: course.title,
    seriesUrl: course.seriesUrl,
    isCourse: true,
    cards: [question, { id: "q-rdf", front: { en: "RDF?" }, back: { en: "Triples" }, formatVersion: 5 }],
  };
  const outline: CourseOutline = {
    releaseUrl: RELEASE,
    chapters: [
      {
        id: "ch-1",
        url: at("ch-1"),
        position: 0,
        title: { en: "Linked data" },
        steps: [{ id: "s-1", url: at("s-1"), position: 0, theory: { en: "IRIs name things." }, questionIds: ["q-iri"] }],
        reviewQuestionIds: [],
      },
      {
        id: "ch-2",
        url: at("ch-2"),
        position: 1,
        title: { en: "RDF" },
        steps: [{ id: "s-2", url: at("s-2"), position: 0, theory: { en: "Triples." }, questionIds: ["q-rdf"] }],
        reviewQuestionIds: [],
      },
    ],
  };
  const courseDeck: Deck = { ...deck, title: course.title, sourceUrl: RELEASE };
  const noon = new Date(2026, 9, 7, 12, 0);
  const stateOf = (lastReviewedAt: Date, due: string): ReviewState => ({
    cardId: question.id,
    direction: "front-to-back",
    easeFactor: 2.36,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: lastReviewedAt.toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
  });

  function setup() {
    const deps = makeDeps();
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockResolvedValue(release);
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockResolvedValue(outline);
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValue(courseDeck);
    const appended: Answer[] = [];
    const answerLog: AnswerLog = {
      append: vi.fn(async (_instanceUrl, answer) => {
        appended.push(answer);
      }),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => []),
      readMonth: vi.fn(async () => []),
      removeDay: vi.fn(async () => undefined),
    };
    let id = 0;
    const useCases = createUseCases({ ...deps, answerLog, newId: () => `id${++id}-0000-0000` });
    return { deps, useCases, appended };
  }

  it("startCourse copies the release without its cards, or returns the copy the instance has", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValueOnce([deck]);
    await useCases.startCourse(instance.url, course);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(RELEASE);
    expect(deps.deckRepository.importDeck).toHaveBeenCalledWith(instance.url, { ...release, cards: [] });
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValueOnce([deck, courseDeck]);
    await expect(useCases.startCourse(instance.url, course)).resolves.toBe(courseDeck);
    expect(deps.deckRepository.importDeck).toHaveBeenCalledOnce();
  });

  it("getCourse reads the deck as it is now, the release's outline and cards, and the progress its review states and completed chapters make", async () => {
    const { deps, useCases } = setup();
    const completed: Deck = { ...courseDeck, completedChapters: [at("ch-1")] };
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(completed);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValueOnce([
      stateOf(noon, "2026-10-08"),
      { ...stateOf(noon, "2026-10-08"), cardId: "q-rdf", direction: "back-to-front" },
    ]);
    const got = await useCases.getCourse(courseDeck);
    expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(courseDeck.url);
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(RELEASE);
    expect(got).toEqual({
      deck: completed,
      release,
      outline,
      cards: { "q-iri": question, "q-rdf": release.cards[1] },
      answeredCardIds: ["q-iri"],
      progress: {
        chapters: [
          { url: at("ch-1"), state: "done", doneStepIds: ["s-1"] },
          { url: at("ch-2"), state: "open", doneStepIds: [], resumeStepId: "s-2" },
        ],
        currentChapterUrl: at("ch-2"),
        done: false,
      },
    });
    // A deck with no chapter completed has the first open.
    expect((await useCases.getCourse(courseDeck)).progress.chapters[0]!.state).toBe("open");
  });

  it("getCourse keeps a chapter completed in an older release completed in the one the deck now follows", async () => {
    const { deps, useCases } = setup();
    const older = at("ch-1").replace("/v1.ttl#", "/v0.ttl#");
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce({ ...courseDeck, completedChapters: [older] });
    expect((await useCases.getCourse(courseDeck)).progress.chapters.map((chapter) => chapter.state)).toEqual(["done", "open"]);
  });

  it("getCourse refuses a deck that is gone, and one that is no library copy", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(null);
    await expect(useCases.getCourse(courseDeck)).rejects.toMatchObject({ code: "deckGone" });
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(deck);
    await expect(useCases.getCourse(deck)).rejects.toThrow("names the release");
  });

  it("answerCourseQuestion writes a card answered for the first time into the deck, then grades it, logging a multiple-choice answer", async () => {
    const { deps, useCases, appended } = setup();
    const answered = await useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: true }, noon);
    expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(courseDeck, { save: [question], remove: [] });
    expect(vi.mocked(deps.deckRepository.applyCardChanges).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.reviewStateRepository.saveReviewState).mock.invocationCallOrder[0]!,
    );
    expect(answered).toEqual({
      effect: "introduce",
      state: {
        cardId: "q-iri",
        direction: "front-to-back",
        easeFactor: 2.36,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-10-08",
        firstReviewedAt: noon.toISOString(),
        lastReviewedAt: noon.toISOString(),
        formatVersion: 2,
      },
    });
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([
      expect.objectContaining({
        cardUrl: `${courseDeck.cardsDocumentUrl}#q-iri`,
        direction: "front-to-back",
        grade: 3,
        mode: "multiple-choice",
        nextIntervalDays: 1,
      }),
    ]);
    expect(appended[0]).not.toHaveProperty("chosenDistractor");
  });

  it("answerCourseQuestion grades a wrong first answer 1 and names the wrong option chosen, in the deck's copy", async () => {
    const { useCases, appended } = setup();
    const answered = await useCases.answerCourseQuestion(
      instance.url,
      courseDeck,
      question,
      { correct: false, distractorId: "q-iri-d1" },
      noon,
    );
    expect(answered).toMatchObject({ effect: "introduce", state: { repetitions: 0, intervalDays: 1, due: "2026-10-08" } });
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([
      expect.objectContaining({ grade: 1, mode: "multiple-choice", chosenDistractor: `${courseDeck.cardsDocumentUrl}#q-iri-d1` }),
    ]);
  });

  it("answerCourseQuestion writes nothing for a right answer on a card graded today, and lapses it on a wrong one, without writing the card again", async () => {
    const { deps, useCases } = setup();
    const morning = stateOf(new Date(2026, 9, 7, 9, 0), "2026-10-08");
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(morning);
    await expect(useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: true }, noon)).resolves.toEqual({
      effect: "none",
      state: morning,
    });
    expect(deps.reviewStateRepository.saveReviewState).not.toHaveBeenCalled();
    // A wrong answer naming no option names none.
    await expect(
      useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: false }, noon),
    ).resolves.toMatchObject({ effect: "review", state: { repetitions: 0, firstReviewedAt: morning.firstReviewedAt } });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
  });

  it("completeChapter notes the chapter completed on the deck", async () => {
    const { deps, useCases } = setup();
    await expect(useCases.completeChapter(courseDeck, at("ch-1"))).resolves.toMatchObject({ completedChapters: [at("ch-1")] });
    expect(deps.deckRepository.completeChapter).toHaveBeenCalledWith(courseDeck, at("ch-1"));
  });

  it("planLibraryUpgrade adds no card to a course's deck, whichever release says it is a course", async () => {
    const { deps, useCases } = setup();
    const v2 = "https://solid-memo.com/decks/solid/v2.ttl";
    const plain = { ...release, isCourse: undefined };
    const next = { ...plain, url: v2, version: "2", cards: [...release.cards, { id: "q-new", front: { en: "New?" }, back: { en: "Yes" }, formatVersion: 5 }] };
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => (url === v2 ? next : plain));
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    const series = { ...course, url: v2, version: "2", releases: [...course.releases, { url: v2, version: "2" }] };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([series]);
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    // Only the release copied says it is a course.
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([{ ...series, isCourse: undefined }]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => (url === v2 ? next : release));
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    // Neither: a plain deck's upgrade adds the card.
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => (url === v2 ? next : plain));
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toMatchObject({ add: [{ id: "q-new" }] });
  });

  it("planLibraryUpgrade offers a course's deck a release that changes only the course's outline", async () => {
    const { deps, useCases } = setup();
    const v2 = "https://solid-memo.com/decks/solid/v2.ttl";
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => ({ ...release, url, version: url === v2 ? "2" : "1" }));
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      { ...course, url: v2, version: "2", releases: [...course.releases, { url: v2, version: "2" }] },
    ]);
    // The same outline in both: nothing to offer.
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(RELEASE);
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(v2);
    // A step's theory rewritten (in chunks, say): offered, though no card changes.
    const [first, ...rest] = outline.chapters;
    const [step, ...steps] = first!.steps;
    const rewritten: CourseOutline = {
      releaseUrl: v2,
      chapters: [{ ...first!, steps: [{ ...step!, theory: { en: "IRIs\n\n---\n\nname things." } }, ...steps] }, ...rest],
    };
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockImplementation(async (url) => (url === v2 ? rewritten : outline));
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toMatchObject({ toVersion: "2", change: [], outline: true });
  });
});
