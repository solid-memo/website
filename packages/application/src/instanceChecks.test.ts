// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { ReleaseDraftRepository } from "./ports";
import { createUseCases } from "./useCases";
import type { Card } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { instance, deck, libraryContent, makeDeps } from "./testing/fakePorts";
import { current, card2, setup } from "./testing/digestWorld";

describe("instance checks", () => {
  it("planRepair plans from a report, and applyRepairs hands the repairs to the repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    expect(
      useCases.planRepair({
        instanceUrl: instance.url,
        documents: [],
        violationCount: 0,
        conforms: true,
      }),
    ).toEqual({
      repairs: [],
      unrepairable: [],
    });
    const repairs = [
      { kind: "describe-deck" as const, documentUrl: "d", subjectUrl: "d#x", version: 3 },
    ];
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
                violations: [
                  { message: { en: "no title" }, severity: "violation", constraint: "MinCount" },
                ],
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
      `${instance.url}palettes.ttl`,
      `${instance.url}catalog.ttl`,
      deck.cardsDocumentUrl,
      deck.reviewsDocumentUrl,
    ]);
  });
  it("reports on an instance whose preferences cannot be read, rather than throw", async () => {
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockRejectedValue(
      new Error("preferences.ttl does not parse"),
    );
    vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
      url,
      status: "missing",
      subjects: [],
    }));
    const report = await createUseCases(deps).validateInstance(instance.url);
    expect(report.documents.map((d) => d.url)).toContain(`${instance.url}preferences.ttl`);
  });
  it("checks only documents changed since they conformed, by these rules", async () => {
    const urls = [
      `${instance.url}meta.ttl`,
      `${instance.url}preferences.ttl`,
      `${instance.url}palettes.ttl`,
      `${instance.url}catalog.ttl`,
      deck.cardsDocumentUrl,
      deck.reviewsDocumentUrl,
    ];
    const first = setup();
    await expect(first.useCases.checkInstance(instance.url)).resolves.toMatchObject({
      conforms: true,
    });
    await vi.waitFor(() => expect(Object.keys(first.stored()!.receipts)).toHaveLength(urls.length));
    expect(first.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(
      urls[0],
      undefined,
      "pod",
    );

    const digest = first.stored()!;
    const again = setup({
      ...digest,
      receipts: {
        ...digest.receipts,
        [urls[0]!]: { ...digest.receipts[urls[0]!]!, conformedTo: "older-rules" },
      },
    });
    const report = await again.useCases.checkInstance(instance.url);
    expect(report.documents.map((d) => d.subjects.length)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(again.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(
      urls[0],
      undefined,
      "pod",
    );
    expect(again.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(
      urls[1],
      `v-${urls[1]}`,
      "pod",
    );
  });
  it("checks the instance's drafts against the draft shapes, in the quick check and the full one", async () => {
    const drafts = [
      `${instance.url}drafts/solid/v1/release.ttl`,
      `${instance.url}drafts/solid/v1/cards.ttl`,
    ];
    const { deps } = setup();
    const releaseDraftRepository = {
      documents: vi.fn(async () => drafts),
    } as unknown as ReleaseDraftRepository;
    const useCases = createUseCases({ ...deps, releaseDraftRepository });
    const report = await useCases.checkInstance(instance.url);
    expect(report.documents.map((document) => document.url).slice(-2)).toEqual(drafts);
    expect(deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(
      drafts[0],
      undefined,
      "draft",
    );
    await useCases.validateInstance(instance.url);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(drafts[1], "draft");
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
      `${instance.url}catalog.ttl`,
      "pod",
    );
  });
  it("names the decks whose documents are unclaimed, and checks those documents not, in every check", async () => {
    const { deps, useCases } = setup();
    deps.deckRepository.unclaimedDocuments = vi.fn(async () => [deck.reviewsDocumentUrl]);
    const unclaimed = [
      {
        deckUrl: deck.url,
        title: deck.title,
        documents: [deck.reviewsDocumentUrl],
        outsidePod: [],
      },
    ];
    const quick = await useCases.checkInstance(instance.url);
    expect(quick.unclaimed).toEqual(unclaimed);
    expect(quick.documents.map((document) => document.url)).toContain(deck.cardsDocumentUrl);
    expect(quick.documents.map((document) => document.url)).not.toContain(deck.reviewsDocumentUrl);
    const full = await useCases.validateInstance(instance.url);
    expect(full.unclaimed).toEqual(unclaimed);
    expect(deps.shapeValidator.validateDocument).not.toHaveBeenCalledWith(
      deck.reviewsDocumentUrl,
      "pod",
    );
    const health = await useCases.checkDeck(instance.url, deck, {
      plain: (value) => value,
      check: () => [],
    });
    expect(health.report.unclaimed).toEqual(unclaimed);
    expect(
      vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls.map(([url]) => url),
    ).not.toContain(deck.reviewsDocumentUrl);
  });
  it("checks an unclaimed document in no spelling of its address", async () => {
    const { deps, useCases } = setup();
    const named = { ...deck, reviewsDocumentUrl: "https://ALICE.example/notes/n.ttl" };
    deps.deckRepository.listDecks = vi.fn(async () => [
      { ...named, cardsDocumentUrl: "https://alice.example/notes/n.ttl" },
    ]);
    deps.deckRepository.unclaimedDocuments = vi.fn(async () => [
      "https://alice.example/notes/n.ttl",
    ]);
    await useCases.checkInstance(instance.url);
    await useCases.validateInstance(instance.url);
    await useCases.checkDeck(
      instance.url,
      { ...named, cardsDocumentUrl: "https://alice.example:443/notes/n.ttl" },
      { plain: (value) => value, check: () => [] },
    );
    const checked = [
      ...vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls,
      ...vi.mocked(deps.shapeValidator.validateDocument).mock.calls,
    ].map(([url]) => url);
    expect(checked).toContain(`${instance.url}catalog.ttl`);
    expect(checked.filter((url) => url.includes("/notes/"))).toEqual([]);
  });
  describe("documents outside the instance's pod", () => {
    const ownElsewhere = "https://alice.example/notes/old-cards.ttl";
    const others = "https://bob.example/memo/";
    const place = { ...instance, url: others };
    const theirs = { ...deck, url: `${others}catalog.ttl#deck-1` };

    it("reports a document of the user's own that an instance from someone else's pod names, and refuses its claim", async () => {
      const { deps, useCases } = setup();
      deps.deckRepository.listDecks = vi.fn(async () => [theirs]);
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [
        ownElsewhere,
        `${others}cards.ttl`,
      ]);
      const report = await useCases.checkInstance(place.url);
      expect(report.unclaimed).toEqual([
        {
          deckUrl: theirs.url,
          title: theirs.title,
          documents: [ownElsewhere, `${others}cards.ttl`],
          outsidePod: [ownElsewhere],
        },
      ]);
      await expect(useCases.claimDeckDocuments(place.url, theirs.url)).rejects.toMatchObject({
        code: "claimOutsidePod",
        vars: { deck: theirs.title, url: ownElsewhere },
      });
      expect(deps.deckRepository.claimDocuments).not.toHaveBeenCalled();
    });

    it("reports them on the deck's own check too", async () => {
      const { deps, useCases } = setup();
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [ownElsewhere]);
      const health = await useCases.checkDeck(place.url, theirs, {
        plain: (value) => value,
        check: () => [],
      });
      expect(health.report.unclaimed).toEqual([
        {
          deckUrl: theirs.url,
          title: theirs.title,
          documents: [ownElsewhere],
          outsidePod: [ownElsewhere],
        },
      ]);
    });

    it("claims the documents of the user's own pod laid out in other folders, and those in another's instance's own folder", async () => {
      const { deps, useCases } = setup();
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [ownElsewhere]);
      const [named] = (await useCases.checkInstance(instance.url)).unclaimed!;
      expect(named!.outsidePod).toEqual([]);
      await useCases.claimDeckDocuments(instance.url, deck.url);
      expect(deps.deckRepository.claimDocuments).toHaveBeenCalledWith(deck);

      deps.deckRepository.listDecks = vi.fn(async () => [theirs]);
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [`${others}cards.ttl`]);
      await useCases.claimDeckDocuments(place.url, theirs.url);
      expect(deps.deckRepository.claimDocuments).toHaveBeenCalledWith(theirs);
    });

    it("refuses a claim that the user's storages cannot be found for, outside the instance's folder", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.storageGateway.discoverStorages).mockRejectedValue(new Error("offline"));
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [ownElsewhere]);
      await expect(useCases.claimDeckDocuments(instance.url, deck.url)).rejects.toMatchObject({
        code: "claimOutsidePod",
      });
      expect(deps.deckRepository.claimDocuments).not.toHaveBeenCalled();
    });

    it("with no one signed in, keeps a claim to the instance's own folder", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.webId).mockReturnValue(undefined);
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [ownElsewhere]);
      await expect(useCases.claimDeckDocuments(instance.url, deck.url)).rejects.toMatchObject({
        code: "claimOutsidePod",
      });
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [deck.reviewsDocumentUrl]);
      await useCases.claimDeckDocuments(instance.url, deck.url);
      expect(deps.deckRepository.claimDocuments).toHaveBeenCalledTimes(1);
      expect(deps.storageGateway.discoverStorages).not.toHaveBeenCalled();
    });

    it("looks for the user's storages once in a check, however many decks name such a document", async () => {
      const { deps, useCases } = setup();
      deps.deckRepository.listDecks = vi.fn(async () => [
        deck,
        { ...deck, url: `${instance.url}catalog.ttl#deck-2` },
      ]);
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [ownElsewhere]);
      vi.mocked(deps.storageGateway.discoverStorages).mockClear();
      await useCases.validateInstance(instance.url);
      expect(deps.storageGateway.discoverStorages).toHaveBeenCalledTimes(1);
    });
  });
  it("claims a deck's documents as the user confirmed, a deck of the instance only", async () => {
    const { deps, useCases } = setup();
    await useCases.claimDeckDocuments(instance.url, deck.url);
    expect(deps.deckRepository.claimDocuments).toHaveBeenCalledWith(deck);
    await expect(
      useCases.claimDeckDocuments(instance.url, `${instance.url}catalog.ttl#deck-other`),
    ).rejects.toMatchObject({ code: "deckGone" });
    expect(deps.deckRepository.claimDocuments).toHaveBeenCalledTimes(1);
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
  it("keeps a receipt only of the instance's documents, for an instance from someone else's pod (GHSA-3cq7-479g-rwc8)", async () => {
    const foreign = "https://mallory.example/memo/";
    const { deps, useCases, stored } = setup();
    // Its catalog names a deck whose documents are in the user's own storage.
    deps.deckRepository.listDecks = vi.fn(async () => [deck]);
    await useCases.checkInstance(foreign);
    await vi.waitFor(() => expect(stored()?.receipts[`${foreign}catalog.ttl`]).toBeDefined());
    expect(stored()!.receipts[deck.cardsDocumentUrl]).toBeUndefined();
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toBeUndefined();
  });
  describe("checkDeck", () => {
    const text = {
      plain: (value: string) => value.replace(/\*/g, ""),
      check: (value: string) => (value.includes("<") ? [{ code: "html" }] : []),
    };
    const unstated: Card = { ...current, front: { "": "水" }, back: { en: "water" } };
    const twin: Card = { ...unstated, id: "card-3", url: `${deck.cardsDocumentUrl}#card-3` };
    const marked: Card = {
      ...card2,
      front: { en: "<b>x</b>" },
      back: { en: "x" },
      textFormat: SM.markdown,
    };

    it("checks the deck's entry and documents as the instance's check does, its cards' languages, twins and Markdown", async () => {
      const { deps, useCases } = setup();
      deps.deckRepository.listCards = vi.fn(async () => [unstated, twin, marked]);
      const health = await useCases.checkDeck(instance.url, deck, text);
      expect(
        vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls.map(([url]) => url),
      ).toEqual([`${instance.url}catalog.ttl`, deck.cardsDocumentUrl, deck.reviewsDocumentUrl]);
      expect(health.report.conforms).toBe(true);
      expect(health.unstated!.map(({ card }) => card.id)).toEqual(["card-1", "card-3"]);
      expect(health.duplicates.map((group) => group.map(({ id }) => id))).toEqual([
        ["card-1", "card-3"],
      ]);
      expect(health.markdown.map(({ card, finding }) => [card.id, finding.code])).toEqual([
        ["card-2", "html"],
      ]);
      expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    });

    it("leaves out the cards still as the deck's release has them, and does not know them while it cannot be read", async () => {
      const { deps, useCases } = setup();
      const copy = { ...deck, sourceUrl: libraryContent.url };
      deps.deckRepository.listCards = vi.fn(async () => [unstated, twin]);
      deps.deckLibrary.fetchLibraryDeck = vi.fn(
        async () =>
          ({ ...libraryContent, cards: [{ ...unstated, distractors: [] }] }) as LibraryDeckContent,
      );
      expect(
        (await useCases.checkDeck(instance.url, copy, text)).unstated!.map(({ card }) => card.id),
      ).toEqual(["card-3"]);
      deps.deckLibrary.fetchLibraryDeck = vi.fn(async () => {
        throw new Error("offline");
      });
      const health = await useCases.checkDeck(instance.url, copy, text);
      expect(health.unstated).toBeNull();
      expect(health.duplicates).toHaveLength(1);
    });
  });
});
