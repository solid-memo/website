// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "./useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import {
  sameDeckState,
  withDeckChanges,
  type DeckUpgradeProgress,
} from "@solid-memo/domain/deckUpgrade";
import type { LibraryCard } from "@solid-memo/domain/library";
import { sm2s, instance, deck, libraryDeck, libraryContent, makeDeps } from "./testing/fakePorts";

describe("the deck library", () => {
  it("listLibraryDecks delegates to the deck library", async () => {
    const deps = makeDeps();
    await expect(createUseCases(deps).listLibraryDecks()).resolves.toEqual([libraryDeck]);
  });
  it("listLibraryCards fetches the deck and returns its cards", async () => {
    const deps = makeDeps();
    await expect(createUseCases(deps).listLibraryCards(libraryDeck)).resolves.toEqual(
      libraryContent.cards,
    );
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    expect(deps.deckRepository.importDeck).not.toHaveBeenCalled();
  });
  it("planLibraryUpgrade compares the release a copy came from with the deck's current one, and writes nothing", async () => {
    const deps = makeDeps();
    const copy: Deck = { ...deck, sourceUrl: libraryDeck.url };
    const current: LibraryDeck = {
      ...libraryDeck,
      url: "https://solid-memo.com/decks/capitals/v2.ttl",
      version: "2",
    };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      {
        ...libraryDeck,
        ...firstRelease("https://solid-memo.com/decks/rivers/v1.ttl"),
        url: "https://solid-memo.com/decks/rivers/v1.ttl",
      },
      current,
    ]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === current.url
        ? {
            ...libraryContent,
            url,
            version: "2",
            cards: [
              ...libraryContent.cards,
              { id: "norway", front: { "": "Norway" }, back: { "": "Oslo" }, formatVersion: 1 },
            ],
          }
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
  it("planLibraryUpgrade does not read the index again for a copy whose series is found", async () => {
    const deps = makeDeps();
    const copy: Deck = { ...deck, sourceUrl: libraryDeck.url };
    const current: LibraryDeck = {
      ...libraryDeck,
      url: "https://solid-memo.com/decks/capitals/v2.ttl",
      version: "2",
    };
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === current.url
        ? {
            ...libraryContent,
            url,
            version: "2",
            cards: [
              ...libraryContent.cards,
              { id: "norway", front: { "": "Norway" }, back: { "": "Oslo" }, formatVersion: 1 },
            ],
          }
        : libraryContent,
    );
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    const plan = createUseCases(deps).planLibraryUpgrade(copy, {
      deck: copy,
      series: current,
      version: "1",
      newer: true,
    });
    await expect(plan).resolves.toMatchObject({ toVersion: "2", add: [{ id: "norway" }] });
    expect(deps.deckLibrary.listLibraryDecks).not.toHaveBeenCalled();
    // A release from the library's index is not checked as one from a link is.
    expect(deps.shapeValidator.validateDocument).not.toHaveBeenCalled();
    await expect(
      createUseCases(deps).planLibraryUpgrade(copy, {
        deck: copy,
        series: null,
        version: null,
        newer: false,
      }),
    ).resolves.toBeNull();
  });
  it("planLibraryUpgrade plans a copy more than one release behind with the releases in between, whose cards are the library's", async () => {
    const deps = makeDeps();
    const LIB = "https://solid-memo.com/decks/capitals/";
    const backs = ["Stockholm?", "Stockholm", "Stockholm, Sweden"];
    const releases = backs.map((_, index) => ({
      url: `${LIB}v${index + 1}.ttl`,
      version: String(index + 1),
    }));
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      { ...libraryDeck, url: releases[2]!.url, version: "3", releases },
    ]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => {
      const index = releases.findIndex((release) => release.url === url);
      return {
        ...libraryContent,
        url,
        version: String(index + 1),
        cards: [{ ...libraryContent.cards[0]!, back: { "": backs[index]! } }],
      };
    });
    // Copied from release 1; an upgrade to release 2, cut off before it moved the deck's entry, wrote its card.
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
      {
        ...libraryContent.cards[0]!,
        back: { "": "Stockholm" },
        url: `${deck.cardsDocumentUrl}#sweden`,
        createdAt: "",
        formatVersion: 4,
      },
    ]);
    await expect(
      createUseCases(deps).planLibraryUpgrade({ ...deck, sourceUrl: releases[0]!.url }),
    ).resolves.toMatchObject({
      toVersion: "3",
      change: [{ id: "sweden", back: { "": "Stockholm, Sweden" } }],
      kept: [],
    });
    expect(
      vi
        .mocked(deps.deckLibrary.fetchLibraryDeck)
        .mock.calls.map(([url]) => url)
        .sort(),
    ).toEqual(releases.map((release) => release.url));
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
    await expect(
      createUseCases(deps).planLibraryUpgrade({ ...deck, sourceUrl: v2 }),
    ).resolves.toBeNull();
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    expect(deps.deckRepository.listCards).not.toHaveBeenCalled();
  });
  it("listLibraryUpdates lists the instance's copies from one read of the library's index, and reads none without a copy", async () => {
    const deps = makeDeps();
    const v2 = "https://solid-memo.com/decks/capitals/v2.ttl";
    const current: LibraryDeck = {
      ...libraryDeck,
      url: v2,
      version: "2",
      releases: [...libraryDeck.releases, { url: v2, version: "2" }],
    };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([current]);
    const old: Deck = { ...deck, url: `${deck.url}-old`, sourceUrl: libraryDeck.url };
    const fresh: Deck = { ...deck, url: `${deck.url}-fresh`, sourceUrl: v2 };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, old, fresh]);
    const useCases = createUseCases(deps);
    await expect(useCases.listLibraryUpdates(instance.url)).resolves.toEqual([
      { deck: old, series: current, version: "1", newer: true },
      { deck: fresh, series: current, version: "2", newer: false },
    ]);
    expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(instance.url);
    expect(deps.deckLibrary.listLibraryDecks).toHaveBeenCalledTimes(1);
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck]);
    await expect(useCases.listLibraryUpdates(instance.url)).resolves.toEqual([]);
    expect(deps.deckLibrary.listLibraryDecks).toHaveBeenCalledTimes(1);
  });
  it("addReleaseLanguages gives a copy the languages its release adds, and saves it; nothing for a home-made deck or nothing to add", async () => {
    const deps = makeDeps();
    const copy: Deck = { ...deck, title: { en: "Capitals" }, sourceUrl: libraryDeck.url };
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockResolvedValueOnce({
      ...libraryContent,
      title: { en: "Capitals", sv: "Huvudstäder" },
    });
    await expect(createUseCases(deps).addReleaseLanguages(copy)).resolves.toMatchObject({
      title: { en: "Capitals", sv: "Huvudstäder" },
    });
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledOnce();
    await expect(createUseCases(deps).addReleaseLanguages(copy)).resolves.toBeNull();
    await expect(
      createUseCases(deps).addReleaseLanguages({ ...deck, sourceUrl: undefined }),
    ).resolves.toBeNull();
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledOnce();
  });
  it("deckRelease reads the release a copy came from; none for a home-made deck", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.deckRelease({ ...deck, sourceUrl: libraryDeck.url })).resolves.toEqual(
      libraryContent,
    );
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    await expect(useCases.deckRelease({ ...deck, sourceUrl: undefined })).resolves.toBeNull();
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledOnce();
  });
  describe("a release added from a link", () => {
    const RELEASES = "https://bob.example/memo/releases/rivers/";
    const linked = (version: number, extra: Partial<LibraryDeck> = {}): LibraryDeck => ({
      ...libraryDeck,
      url: `${RELEASES}v${version}.ttl`,
      seriesUrl: `${RELEASES}v1.ttl#series`,
      version: String(version),
      releases: Array.from({ length: version }, (_, at) => ({
        url: `${RELEASES}v${at + 1}.ttl`,
        version: String(at + 1),
      })),
      ...extra,
    });
    const reading = (deps: ReturnType<typeof makeDeps>, releases: readonly LibraryDeck[]) =>
      vi.mocked(deps.deckLibrary.readRelease).mockImplementation(async (url) => {
        const found = releases.find((release) => release.url === url);
        if (found === undefined) throw new AppError("releaseUnreadable", { url });
        return found;
      });

    it("readReleaseFromLink reads the release and checks it against the library's shapes, as anyone, writing nothing", async () => {
      const deps = makeDeps();
      reading(deps, [linked(1)]);
      await expect(createUseCases(deps).readReleaseFromLink(`${RELEASES}v1.ttl`)).resolves.toEqual(
        linked(1),
      );
      expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
        `${RELEASES}v1.ttl`,
        "library",
      );
      expect(deps.deckRepository.importDeck).not.toHaveBeenCalled();
    });

    it("readReleaseFromLink reads a link as the URL standard writes it", async () => {
      const deps = makeDeps();
      reading(deps, [linked(1)]);
      await expect(
        createUseCases(deps).readReleaseFromLink(
          `https://Bob.example:443/memo/releases/rivers/v1.ttl`,
        ),
      ).resolves.toEqual(linked(1));
      expect(deps.deckLibrary.readRelease).toHaveBeenCalledWith(`${RELEASES}v1.ttl`);
    });

    it("readReleaseFromLink refuses text that is no release's address, before reading anything", async () => {
      const deps = makeDeps();
      await expect(createUseCases(deps).readReleaseFromLink("rivers")).rejects.toMatchObject({
        code: "releaseUrlInvalid",
      });
      expect(deps.deckLibrary.readRelease).not.toHaveBeenCalled();
    });

    it("readReleaseFromLink refuses a release that breaks its shapes, counting its violations, not its warnings", async () => {
      const deps = makeDeps();
      reading(deps, [linked(1)]);
      const violation = (severity: "violation" | "warning") => ({
        path: SM.front,
        message: { en: "Less than 1 values" },
        severity,
        constraint: "MinCount",
      });
      vi.mocked(deps.shapeValidator.validateDocument).mockResolvedValue({
        url: `${RELEASES}v1.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${RELEASES}v1.ttl#a`,
            status: "checked",
            shape: "card",
            version: 5,
            violations: [violation("violation"), violation("warning")],
          },
          {
            url: `${RELEASES}v1.ttl#b`,
            status: "checked",
            shape: "card",
            version: 5,
            violations: [{ ...violation("violation"), path: undefined }],
          },
          { url: `${RELEASES}v1.ttl#c`, status: "untyped" },
        ],
      });
      const refused = createUseCases(deps).readReleaseFromLink(`${RELEASES}v1.ttl`);
      await expect(refused).rejects.toMatchObject({
        code: "releaseNotConforming",
        vars: { host: "bob.example", count: 2 },
      });
      await expect(refused).rejects.toThrow("Less than 1 values");
    });

    it("importReleaseFromUrl imports a deck as the library's are, and starts a course once", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.importReleaseFromUrl(instance.url, linked(1))).resolves.toEqual(deck);
      expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(`${RELEASES}v1.ttl`);
      expect(deps.deckRepository.importDeck).toHaveBeenLastCalledWith(instance.url, libraryContent);
      await useCases.importReleaseFromUrl(instance.url, linked(1, { isCourse: true }));
      // The deck says it is a course, as one from the library does.
      expect(deps.deckRepository.importDeck).toHaveBeenLastCalledWith(instance.url, {
        ...libraryContent,
        isCourse: true,
        cards: [],
      });
      const started: Deck = { ...deck, sourceUrl: `${RELEASES}v1.ttl` };
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([started]);
      await expect(
        useCases.importReleaseFromUrl(instance.url, linked(2, { isCourse: true })),
      ).resolves.toEqual(started);
      expect(deps.deckRepository.importDeck).toHaveBeenCalledTimes(2);
    });

    it("listLibraryUpdates finds a newer version of a linked copy in its creator's catalog, else says it does not know", async () => {
      const deps = makeDeps();
      const elsewhere = linked(3, {
        url: "https://bob.example/memo/releases/lakes/v3.ttl",
        seriesUrl: "https://bob.example/memo/releases/lakes/v1.ttl#series",
      });
      reading(deps, [linked(1), linked(2), elsewhere]);
      const copy: Deck = { ...deck, sourceUrl: `${RELEASES}v1.ttl` };
      const gone: Deck = {
        ...deck,
        url: `${deck.url}-gone`,
        sourceUrl: "https://carol.example/v1.ttl",
      };
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([copy, gone]);
      vi.mocked(deps.deckLibrary.publishedBeside).mockResolvedValue([
        `${RELEASES}v1.ttl`,
        `${RELEASES}v2.ttl`,
        elsewhere.url,
        `${RELEASES}v9.ttl`,
      ]);
      const useCases = createUseCases(deps);
      await expect(useCases.listLibraryUpdates(instance.url)).resolves.toEqual([
        { deck: copy, series: linked(2), version: "1", newer: true, fromLink: true },
        { deck: gone, series: null, version: null, newer: false },
      ]);
      // Each release is read once, however many copies the catalog serves; none the copied one lists, which is no newer.
      const reads = vi.mocked(deps.deckLibrary.readRelease).mock.calls.map(([url]) => url);
      expect(reads).toEqual([
        `${RELEASES}v1.ttl`,
        "https://carol.example/v1.ttl",
        `${RELEASES}v2.ttl`,
        elsewhere.url,
        `${RELEASES}v9.ttl`,
      ]);
      vi.mocked(deps.deckLibrary.publishedBeside).mockResolvedValue(null);
      await expect(useCases.listLibraryUpdates(instance.url)).resolves.toEqual([
        { deck: copy, series: linked(1), version: "1", newer: "unknown", fromLink: true },
        { deck: gone, series: null, version: null, newer: false },
      ]);
      // Two copies the same catalog serves.
      const lakes: Deck = { ...deck, url: `${deck.url}-lakes`, sourceUrl: elsewhere.url };
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([copy, lakes]);
      vi.mocked(deps.deckLibrary.readRelease).mockClear();
      vi.mocked(deps.deckLibrary.publishedBeside).mockResolvedValue([
        `${RELEASES}v1.ttl`,
        `${RELEASES}v2.ttl`,
        elsewhere.url,
        `${RELEASES}v9.ttl`,
      ]);
      await expect(useCases.listLibraryUpdates(instance.url)).resolves.toEqual([
        { deck: copy, series: linked(2), version: "1", newer: true, fromLink: true },
        { deck: lakes, series: elsewhere, version: "3", newer: false, fromLink: true },
      ]);
      expect(vi.mocked(deps.deckLibrary.readRelease).mock.calls.map(([url]) => url)).toEqual([
        `${RELEASES}v1.ttl`,
        elsewhere.url,
        `${RELEASES}v2.ttl`,
        `${RELEASES}v9.ttl`,
      ]);
    });

    it("planLibraryUpgrade plans a linked copy against the newest version its creator's catalog lists, and offers nothing when it cannot be read", async () => {
      const deps = makeDeps();
      reading(deps, [linked(1), linked(2)]);
      const copy: Deck = { ...deck, sourceUrl: `${RELEASES}v1.ttl` };
      vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
        url === `${RELEASES}v2.ttl`
          ? {
              ...libraryContent,
              url,
              version: "2",
              cards: [
                ...libraryContent.cards,
                { id: "norway", front: { "": "Norway" }, back: { "": "Oslo" }, formatVersion: 1 },
              ],
            }
          : { ...libraryContent, url },
      );
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
      const useCases = createUseCases(deps);
      await expect(useCases.planLibraryUpgrade(copy)).resolves.toBeNull();
      vi.mocked(deps.deckLibrary.publishedBeside).mockResolvedValue([
        `${RELEASES}v1.ttl`,
        `${RELEASES}v2.ttl`,
      ]);
      await expect(useCases.planLibraryUpgrade(copy)).resolves.toMatchObject({
        fromVersion: "1",
        toVersion: "2",
        add: [{ id: "norway" }],
      });
      expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
        `${RELEASES}v2.ttl`,
        "library",
      );
    });

    it("planLibraryUpgrade refuses a linked copy's newer release, or one in between, that breaks the library's shapes", async () => {
      const deps = makeDeps();
      reading(deps, [linked(1), linked(2), linked(3)]);
      vi.mocked(deps.deckLibrary.publishedBeside).mockResolvedValue([
        `${RELEASES}v1.ttl`,
        `${RELEASES}v2.ttl`,
        `${RELEASES}v3.ttl`,
      ]);
      vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => ({
        ...libraryContent,
        url,
        version: url.slice(-5, -4),
      }));
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
      const broken = (bad: string) =>
        vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
          url,
          status: "checked",
          subjects:
            url === bad
              ? [
                  {
                    url: `${url}#a`,
                    status: "checked",
                    shape: "card",
                    version: 5,
                    violations: [
                      {
                        path: SM.front,
                        message: { en: "Less than 1 values" },
                        severity: "violation",
                        constraint: "MinCount",
                      },
                    ],
                  },
                ]
              : [],
        }));
      const copy: Deck = { ...deck, sourceUrl: `${RELEASES}v1.ttl` };
      const useCases = createUseCases(deps);
      for (const bad of [`${RELEASES}v3.ttl`, `${RELEASES}v2.ttl`]) {
        broken(bad);
        await expect(useCases.planLibraryUpgrade(copy)).rejects.toMatchObject({
          code: "releaseNotConforming",
          vars: { host: "bob.example", count: 1 },
        });
      }
      // Given the copy as the copies' look found it, its releases are checked all the same.
      await expect(
        useCases.planLibraryUpgrade(copy, {
          deck: copy,
          series: linked(3),
          version: "1",
          newer: true,
          fromLink: true,
        }),
      ).rejects.toMatchObject({ code: "releaseNotConforming" });
      expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalledWith(`${RELEASES}v2.ttl`);
    });
  });
  it("importLibraryDeck fetches the deck's content and imports it", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.importLibraryDeck(instance.url, libraryDeck)).resolves.toEqual(deck);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryDeck.url);
    expect(deps.deckRepository.importDeck).toHaveBeenCalledWith(instance.url, libraryContent);
  });
});

describe("library deck upgrade", () => {
  const LIB = "https://solid-memo.com/decks/capitals/";
  const libraryCard = (id: string, back: string): LibraryCard => ({
    id,
    front: { "": id },
    back: { "": back },
    formatVersion: 4,
  });
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
  }: {
    reviews?: ReviewState[];
    removesLatvia?: boolean;
  } = {}) {
    const deps = makeDeps();
    const v1: LibraryDeckContent = {
      ...libraryContent,
      url: `${LIB}v1.ttl`,
      seriesUrl: librarySeriesUrlOf(`${LIB}v1.ttl`),
      cards: [
        libraryCard("sweden", "Stockholm?"),
        libraryCard("denmark", "Copenhagen"),
        libraryCard("latvia", "Riga"),
      ],
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
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2.url ? v2 : v1,
    );
    const copy: Deck = { ...deck, title: { en: "Capitals" }, sourceUrl: v1.url };
    const toPodCard = (
      documentUrl: string,
      { formatVersion: _version, ...content }: LibraryCard | Card,
    ): Card => ({
      ...content,
      url: `${documentUrl}#${content.id}`,
      createdAt: "createdAt" in content ? content.createdAt : "2026-09-28T10:00:00.000Z",
      formatVersion: 4,
    });
    const pod = {
      deck: copy as Deck | null,
      cards: new Map<string, Card[]>([
        [copy.cardsDocumentUrl, v1.cards.map((c) => toPodCard(copy.cardsDocumentUrl, c))],
      ]),
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
    vi.mocked(repo.readDeck).mockImplementation(async (url) =>
      pod.deck?.url === url ? pod.deck : null,
    );
    vi.mocked(repo.listDecks).mockImplementation(async () => (pod.deck === null ? [] : [pod.deck]));
    vi.mocked(repo.listCards).mockImplementation(
      async (d) => pod.cards.get(d.cardsDocumentUrl) ?? [],
    );
    vi.mocked(repo.readCardsSince).mockImplementation(async (d, version) =>
      version === versionOf(d.cardsDocumentUrl)
        ? { unchanged: true }
        : {
            unchanged: false,
            value: pod.cards.get(d.cardsDocumentUrl) ?? [],
            version: versionOf(d.cardsDocumentUrl),
          },
    );
    vi.mocked(repo.applyCardChanges).mockImplementation(async (d, { save, remove }, options) => {
      const url = d.cardsDocumentUrl;
      if (options?.version !== undefined && options.version !== versionOf(url))
        throw new AppError("changedElsewhere", { url });
      const cards = new Map((pod.cards.get(url) ?? []).map((c) => [c.id, c]));
      for (const id of remove) cards.delete(id);
      for (const { retired, ...c } of save) {
        const { retired: _was, ...before } =
          cards.get(c.id) ?? toPodCard(url, { ...c, formatVersion: 4 });
        cards.set(c.id, {
          ...before,
          ...c,
          url: `${url}#${c.id}`,
          formatVersion: 4,
          ...(retired === true ? { retired } : {}),
        });
      }
      pod.cards.set(url, [...cards.values()]);
      wrote(url);
    });
    vi.mocked(repo.upgradeDeckEntry).mockImplementation(async (current, next) => {
      if (pod.deck === null || !sameDeckState(pod.deck, current))
        throw new AppError("deckChangedDuringUpgrade", { url: current.url });
      pod.deck = withDeckChanges(pod.deck, current, next);
      wrote(current.url);
      return pod.deck;
    });
    const reviewRepo = deps.reviewStateRepository;
    vi.mocked(reviewRepo.listReviewStates).mockImplementation(async (d) =>
      sm2s(pod.reviews.get(d.reviewsDocumentUrl) ?? []),
    );
    vi.mocked(reviewRepo.applyReviewChanges).mockImplementation(async (d, { remove }) => {
      const url = d.reviewsDocumentUrl;
      const dropped = new Set(remove.map((key) => `${key.cardId} ${key.direction}`));
      pod.reviews.set(
        url,
        (pod.reviews.get(url) ?? []).filter((s) => !dropped.has(`${s.cardId} ${s.direction}`)),
      );
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
    expect(plan).toMatchObject({
      add: [{ id: "norway" }],
      change: [{ id: "sweden" }],
      remove: [{ id: "latvia" }],
    });
    const progress: DeckUpgradeProgress[] = [];

    const outcome = await useCases.applyLibraryUpgrade(copy, plan, (p) => progress.push(p));

    expect(outcome).toEqual({
      ok: true,
      deck: { ...copy, sourceUrl: `${LIB}v2.ttl`, title: { en: "Capitals", sv: "Huvudstäder" } },
    });
    // Each document written once, where it is, in this order: what the deck is at is said last.
    expect(pod.written).toEqual([copy.cardsDocumentUrl, copy.reviewsDocumentUrl, copy.url]);
    // One PUT of the whole cards document, only while it is still at the version the plan read.
    expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
      copy,
      {
        save: [libraryCard("norway", "Oslo"), libraryCard("sweden", "Stockholm")],
        remove: ["latvia"],
      },
      { whole: true, version: "v0" },
    );
    expect(cardsOf(pod, copy.cardsDocumentUrl)).toEqual([
      ["sweden", "Stockholm", false],
      ["denmark", "Copenhagen", false],
      ["norway", "Oslo", false],
    ]);
    expect(pod.reviews.get(copy.reviewsDocumentUrl)).toEqual([reviewOf("sweden")]);
    expect(deps.deckRepository.upgradeDeckEntry).toHaveBeenCalledWith(
      copy,
      expect.objectContaining({ sourceUrl: `${LIB}v2.ttl` }),
    );
    // Nothing kept beside the deck: no copy, no backup, no note in the browser.
    expect(deps.deckRepository.deleteDocument).not.toHaveBeenCalled();
    expect(deps.updateJournal.begin).not.toHaveBeenCalled();
    expect(deps.shapeValidator.validateDocument).not.toHaveBeenCalled();
    expect(progress.map((p) => `${p.step} ${p.done}/${p.total}`)).toEqual([
      "read 0/4",
      "cards 1/4",
      "reviews 2/4",
      "entry 3/4",
      "entry 4/4",
    ]);
  });

  it("removes the removed cards' FSRS-6 states with their SM-2 states, in the same write", async () => {
    const { deps, copy, plan, useCases } = await world({ reviews: [reviewOf("sweden")] });
    const fsrsOf = (cardId: string): FsrsState => ({
      cardId,
      direction: "front-to-back",
      stability: 2,
      difficulty: 5,
      due: "2026-09-30",
      firstReviewedAt: "2026-09-28T08:00:00.000Z",
      lastReviewedAt: "2026-09-28T08:00:00.000Z",
      formatVersion: 1,
    });
    // Latvia has only an FSRS-6 state left (an orphan): it goes too.
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValueOnce({
      sm2: [reviewOf("sweden")],
      fsrs: [fsrsOf("sweden"), fsrsOf("latvia")],
    });
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ ok: true });
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(copy, {
      save: [],
      remove: [],
      fsrs: { save: [], remove: [fsrsOf("latvia")] },
    });
  });

  it("does not touch the reviews document when no card with review states is removed, nor read it when no card is", async () => {
    const kept = await world({ reviews: [reviewOf("sweden")] });
    await expect(kept.useCases.applyLibraryUpgrade(kept.copy, kept.plan)).resolves.toMatchObject({
      ok: true,
    });
    expect(kept.deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();

    const none = await world({ removesLatvia: false });
    await expect(none.useCases.applyLibraryUpgrade(none.copy, none.plan)).resolves.toMatchObject({
      ok: true,
    });
    expect(none.deps.reviewStateRepository.listReviewStates).not.toHaveBeenCalled();
  });

  it("writes no cards when none change, the deck's entry alone", async () => {
    const { deps, pod, copy, useCases, v2 } = await world();
    // Release 2 as the copy already has its cards, and only says the deck's name in Swedish too.
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2.url
        ? {
            ...v2,
            cards: pod.cards
              .get(copy.cardsDocumentUrl)!
              .map(({ url: _u, createdAt: _c, ...c }) => c),
          }
        : { ...v2, url, version: "1", title: { en: "Capitals" } },
    );
    const plan = (await useCases.planLibraryUpgrade(copy))!;
    expect(plan).toMatchObject({
      add: [],
      change: [],
      remove: [],
      title: { en: "Capitals", sv: "Huvudstäder" },
    });
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({ ok: true });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    expect(pod.written).toEqual([copy.url]);
  });

  it("refuses, writing nothing, when the deck no longer calls for what the user agreed to, has moved, or is gone", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    pod.cards.get(copy.cardsDocumentUrl)![0] = {
      ...pod.cards.get(copy.cardsDocumentUrl)![0],
      back: { "": "Mine" },
    };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toEqual({
      ok: false,
      step: "read",
      error: expect.objectContaining({ code: "deckChangedSinceOffer" }),
      changed: false,
    });
    pod.deck = { ...copy, cardsDocumentUrl: "elsewhere" };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({
      error: expect.objectContaining({ code: "deckChangedSinceOffer" }),
    });
    pod.deck = { ...copy, sourceUrl: undefined };
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({
      error: expect.objectContaining({ code: "deckChangedSinceOffer" }),
    });
    pod.deck = null;
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({
      error: expect.objectContaining({ code: "deckGone" }),
    });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    expect(pod.written).toEqual([]);
  });

  it("fails at reading when a read without a version answers unchanged", async () => {
    const { deps, copy, plan, useCases } = await world();
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({ unchanged: true });
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({
      ok: false,
      step: "read",
      changed: false,
    });
  });

  it("writes no cards over a document changed since the plan read it (412), and nothing after: the deck is as it was", async () => {
    const { deps, pod, copy, plan, useCases, wrote } = await world();
    // Another device edits the cards just after the upgrade read them.
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementationOnce(async (d) => {
      wrote(copy.cardsDocumentUrl);
      return sm2s(pod.reviews.get(d.reviewsDocumentUrl) ?? []);
    });
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({
      ok: false,
      step: "cards",
      error: new AppError("changedElsewhere", { url: copy.cardsDocumentUrl }),
      changed: false,
    });
    expect(cardsOf(pod, copy.cardsDocumentUrl).map(([id]) => id)).toEqual([
      "sweden",
      "denmark",
      "latvia",
    ]);
    expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    expect(deps.deckRepository.upgradeDeckEntry).not.toHaveBeenCalled();
    // A pod that gives no version holds the cards' write to none.
    const unversioned = await world();
    vi.mocked(unversioned.deps.deckRepository.readCardsSince).mockImplementation(async (d) => ({
      unchanged: false,
      value: unversioned.pod.cards.get(d.cardsDocumentUrl) ?? [],
      version: null,
    }));
    await expect(
      unversioned.useCases.applyLibraryUpgrade(unversioned.copy, unversioned.plan),
    ).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(unversioned.deps.deckRepository.applyCardChanges).mock.calls[0]![2]).toEqual({
      whole: true,
    });
  });

  it("says nothing changed when the deck's documents are refused before anything is sent: unclaimed, a deck that cannot be used, or an address the pod fence refuses", async () => {
    for (const code of ["deckDocumentUnclaimed", "deckGone", "writeRefused"] as const) {
      const { deps, copy, plan, useCases } = await world();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new AppError(code, { deck: copy.title }),
      );
      await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toEqual({
        ok: false,
        step: "cards",
        error: new AppError(code, { deck: copy.title }),
        changed: false,
      });
      expect(deps.deckRepository.upgradeDeckEntry).not.toHaveBeenCalled();
    }
  });

  it("stops where a write fails, nothing put back, and offered again it finishes, no card it wrote taken for the user's", async () => {
    const { deps, pod, copy, plan, useCases, v2 } = await world();
    vi.mocked(deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(
      new AppError("changedElsewhere", { url: copy.url }),
    );
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({
      ok: false,
      step: "entry",
      error: new AppError("changedElsewhere", { url: copy.url }),
      changed: true,
    });
    // The entry's write was refused, so it is not read again to tell whether it was made.
    expect(deps.deckRepository.readDeck).toHaveBeenCalledOnce();
    // The deck reads as its documents are: the newer release's cards, still naming the release it came from.
    expect(pod.deck).toEqual(copy);
    expect(cardsOf(pod, copy.cardsDocumentUrl).map(([id]) => id)).toEqual([
      "sweden",
      "denmark",
      "norway",
    ]);
    expect(pod.reviews.get(copy.reviewsDocumentUrl)).toEqual([reviewOf("sweden")]);

    // Offered again: the cards already as the release has them are the release's, not the user's.
    const again = (await useCases.planLibraryUpgrade(copy))!;
    expect(again).toMatchObject({
      releaseUrl: v2.url,
      add: [],
      change: [],
      remove: [],
      kept: [],
      gone: ["latvia"],
    });
    expect(again.applied.map((card) => card.id)).toEqual(["sweden", "norway"]);
    pod.written.length = 0;
    await expect(useCases.applyLibraryUpgrade(copy, again)).resolves.toMatchObject({
      ok: true,
      deck: { sourceUrl: v2.url },
    });
    // It finishes with the entry alone: the cards and the states are as the release has them already.
    expect(pod.written).toEqual([copy.url]);
    expect(await useCases.planLibraryUpgrade(pod.deck!)).toBeNull();
  });

  it("drops, when offered again, the states left of a card it removed before its write of the review states failed", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    vi.mocked(deps.reviewStateRepository.applyReviewChanges).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    await expect(useCases.applyLibraryUpgrade(copy, plan)).resolves.toMatchObject({
      ok: false,
      step: "reviews",
      changed: true,
    });
    expect(pod.reviews.get(copy.reviewsDocumentUrl)!.map((s) => s.cardId)).toEqual([
      "sweden",
      "latvia",
    ]);
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
    vi.mocked(refused.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
      new AppError("dataNotConforming", { problems: "x" }),
    );
    await expect(
      refused.useCases.applyLibraryUpgrade(refused.copy, refused.plan),
    ).resolves.toMatchObject({ ok: false, step: "cards", changed: false });
    // An answer lost on the way may follow a write the pod made.
    const lost = await world();
    vi.mocked(lost.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    await expect(lost.useCases.applyLibraryUpgrade(lost.copy, lost.plan)).resolves.toMatchObject({
      ok: false,
      step: "cards",
      changed: true,
    });
  });

  it("counts an entry's write whose answer was lost as done, when the entry says it happened", async () => {
    const { deps, pod, copy, plan, useCases } = await world();
    const upgradeEntry = vi.mocked(deps.deckRepository.upgradeDeckEntry).getMockImplementation()!;
    vi.mocked(deps.deckRepository.upgradeDeckEntry).mockImplementationOnce(
      async (current, next) => {
        await upgradeEntry(current, next);
        throw new TypeError("Failed to fetch");
      },
    );
    const outcome = await useCases.applyLibraryUpgrade(copy, plan);
    expect(outcome).toEqual({ ok: true, deck: pod.deck });
    expect(pod.deck).toMatchObject({ sourceUrl: `${LIB}v2.ttl` });

    // Not made, or not to be told (the entry cannot be read): the upgrade failed, its cards written.
    const lost = await world();
    vi.mocked(lost.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    await expect(lost.useCases.applyLibraryUpgrade(lost.copy, lost.plan)).resolves.toMatchObject({
      ok: false,
      step: "entry",
      changed: true,
    });
    const unread = await world();
    vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    const readDeck = vi.mocked(unread.deps.deckRepository.readDeck).getMockImplementation()!;
    vi.mocked(unread.deps.deckRepository.readDeck).mockImplementation(async (url) => {
      if (vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mock.calls.length > 0)
        throw new TypeError("offline");
      return readDeck(url);
    });
    await expect(
      unread.useCases.applyLibraryUpgrade(unread.copy, unread.plan),
    ).resolves.toMatchObject({ ok: false, step: "entry", changed: true });
    // The deck gone meanwhile: nothing to tell by.
    const gone = await world();
    vi.mocked(gone.deps.deckRepository.upgradeDeckEntry).mockImplementationOnce(async () => {
      gone.pod.deck = null;
      throw new TypeError("Failed to fetch");
    });
    await expect(gone.useCases.applyLibraryUpgrade(gone.copy, gone.plan)).resolves.toMatchObject({
      ok: false,
      step: "entry",
    });
  });

  it("says the deck may have changed when the entry, its only write, lost its answer and cannot be read", async () => {
    const entryOnly = async () => {
      const setup = await world();
      // Release 2 as the copy already has its cards: the upgrade writes the deck's entry alone.
      vi.mocked(setup.deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
        url === setup.v2.url
          ? {
              ...setup.v2,
              cards: setup.pod.cards
                .get(setup.copy.cardsDocumentUrl)!
                .map(({ url: _u, createdAt: _c, ...c }) => c),
            }
          : { ...setup.v2, url, version: "1", title: { en: "Capitals" } },
      );
      vi.mocked(setup.deps.deckRepository.upgradeDeckEntry).mockRejectedValueOnce(
        new TypeError("Failed to fetch"),
      );
      return { ...setup, plan: (await setup.useCases.planLibraryUpgrade(setup.copy))! };
    };
    // The entry read again still names the release the deck came from: its write was not made.
    const unmade = await entryOnly();
    await expect(
      unmade.useCases.applyLibraryUpgrade(unmade.copy, unmade.plan),
    ).resolves.toMatchObject({ ok: false, step: "entry", changed: false });
    // The entry cannot be read again: its write may have been made.
    const unread = await entryOnly();
    const readDeck = vi.mocked(unread.deps.deckRepository.readDeck).getMockImplementation()!;
    vi.mocked(unread.deps.deckRepository.readDeck).mockImplementation(async (url) => {
      if (vi.mocked(unread.deps.deckRepository.upgradeDeckEntry).mock.calls.length > 0)
        throw new TypeError("offline");
      return readDeck(url);
    });
    await expect(
      unread.useCases.applyLibraryUpgrade(unread.copy, unread.plan),
    ).resolves.toMatchObject({ ok: false, step: "entry", changed: true });
  });
});
