// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  type Card,
  type Deck,
} from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES, NEW_INSTANCE_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewState } from "@solid-memo/domain/review";
import { defaultCatalogDescription } from "@solid-memo/domain/catalog";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import {
  session,
  document,
  storage,
  catalog,
  sm2s,
  instance,
  deck,
  card,
  makeDeps,
} from "./testing/fakePorts";

describe("instances", () => {
  const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
  const changed = () => new AppError("changedElsewhere", { url: "x" });

  it("listStorages discovers storages for the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.listStorages(session)).resolves.toEqual([storage]);
    expect(deps.storageGateway.discoverStorages).toHaveBeenCalledWith(session.webId);
  });
  it("addManualStorage trims the URL before probing", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.addManualStorage("  https://alice.example/ ")).resolves.toEqual(storage);
    expect(deps.storageGateway.probeStorage).toHaveBeenCalledWith("https://alice.example/");
  });
  it("listInstances delegates with the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.listInstances(session)).resolves.toEqual([instance]);
    expect(deps.instanceRepository.listInstances).toHaveBeenCalledWith(session.webId);
  });
  it("getRegistrationOptions delegates with the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.getRegistrationOptions(session)).resolves.toEqual({
      privateIndexExists: true,
      publicIndexExists: false,
    });
    expect(deps.instanceRepository.getRegistrationOptions).toHaveBeenCalledWith(session.webId);
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
  it("createInstance states new preferences, FSRS-6 with the theme, the palette and the text size this device shows", async () => {
    const deps = makeDeps();
    const useCases = createUseCases({
      ...deps,
      themePreference: { chosen: () => "dark", choose: vi.fn() },
      palettePreference: { chosen: () => "high-contrast", choose: vi.fn() },
      textSizePreference: { chosen: () => "larger", choose: vi.fn() },
    });
    await useCases.createInstance(session, {
      containerUrl: "https://alice.example/solid-memo/main/",
      name: "Main",
      registrationTarget: "private",
    });
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(instance.url, {
      ...NEW_INSTANCE_PREFERENCES,
      theme: "dark",
      palette: "https://solid-memo.com/ns/vocab/v1.ttl#highContrastPalette",
      textSize: "larger",
    });
    expect(NEW_INSTANCE_PREFERENCES.scheduler).toBe("fsrs6");
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
    vi.mocked(deps.instanceRepository.deleteInstance).mockResolvedValue({
      keptFolder: instance.url,
      keptReleases: false,
      keptDocuments: [`${instance.url}catalog.ttl`],
    });
    const useCases = createUseCases(deps);
    await expect(useCases.deleteInstance(session, instance)).resolves.toEqual({
      keptFolder: instance.url,
      keptReleases: false,
      keptDocuments: [`${instance.url}catalog.ttl`],
    });
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
    await expect(useCases.dataClassRegistrations(session, instance)).resolves.toEqual(
      registrations,
    );
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
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (d) =>
        sm2s(d === other ? [oldReview("d")] : []),
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
        oldestFormat: { deck: DECK_FORMAT_VERSION, card: 1, reviewState: 1, preferences: 1 },
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
      const oldEntry: Deck = {
        ...other,
        reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`,
        formatVersion: 1,
      };
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
        sm2s(
          d.reviewsDocumentUrl.endsWith("reviews/deck-1.ttl")
            ? [oldReview("a"), { ...oldReview("b"), formatVersion: 2 }]
            : [],
        ),
      );
      vi.mocked(deps.instanceRepository.upgradeMeta).mockImplementation(async (url) => {
        written.push(`${url}meta.ttl`);
        return true;
      });
      vi.mocked(deps.preferencesRepository.upgradePreferences).mockImplementation(async (url) => {
        written.push(`${url}preferences.ttl`);
        return true;
      });
      vi.mocked(deps.deckRepository.upgradeCards).mockImplementation(async (d) => {
        written.push(d.cardsDocumentUrl);
        return true;
      });
      vi.mocked(deps.reviewStateRepository.upgradeReviewStates).mockImplementation(async (d) => {
        written.push(d.reviewsDocumentUrl);
        return true;
      });
      vi.mocked(deps.deckRepository.upgradeDecks).mockImplementation(async (url) => {
        written.push(`${url}catalog.ttl`);
        return true;
      });
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
        progress.push(
          `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
        ),
      );
      expect(outcome).toEqual({ updated: UPDATED, failed: [] });
      // Each document once, in this order: the record, the preferences, each deck's cards and review states, the catalog last.
      expect(written).toEqual(UPDATED.map((document) => document.url));
      expect(deps.deckRepository.upgradeCards).toHaveBeenCalledExactlyOnceWith(deck);
      expect(deps.reviewStateRepository.upgradeReviewStates).toHaveBeenCalledExactlyOnceWith(deck);
      // A catalog there is not written anew: only the outdated entries are.
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
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({
        ...oldMeta,
        formatVersion: 2,
      });
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: DEFAULT_PREFERENCES,
        formatVersion: 6,
      });
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([
        deck,
        { ...oldEntry, formatVersion: DECK_FORMAT_VERSION },
      ]);
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s([]));
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({
        updated: [UPDATED[2]],
        failed: [],
      });
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
      expect(
        await createUseCases(done).updateInstance(session, instance, (p) =>
          progress.push(`${p.step} ${p.part === undefined ? "" : "counted"}`),
        ),
      ).toEqual({
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
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(
        sm2s([oldReview("a")]),
      );
      // The first deck's part written, the second finds nothing left to write.
      vi.mocked(deps.deckRepository.upgradeCards)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      vi.mocked(deps.reviewStateRepository.upgradeReviewStates)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({
        updated: [UPDATED[2], UPDATED[3]],
        failed: [],
      });
      expect(vi.mocked(deps.deckRepository.upgradeCards).mock.calls).toEqual([[deck], [twin]]);
      expect(vi.mocked(deps.reviewStateRepository.upgradeReviewStates).mock.calls).toEqual([
        [deck],
        [twin],
      ]);

      // The second deck's part refused: the document is named, what the first part wrote stays.
      const refused = makeDeps();
      vi.mocked(refused.deckRepository.listDecks).mockResolvedValue([deck, twin]);
      vi.mocked(refused.deckRepository.listCards).mockResolvedValue([old("a")]);
      const error = new AppError("changedElsewhere", { url: CARDS });
      vi.mocked(refused.deckRepository.upgradeCards)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(error);
      expect(await createUseCases(refused).updateInstance(session, instance)).toEqual({
        updated: [],
        failed: [{ ...UPDATED[2], error }],
      });
    });

    it("updateInstance gives an instance without a catalog one, named as its record names it, published by the owner", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({
        ...oldMeta,
        formatVersion: 2,
      });
      vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
        url: document.url,
        subjects: [
          {
            url: session.webId,
            properties: [
              {
                predicate: "http://xmlns.com/foaf/0.1/name",
                values: [{ type: "literal", value: "Alice" }],
              },
            ],
          },
        ],
      } as WebIdDocument);
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({
        updated: [UPDATED[4]],
        failed: [],
      });
      expect(deps.deckRepository.upgradeDecks).toHaveBeenCalledExactlyOnceWith(instance.url, {
        title: "Main",
        description: "Flashcard decks of the Solid Memo instance Main.",
        publisher: { webId: session.webId, name: "Alice" },
      });

      const anonymous = makeDeps();
      vi.mocked(anonymous.deckRepository.readCatalog).mockResolvedValue(null);
      vi.mocked(anonymous.deckRepository.listCards).mockResolvedValue([]);
      vi.mocked(anonymous.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(
        new Error("offline"),
      );
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
      vi.mocked(deps.instanceRepository.registerDataClasses).mockRejectedValue(
        new Error("index refused"),
      );
      expect(await createUseCases(deps).updateInstance(session, instance)).toEqual({
        updated: UPDATED,
        failed: [],
      });
    });
  });
  describe("renameInstance", () => {
    const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 2 };

    it("writes the new name to the meta document, the catalog and the type index registrations", async () => {
      const deps = makeDeps();
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue(meta);
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue({
        ...catalog,
        description: defaultCatalogDescription("Main"),
      });
      const useCases = createUseCases(deps);
      await expect(useCases.renameInstance(session, instance, " Languages ")).resolves.toEqual({
        ...instance,
        name: "Languages",
      });
      expect(deps.instanceRepository.saveMeta).toHaveBeenCalledWith(instance.url, {
        ...meta,
        name: "Languages",
      });
      expect(deps.deckRepository.saveCatalog).toHaveBeenCalledWith(instance.url, {
        ...catalog,
        title: "Languages",
        description: defaultCatalogDescription("Languages"),
      });
      expect(deps.instanceRepository.renameRegistrations).toHaveBeenCalledWith({
        webId: session.webId,
        instanceUrl: instance.url,
        title: "Languages",
      });
    });

    it("writes only where the name is not yet the new one, and no catalog there is none of", async () => {
      const deps = makeDeps();
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue({ ...meta, name: "Languages" });
      vi.mocked(deps.deckRepository.readCatalog)
        .mockResolvedValueOnce({ ...catalog, title: "Languages" })
        .mockResolvedValueOnce(null);
      const useCases = createUseCases(deps);
      await useCases.renameInstance(session, instance, "Languages");
      await useCases.renameInstance(session, instance, "Languages");
      expect(deps.instanceRepository.saveMeta).not.toHaveBeenCalled();
      expect(deps.deckRepository.saveCatalog).not.toHaveBeenCalled();
      expect(deps.instanceRepository.renameRegistrations).toHaveBeenCalledTimes(2);
    });

    it("reads and writes each document again while it changes elsewhere", async () => {
      const deps = makeDeps();
      vi.mocked(deps.instanceRepository.readMeta).mockResolvedValue(meta);
      vi.mocked(deps.instanceRepository.saveMeta).mockRejectedValueOnce(changed());
      vi.mocked(deps.deckRepository.saveCatalog).mockRejectedValueOnce(changed());
      await createUseCases(deps).renameInstance(session, instance, "Languages");
      expect(deps.instanceRepository.readMeta).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.readCatalog).toHaveBeenCalledTimes(2);
      expect(deps.instanceRepository.renameRegistrations).toHaveBeenCalledOnce();
    });

    it("refuses an empty name, and an instance without a meta document, writing nothing", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.renameInstance(session, instance, " ")).rejects.toMatchObject({
        code: "instanceNameEmpty",
      });
      await expect(useCases.renameInstance(session, instance, "Languages")).rejects.toMatchObject({
        code: "noMetaToUpdate",
      });
      expect(deps.deckRepository.saveCatalog).not.toHaveBeenCalled();
      expect(deps.instanceRepository.renameRegistrations).not.toHaveBeenCalled();
    });
  });
  describe("the catalog", () => {
    it("is read as it is", async () => {
      await expect(createUseCases(makeDeps()).readCatalog(instance.url)).resolves.toEqual(catalog);
    });

    it("gets its description and license, of the catalog as it is now, again when it changed meanwhile", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.saveCatalog).mockRejectedValueOnce(changed());
      const useCases = createUseCases(deps);
      const described = { ...catalog, description: "Shared decks.", license: CC0 };
      await expect(
        useCases.describeCatalog(instance.url, { description: " Shared decks. ", license: CC0 }),
      ).resolves.toEqual(described);
      expect(deps.deckRepository.readCatalog).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.saveCatalog).toHaveBeenLastCalledWith(instance.url, described);
    });

    it("refuses an instance without one", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
      await expect(
        createUseCases(deps).describeCatalog(instance.url, { description: "x" }),
      ).rejects.toMatchObject({
        code: "noCatalogToUpdate",
      });
      expect(deps.deckRepository.saveCatalog).not.toHaveBeenCalled();
    });
  });
});
