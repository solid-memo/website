// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { ReadBudget, ReleaseDraftRepository, SharedReads } from "./ports";
import { createUseCases } from "./useCases";
import type { Card } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { deckReport } from "@solid-memo/domain/deckHealth";
import { deckSetAside, unreadableDocument } from "@solid-memo/domain/validation";
import { AppError } from "@solid-memo/domain/appError";
import { instance, deck, libraryContent, makeDeps } from "./testing/fakePorts";
import { current, card2, setup } from "./testing/digestWorld";

/** How many addresses the code under test brings to the form a request sends (canonicalUrlOf) or compares (isSameUrl). */
const urlWork = vi.hoisted(() => ({ count: 0 }));
vi.mock("@solid-memo/domain/instanceLayout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solid-memo/domain/instanceLayout")>();
  return {
    ...actual,
    canonicalUrlOf: (text: string) => {
      urlWork.count += 1;
      return actual.canonicalUrlOf(text);
    },
    isSameUrl: (a: string, b: string) => {
      urlWork.count += 2;
      return actual.isSameUrl(a, b);
    },
  };
});

describe("instance checks", () => {
  describe("a deck's document with a problem", () => {
    const failing = {
      url: deck.cardsDocumentUrl,
      status: "checked" as const,
      subjects: [
        {
          url: deck.cardsDocumentUrl,
          status: "checked" as const,
          shape: "deck" as const,
          version: 6,
          violations: [
            {
              severity: "violation" as const,
              message: { en: "No." },
              constraint: "MinCount",
            },
          ],
        },
      ],
    };
    const text = { plain: (value: string) => value, check: () => [] };
    function reportingFailure() {
      const deps = makeDeps();
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
        url === deck.cardsDocumentUrl ? failing : { url, status: "checked", subjects: [] },
      );
      return { deps, useCases: createUseCases(deps) };
    }

    it("is left out once its read shows it is no deck's", async () => {
      const { deps, useCases } = reportingFailure();
      deps.deckRepository.isUnclaimedAsRead = vi.fn(async () => true);
      for (const report of [
        await useCases.validateInstance(instance.url),
        await useCases.checkInstance(instance.url),
        (await useCases.checkDeck(instance.url, deck, text)).report,
      ]) {
        expect(report.documents.map((one) => one.url)).not.toContain(deck.cardsDocumentUrl);
        expect(report.conforms).toBe(true);
      }
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledWith(
        [deck],
        deck.cardsDocumentUrl,
        undefined,
        undefined,
      );
    });

    it("stays in the report while it is a deck's", async () => {
      const { useCases } = reportingFailure();
      const report = await useCases.checkInstance(instance.url);
      expect(report.conforms).toBe(false);
      expect(report.documents.map((one) => one.url)).toContain(deck.cardsDocumentUrl);
    });

    it("is read with every deck naming it, in any spelling", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      const twice = { ...deck, reviewsDocumentUrl: deck.cardsDocumentUrl };
      const unusable = {
        ...deck,
        url: `${deck.url}-2`,
        cardsDocumentUrl: "no url",
        reviewsDocumentUrl: deck.cardsDocumentUrl,
      };
      deps.deckRepository.listDecks = vi.fn(async () => [twice, unusable]);
      const catalog = `${instance.url}catalog.ttl`;
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
        url === deck.cardsDocumentUrl
          ? { ...failing, url: url.replace("https://", "HTTPS://") }
          : url === catalog
            ? { ...failing, url: "no url" }
            : { url, status: "checked", subjects: [] },
      );
      await useCases.checkInstance(instance.url);
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledWith(
        [twice, unusable],
        deck.cardsDocumentUrl.replace("https://", "HTTPS://"),
        undefined,
        expect.any(Function),
      );
    });

    it("is checked and read once however many decks name it, in whatever spelling, and reported under each", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      const spelled = deck.cardsDocumentUrl.replace("alice.example", "ALICE.example");
      const decks = Array.from({ length: 4 }, (_, index) => ({
        ...deck,
        id: `deck-${index}`,
        url: `${deck.url}-${index}`,
        cardsDocumentUrl: index === 3 ? spelled : deck.cardsDocumentUrl,
      }));
      deps.deckRepository.listDecks = vi.fn(async () => decks);
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
        url === deck.cardsDocumentUrl ? failing : { url, status: "checked", subjects: [] },
      );
      const onChecked = vi.fn();
      for (const report of [
        await useCases.checkInstance(instance.url),
        await useCases.validateInstance(instance.url, onChecked),
      ]) {
        // The document once, its problems counted once, the other spelling named of it.
        const reported = report.documents.filter((one) => one.subjects.length > 0);
        expect(reported.map((one) => one.url)).toEqual([deck.cardsDocumentUrl]);
        expect(report.violationCount).toBe(1);
        expect(report.spellings).toEqual([{ url: spelled, of: deck.cardsDocumentUrl }]);
        for (const one of decks) expect(deckSetAside(report, one)).toBe(true);
        // Each deck's own report has the document, under the address it names.
        const own = deckReport(report, decks[3]!);
        expect(own.documents.find((one) => one.url === spelled)?.subjects).toBe(failing.subjects);
        expect(own.violationCount).toBe(1);
      }
      expect(
        vi
          .mocked(deps.shapeValidator.validateDocument)
          .mock.calls.filter(([url]) => url === deck.cardsDocumentUrl),
      ).toHaveLength(2);
      expect(
        vi
          .mocked(deps.shapeValidator.validateDocument)
          .mock.calls.filter(([url]) => url === spelled),
      ).toHaveLength(0);
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledWith(
        decks,
        deck.cardsDocumentUrl,
        undefined,
        undefined,
      );
      // The catalog, the preferences, the palettes, the meta document, the cards and the reviews: each once.
      expect(onChecked).toHaveBeenLastCalledWith(6, 6);
    });

    it("is not read again when it conforms, nor when no deck names it", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      const catalog = `${instance.url}catalog.ttl`;
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
        url === catalog ? { ...failing, url } : { url, status: "checked", subjects: [] },
      );
      await useCases.checkInstance(instance.url);
      expect(deps.deckRepository.isUnclaimedAsRead).not.toHaveBeenCalled();
    });
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
      undefined,
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
      undefined,
    );
    expect(again.deps.shapeValidator.validateDocumentSince).toHaveBeenCalledWith(
      urls[1],
      `v-${urls[1]}`,
      "pod",
      undefined,
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
      undefined,
    );
    await useCases.validateInstance(instance.url);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
      drafts[1],
      "draft",
      undefined,
    );
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
      `${instance.url}catalog.ttl`,
      "pod",
      undefined,
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
  it("settles a check within one budget for reading documents on servers that answer slowly, however many the catalog names: those not read by then count as unclaimed", async () => {
    const { deps, useCases } = setup();
    const many = Array.from({ length: 1000 }, (_, at) => ({
      ...deck,
      id: `slow-${at}`,
      url: `${instance.url}catalog.ttl#slow-${at}`,
      cardsDocumentUrl: `https://slow.example/${at}/cards.ttl`,
      reviewsDocumentUrl: `https://slow.example/${at}/reviews.ttl`,
    }));
    deps.deckRepository.listDecks = vi.fn(async () => many);
    // Each read outside the instance ends only when the budget is spent, as the adapter's does (deckPlace.ts).
    deps.deckRepository.unclaimedDocuments = vi.fn(async (one, budget) =>
      budget!.spend([one.cardsDocumentUrl, one.reviewsDocumentUrl], () => new Promise(() => {})),
    );
    vi.useFakeTimers();
    try {
      const check = useCases.checkInstance(instance.url);
      let settled = false;
      void check.finally(() => (settled = true));
      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await check).unclaimed).toHaveLength(1000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("checks the documents outside the instance's folder within that same budget, in every check: those not read by then are unreadable, and the check settles", async () => {
    const { deps, useCases } = setup();
    const outside = {
      ...deck,
      cardsDocumentUrl: "https://slow.example/cards.ttl",
      reviewsDocumentUrl: "https://slow.example/reviews.ttl",
    };
    deps.deckRepository.listDecks = vi.fn(async () => [outside]);
    // Claimed at once, then read again with no end, as a server that drips its answer may make it.
    const stalled = <T>(budget: ReadBudget, value: T) =>
      budget.spend(value, () => new Promise<T>(() => {}));
    const budgets: (ReadBudget | undefined)[] = [];
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url, _version, _context, budget) => {
      budgets.push(budget);
      if (budget === undefined)
        return {
          unchanged: false as const,
          value: { url, status: "checked" as const, subjects: [] },
          version: null,
        };
      return stalled(budget, {
        unchanged: false as const,
        value: unreadableDocument(url, "podNoAnswer"),
        version: null,
      });
    });
    deps.shapeValidator.validateDocument = vi.fn(async (url, _context, budget) => {
      budgets.push(budget);
      return budget === undefined
        ? { url, status: "checked" as const, subjects: [] }
        : stalled(budget, unreadableDocument(url, "podNoAnswer"));
    });
    // Read again, it would be found unclaimed, but the budget is spent by then.
    deps.deckRepository.isUnclaimedAsRead = vi.fn(async (_decks, _url, budget) =>
      budget === undefined ? true : budget.spend(false, async () => true),
    );
    vi.useFakeTimers();
    try {
      for (const run of [
        () => useCases.checkInstance(instance.url),
        () => useCases.validateInstance(instance.url),
        async () => {
          // As the deck's health is opened: not what the instance's check found.
          useCases.forgetDeckCheck(instance.url, outside);
          return (
            await useCases.checkDeck(instance.url, outside, {
              plain: (value) => value,
              check: () => [],
            })
          ).report;
        },
      ]) {
        budgets.length = 0;
        const check = run();
        let settled = false;
        void check.finally(() => (settled = true));
        await vi.advanceTimersByTimeAsync(59_999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const report = await check;
        expect(
          report.documents.filter(({ status }) => status === "unreadable").map(({ url }) => url),
        ).toEqual([outside.cardsDocumentUrl, outside.reviewsDocumentUrl]);
        expect(deckSetAside(report, outside)).toBe(true);
        // The instance's own documents are read as before, the others within one budget.
        expect(budgets.filter((budget) => budget !== undefined)).toHaveLength(2);
        expect(new Set(budgets.filter((budget) => budget !== undefined)).size).toBe(1);
        expect(budgets).toContain(undefined);
        expect(vi.getTimerCount()).toBe(0);
      }
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledWith(
        [outside],
        outside.cardsDocumentUrl,
        expect.objectContaining({ spend: expect.any(Function) }),
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("spends the budget only while a document outside the instance's folder is read: slow reads of the instance's own documents leave those outside checked, in every check", async () => {
    const { deps, useCases } = setup();
    const outside = {
      ...deck,
      id: "outside",
      url: `${instance.url}catalog.ttl#outside`,
      cardsDocumentUrl: "https://elsewhere.example/cards.ttl",
      reviewsDocumentUrl: "https://elsewhere.example/reviews.ttl",
    };
    deps.deckRepository.listDecks = vi.fn(async () => [deck, outside]);
    const later = <T>(ms: number, value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
    // The instance's own documents take far longer in all than the budget; those outside answer at once.
    const SLOW_MS = 100_000;
    const FAST_MS = 1_000;
    deps.deckRepository.unclaimedDocuments = vi.fn(async (one, budget) =>
      one === outside
        ? budget!.spend([one.cardsDocumentUrl, one.reviewsDocumentUrl], () => later(FAST_MS, []))
        : later(SLOW_MS, []),
    );
    const checked = (url: string) => ({ url, status: "checked" as const, subjects: [] });
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url, _version, _context, budget) =>
      budget === undefined
        ? later(SLOW_MS, { unchanged: false as const, value: checked(url), version: null })
        : budget.spend(
            {
              unchanged: false as const,
              value: unreadableDocument(url, "podNoAnswer"),
              version: null,
            },
            () => later(FAST_MS, { unchanged: false as const, value: checked(url), version: null }),
          ),
    );
    deps.shapeValidator.validateDocument = vi.fn(async (url, _context, budget) =>
      budget === undefined
        ? later(SLOW_MS, checked(url))
        : budget.spend(unreadableDocument(url, "podNoAnswer"), () => later(FAST_MS, checked(url))),
    );
    vi.useFakeTimers();
    try {
      for (const run of [
        () => useCases.checkInstance(instance.url),
        () => useCases.validateInstance(instance.url),
        async () => {
          // As the deck's health is opened: not what the instance's check found.
          useCases.forgetDeckCheck(instance.url, outside);
          return (
            await useCases.checkDeck(instance.url, outside, {
              plain: (value) => value,
              check: () => [],
            })
          ).report;
        },
      ]) {
        const check = run();
        await vi.advanceTimersByTimeAsync(10 * SLOW_MS);
        const report = await check;
        expect(report.documents.filter(({ status }) => status === "unreadable")).toEqual([]);
        expect(report.documents.map(({ url }) => url)).toEqual(
          expect.arrayContaining([outside.cardsDocumentUrl, outside.reviewsDocumentUrl]),
        );
        expect(report.unclaimed).toBeUndefined();
        expect(deckSetAside(report, outside)).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.useRealTimers();
    }
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
  it("checks an unclaimed document in no spelling a server reads as its address", async () => {
    const { deps, useCases } = setup();
    const named = { ...deck, cardsDocumentUrl: "https://alice.example/notes/n%28a%29%21.ttl" };
    deps.deckRepository.listDecks = vi.fn(async () => [named]);
    deps.deckRepository.unclaimedDocuments = vi.fn(async () => [
      "https://alice.example/notes/n(a)!.ttl",
    ]);
    await useCases.validateInstance(instance.url);
    await useCases.checkDeck(instance.url, named, { plain: (value) => value, check: () => [] });
    const checked = [
      ...vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls,
      ...vi.mocked(deps.shapeValidator.validateDocument).mock.calls,
    ].map(([url]) => url);
    expect(checked).toContain(deck.reviewsDocumentUrl);
    expect(checked.filter((url) => url.includes("/notes/"))).toEqual([]);
  });
  it("checks an unclaimed document in no case a file system that ignores case stores as one", async () => {
    const { deps, useCases } = setup();
    const named = { ...deck, cardsDocumentUrl: "https://alice.example/notes/Notes.TTL" };
    deps.deckRepository.listDecks = vi.fn(async () => [named]);
    deps.deckRepository.unclaimedDocuments = vi.fn(async () => [
      "https://alice.example/notes/notes.ttl",
    ]);
    await useCases.validateInstance(instance.url);
    await useCases.checkDeck(instance.url, named, { plain: (value) => value, check: () => [] });
    const checked = [
      ...vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls,
      ...vi.mocked(deps.shapeValidator.validateDocument).mock.calls,
    ].map(([url]) => url);
    expect(checked).toContain(deck.reviewsDocumentUrl);
    expect(checked.filter((url) => url.includes("/notes/"))).toEqual([]);
  });
  it("checks an address that is no URL, unclaimed or not", async () => {
    const { deps, useCases } = setup();
    const named = { ...deck, cardsDocumentUrl: "no url" };
    deps.deckRepository.unclaimedDocuments = vi.fn(async () => ["also no url"]);
    await useCases.checkDeck(instance.url, named, { plain: (value) => value, check: () => [] });
    expect(
      vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls.map(([url]) => url),
    ).toEqual(expect.arrayContaining(["no url", deck.reviewsDocumentUrl]));
  });
  it("skips the unclaimed documents of many decks in work that grows with their number, not its square", async () => {
    const unclaimedWork = async (count: number) => {
      const { deps, useCases } = setup();
      const decks = Array.from({ length: count }, (_, index) => ({
        ...deck,
        id: `deck-${index}`,
        url: `${instance.url}catalog.ttl#deck-${index}`,
        cardsDocumentUrl: `https://elsewhere.example/c${index}.ttl`,
        reviewsDocumentUrl: `https://elsewhere.example/r${index}.ttl`,
      }));
      deps.deckRepository.listDecks = vi.fn(async () => decks);
      deps.deckRepository.unclaimedDocuments = vi.fn(async (one) => [
        one.cardsDocumentUrl,
        one.reviewsDocumentUrl,
      ]);
      urlWork.count = 0;
      const report = await useCases.checkInstance(instance.url);
      const work = urlWork.count;
      expect(report.unclaimed).toHaveLength(count);
      expect(
        vi.mocked(deps.shapeValidator.validateDocumentSince).mock.calls.map(([url]) => url),
      ).not.toContain(decks[0]!.cardsDocumentUrl);
      return work;
    };
    const few = await unclaimedWork(100);
    // Ten times the decks, about ten times the work; comparing every pair would be about a hundred.
    expect(await unclaimedWork(1000)).toBeLessThan(few * 20);
  });
  describe("documents outside the instance's folder and any storage of the user's that holds it", () => {
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

    it("claims documents elsewhere in a storage of the user's found to hold the instance, and those in another's instance's own folder", async () => {
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
  // One document the check cannot read is in the report: it fails neither the check nor another deck.
  it("reports a deck's document the check could not read, and sets aside only that deck", async () => {
    const { deps, useCases, stored } = setup();
    const other = {
      ...deck,
      id: "other",
      url: `${instance.url}catalog.ttl#other`,
      cardsDocumentUrl: `${instance.url}decks/other.ttl`,
      reviewsDocumentUrl: `${instance.url}reviews/other.ttl`,
    };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, other]);
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value:
        url === deck.reviewsDocumentUrl
          ? unreadableDocument(url, "403 Forbidden")
          : { url, status: "checked" as const, subjects: [] },
      version: url === deck.reviewsDocumentUrl ? null : `v-${url}`,
    }));
    const report = await useCases.checkInstance(instance.url);
    expect(report).toMatchObject({ violationCount: 1, conforms: false });
    expect(report.documents.find((d) => d.url === deck.reviewsDocumentUrl)).toMatchObject({
      status: "unreadable",
      reason: "403 Forbidden",
    });
    expect(deckSetAside(report, deck)).toBe(true);
    expect(deckSetAside(report, other)).toBe(false);
    // A receipt of each document read, none of the one that could not be.
    await vi.waitFor(() => expect(stored()?.receipts[other.cardsDocumentUrl]).toBeDefined());
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toBeUndefined();
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

  describe("decks that share a document (GHSA-pgw5-wjgx-h9vv)", () => {
    const text = { plain: (value: string) => value, check: () => [] };
    const catalog = `${instance.url}catalog.ttl`;
    const failing = (url: string, message = "No.") => ({
      url,
      status: "checked" as const,
      subjects: [
        {
          url: `${url}#card-1`,
          status: "checked" as const,
          shape: "card" as const,
          version: 1,
          violations: [
            { severity: "violation" as const, message: { en: message }, constraint: "MinCount" },
          ],
        },
      ],
    });
    const decks = Array.from({ length: 5 }, (_, index) => ({
      ...deck,
      id: `deck-${index}`,
      url: `${catalog}#deck-${index}`,
    }));
    /**
     * A pod whose documents are at a version each, answering unchanged on
     * that version; `checked` counts the checks made of each. A server may
     * give that version as it is (`sent`), give none, one too long to send
     * again or not quoted (so a read is never on condition), or a new one
     * on every read.
     */
    function sharing(sent: "as is" | "none" | "long" | "unquoted" | "new each read" = "as is") {
      const deps = makeDeps();
      const versions = new Map<string, number>();
      const checked = new Map<string, number>();
      let reads = 0;
      const tagOf = (url: string): string | null => {
        const at = versions.get(url) ?? 1;
        if (sent === "none") return null;
        if (sent === "long") return `"${"v".repeat(600)}${at}"`;
        if (sent === "unquoted") return `v${at}`;
        if (sent === "new each read") return `"v${at}-${++reads}"`;
        return `"v${at}"`;
      };
      vi.mocked(deps.shapeValidator.validateDocumentSince).mockImplementation(
        async (url, version) => {
          const now = `v${versions.get(url) ?? 1}`;
          const tag = tagOf(url);
          // As readSince: only a version that can be sent is asked on condition.
          const sendable =
            version !== undefined && version.length <= 512 && version.startsWith('"');
          if (sendable && version === tag) return { unchanged: true };
          checked.set(url, (checked.get(url) ?? 0) + 1);
          return {
            unchanged: false,
            value:
              url === deck.cardsDocumentUrl
                ? failing(url, now)
                : { url, status: "checked" as const, subjects: [] },
            version: tag,
          };
        },
      );
      return { deps, useCases: createUseCases(deps), versions, checked };
    }

    it("checks a shared document and the catalog once for every deck's check, at once or one after another", async () => {
      const { deps, useCases, checked } = sharing();
      const healths = await Promise.all(
        decks.map((one) => useCases.checkDeck(instance.url, one, text)),
      );
      expect(vi.mocked(deps.shapeValidator.validateDocumentSince)).toHaveBeenCalledTimes(3);
      for (const one of decks) await useCases.checkDeck(instance.url, one, text);
      expect(Object.fromEntries(checked)).toEqual({
        [catalog]: 1,
        [deck.cardsDocumentUrl]: 1,
        [deck.reviewsDocumentUrl]: 1,
      });
      for (const health of healths) {
        expect(health.report.violationCount).toBe(1);
        expect(health.report.documents.map(({ url }) => url)).toContain(deck.cardsDocumentUrl);
      }
    });

    it("reuses what the instance's check found of a document", async () => {
      const { useCases, checked } = sharing();
      await useCases.checkInstance(instance.url);
      const health = await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(health.report.violationCount).toBe(1);
      expect(checked.get(deck.cardsDocumentUrl)).toBe(1);
      expect(checked.get(catalog)).toBe(1);
    });

    it.each(["none", "long", "unquoted", "new each read"] as const)(
      "checks them once too when the server gives a version that is %s",
      async (sent) => {
        const { useCases, checked } = sharing(sent);
        for (const one of decks) await useCases.checkDeck(instance.url, one, text);
        expect(Object.fromEntries(checked)).toEqual({
          [catalog]: 1,
          [deck.cardsDocumentUrl]: 1,
          [deck.reviewsDocumentUrl]: 1,
        });
      },
    );

    it("reads a deck's documents and the catalog afresh once told to, on condition", async () => {
      const { deps, useCases, checked } = sharing();
      await useCases.checkDeck(instance.url, decks[0]!, text);
      useCases.forgetDeckCheck(instance.url, decks[1]!);
      await useCases.checkDeck(instance.url, decks[1]!, text);
      // Read again, unchanged: nothing checked again.
      expect(vi.mocked(deps.shapeValidator.validateDocumentSince)).toHaveBeenCalledTimes(6);
      expect(vi.mocked(deps.shapeValidator.validateDocumentSince)).toHaveBeenLastCalledWith(
        expect.any(String),
        '"v1"',
        "pod",
        undefined,
      );
      expect(checked.get(deck.cardsDocumentUrl)).toBe(1);
      // Another instance's are not forgotten: there are none kept.
      useCases.forgetDeckCheck("https://bob.example/memo/", decks[1]!);
      await useCases.checkDeck(instance.url, decks[2]!, text);
      expect(vi.mocked(deps.shapeValidator.validateDocumentSince)).toHaveBeenCalledTimes(6);
    });

    it.each(["as is", "none", "new each read"] as const)(
      "checks a document again once it changes and it is read afresh, and finds what is new in it (version %s)",
      async (sent) => {
        const { useCases, versions, checked } = sharing(sent);
        await useCases.checkDeck(instance.url, decks[0]!, text);
        versions.set(deck.cardsDocumentUrl, 2);
        useCases.forgetDeckCheck(instance.url, decks[1]!);
        const health = await useCases.checkDeck(instance.url, decks[1]!, text);
        expect(checked.get(deck.cardsDocumentUrl)).toBe(2);
        expect(
          health.report.documents.find(({ url }) => url === deck.cardsDocumentUrl)!.subjects,
        ).toMatchObject([{ violations: [{ message: { en: "v2" } }] }]);
        // The decks after it reuse the new check.
        const next = await useCases.checkDeck(instance.url, decks[2]!, text);
        expect(checked.get(deck.cardsDocumentUrl)).toBe(2);
        expect(next.report.documents.find(({ url }) => url === deck.cardsDocumentUrl)).toBe(
          health.report.documents.find(({ url }) => url === deck.cardsDocumentUrl),
        );
      },
    );

    it("reads every document afresh as the instance's check is made, and the decks' checks then reuse it", async () => {
      const { useCases, versions, checked } = sharing("none");
      await useCases.checkDeck(instance.url, decks[0]!, text);
      versions.set(deck.cardsDocumentUrl, 2);
      const report = await useCases.checkInstance(instance.url);
      expect(checked.get(deck.cardsDocumentUrl)).toBe(2);
      expect(checked.get(catalog)).toBe(2);
      expect(report.violationCount).toBe(1);
      for (const one of decks) await useCases.checkDeck(instance.url, one, text);
      expect(checked.get(deck.cardsDocumentUrl)).toBe(2);
      expect(checked.get(catalog)).toBe(2);
    });

    it("keeps the newer check of a document when an older one ends after it", async () => {
      const { deps, useCases, versions, checked } = sharing();
      const read = vi.mocked(deps.shapeValidator.validateDocumentSince).getMockImplementation()!;
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.mocked(deps.shapeValidator.validateDocumentSince).mockImplementationOnce(
        async (...args) => {
          await held;
          return read(...args);
        },
      );
      const first = useCases.checkDeck(instance.url, decks[0]!, text);
      await vi.waitFor(() =>
        expect(vi.mocked(deps.shapeValidator.validateDocumentSince)).toHaveBeenCalled(),
      );
      versions.set(catalog, 2);
      useCases.forgetDeckCheck(instance.url, decks[1]!);
      await useCases.checkDeck(instance.url, decks[1]!, text);
      release();
      await first;
      const before = checked.get(catalog);
      await useCases.checkDeck(instance.url, decks[2]!, text);
      expect(checked.get(catalog)).toBe(before);
    });

    it("reports a document shared under another spelling at the address the deck names", async () => {
      const { useCases, checked } = sharing();
      const spelled = deck.cardsDocumentUrl.replace("alice.example", "ALICE.example");
      await useCases.checkDeck(instance.url, decks[0]!, text);
      const health = await useCases.checkDeck(
        instance.url,
        { ...decks[1]!, cardsDocumentUrl: spelled },
        text,
      );
      expect(checked.get(deck.cardsDocumentUrl)).toBe(1);
      expect(checked.has(spelled)).toBe(false);
      expect(health.report.documents.map(({ url }) => url)).toContain(spelled);
      expect(health.report.violationCount).toBe(1);
    });

    /**
     * The checks of `sharing`, whose deck documents are read as a pod
     * reads them: each read through the reads a check shares, if given,
     * counted in `fetched`. Every document is unclaimed for none of the
     * decks, and the cards document gives the version it was read at.
     */
    function sharingReads(sent: Parameters<typeof sharing>[0] = "as is") {
      const shared = sharing(sent);
      const { deps, versions } = shared;
      const fetched = new Map<string, number>();
      const listed: number[] = [];
      const readOf = (url: string, reads: SharedReads | undefined): Promise<number> => {
        const read = async () => {
          fetched.set(url, (fetched.get(url) ?? 0) + 1);
          return versions.get(url) ?? 1;
        };
        return reads === undefined ? read() : reads(url, read);
      };
      deps.deckRepository.listCards = vi.fn(async (one, options) => {
        listed.push(await readOf(one.cardsDocumentUrl, options?.reads));
        return [];
      });
      deps.deckRepository.unclaimedDocuments = vi.fn(async (one, _budget, reads) => {
        await Promise.all(
          [one.cardsDocumentUrl, one.reviewsDocumentUrl].map((url) => readOf(url, reads)),
        );
        return [];
      });
      deps.deckRepository.isUnclaimedAsRead = vi.fn(async (_decks, url, _budget, reads) => {
        await readOf(url, reads);
        return false;
      });
      return { ...shared, fetched, listed };
    }

    it("reads a shared document once for every deck's check, to list its cards and find where it stands", async () => {
      const { deps, useCases, fetched } = sharingReads("none");
      await Promise.all(decks.map((one) => useCases.checkDeck(instance.url, one, text)));
      for (const one of decks) await useCases.checkDeck(instance.url, one, text);
      // Each deck still asks of its own: what it is told depends on the deck.
      expect(deps.deckRepository.isUnclaimedAsRead).toHaveBeenCalledTimes(decks.length * 2);
      expect(deps.deckRepository.listCards).toHaveBeenCalledTimes(decks.length * 2);
      expect(deps.deckRepository.unclaimedDocuments).toHaveBeenCalledTimes(decks.length * 2);
      expect(Object.fromEntries(fetched)).toEqual({
        [deck.cardsDocumentUrl]: 1,
        [deck.reviewsDocumentUrl]: 1,
      });
    });

    it("reads the text of a shared cards document once for every deck's check, with one text check", async () => {
      const { deps, useCases } = sharingReads("none");
      const cards = Array.from(
        { length: 20 },
        (_, index): Card => ({
          ...card2,
          id: `card-${index}`,
          url: `${deck.cardsDocumentUrl}#card-${index}`,
          front: { en: `<b>${index}</b>` },
          back: { en: "x" },
          textFormat: SM.markdown,
        }),
      );
      // As the repository maps a read: once, to one frozen array, for every deck naming the document.
      const listCards = vi.mocked(deps.deckRepository.listCards).getMockImplementation()!;
      let mapped: readonly Card[] | undefined;
      deps.deckRepository.listCards = vi.fn(async (one, options) => {
        await listCards(one, options);
        return (mapped ??= Object.freeze(cards)) as Card[];
      });
      const counted = Object.freeze({
        plain: vi.fn((value: string) => value),
        check: vi.fn((value: string) => (value.includes("<") ? [{ code: "html" }] : [])),
      });
      const healths = await Promise.all(
        decks.map((one) => useCases.checkDeck(instance.url, one, counted)),
      );
      // Each text once: the work grows with the document, not with the decks naming it too.
      expect(counted.check).toHaveBeenCalledTimes(cards.length * 2);
      expect(counted.plain).toHaveBeenCalledTimes(cards.length * 2);
      for (const health of healths) expect(health.markdown).toHaveLength(cards.length);
    });

    it("reads a shared document, and its text, once for decks naming it in as many spellings", async () => {
      const { deps, useCases, fetched, checked } = sharingReads("none");
      const spelled = decks.map((one, index) => ({
        ...one,
        cardsDocumentUrl: deck.cardsDocumentUrl.replace(
          "alice.example",
          ["alice.example", "ALICE.example", "Alice.example", "aLice.example:443", "alice.EXAMPLE"][
            index
          ]!,
        ),
      }));
      const cards = Array.from(
        { length: 20 },
        (_, index): Card => ({
          ...card2,
          id: `card-${index}`,
          url: `${deck.cardsDocumentUrl}#card-${index}`,
          front: { en: `<b>${index}</b>` },
          back: { en: "x" },
          textFormat: SM.markdown,
        }),
      );
      // As the repository maps a read: one frozen array for each document read, whatever deck it is for.
      const mapped = new Map<number, readonly Card[]>();
      deps.deckRepository.listCards = vi.fn(async (one, options) => {
        const read = await options!.reads!(one.cardsDocumentUrl, async () => {
          fetched.set(one.cardsDocumentUrl, (fetched.get(one.cardsDocumentUrl) ?? 0) + 1);
          return fetched.size;
        });
        if (!mapped.has(read)) mapped.set(read, Object.freeze([...cards]));
        return mapped.get(read) as Card[];
      });
      const counted = Object.freeze({
        plain: vi.fn((value: string) => value),
        check: vi.fn((value: string) => (value.includes("<") ? [{ code: "html" }] : [])),
      });
      const healths = await Promise.all(
        spelled.map((one) => useCases.checkDeck(instance.url, one, counted)),
      );
      const cardReads = [...fetched].filter(([url]) => url.includes("/decks/"));
      expect(cardReads.reduce((sum, [, count]) => sum + count, 0)).toBe(1);
      expect([...checked].filter(([url]) => url.includes("/decks/"))).toHaveLength(1);
      expect(counted.check).toHaveBeenCalledTimes(cards.length * 2);
      for (const [index, health] of healths.entries()) {
        expect(health.markdown).toHaveLength(cards.length);
        expect(health.report.documents.map(({ url }) => url)).toContain(
          spelled[index]!.cardsDocumentUrl,
        );
      }
    });

    it("reads a deck's documents again once told to, and as the instance's check is made", async () => {
      const { useCases, versions, fetched, listed } = sharingReads("none");
      await useCases.checkDeck(instance.url, decks[0]!, text);
      versions.set(deck.cardsDocumentUrl, 2);
      useCases.forgetDeckCheck(instance.url, decks[1]!);
      await useCases.checkDeck(instance.url, decks[1]!, text);
      expect(fetched.get(deck.cardsDocumentUrl)).toBe(2);
      expect(listed).toEqual([1, 2]);
      await useCases.checkInstance(instance.url);
      expect(fetched.get(deck.cardsDocumentUrl)).toBe(3);
      await useCases.checkDeck(instance.url, decks[2]!, text);
      expect(fetched.get(deck.cardsDocumentUrl)).toBe(3);
    });

    it("reads nothing kept before an instance's check started in the same turn, whichever starts first", async () => {
      const { useCases, versions, listed } = sharingReads("none");
      await useCases.checkDeck(instance.url, decks[0]!, text);
      versions.set(deck.cardsDocumentUrl, 2);
      await Promise.all([
        useCases.checkDeck(instance.url, decks[1]!, text),
        useCases.checkInstance(instance.url),
      ]);
      expect(listed).toEqual([1, 2]);
    });

    it("reads a shared document whose read fails once for every deck's check, until told to read it again", async () => {
      const { deps, useCases } = sharingReads();
      // Read only to list the cards.
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => []);
      deps.deckRepository.isUnclaimedAsRead = vi.fn(async () => false);
      let failed = 0;
      deps.deckRepository.listCards = vi.fn((one, options) =>
        options!.reads!(one.cardsDocumentUrl, async () => {
          failed++;
          throw new Error("Not Turtle.");
        }),
      );
      const healths = await Promise.all(
        decks.map((one) => useCases.checkDeck(instance.url, one, text)),
      );
      for (const one of decks) await useCases.checkDeck(instance.url, one, text);
      expect(failed).toBe(1);
      for (const health of healths) {
        expect(health.report.documents).toContainEqual(
          unreadableDocument(deck.cardsDocumentUrl, "Not Turtle."),
        );
        expect(health.report.violationCount).toBe(1);
      }
      useCases.forgetDeckCheck(instance.url, decks[0]!);
      await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(failed).toBe(2);
      await useCases.checkInstance(instance.url);
      await useCases.checkDeck(instance.url, decks[1]!, text);
      expect(failed).toBe(3);
    });

    it.each([
      ["a reason too long", new Error("x".repeat(400)), `${"x".repeat(300)}…`],
      ["what is not an error", "No.", "No."],
    ])("gives %s as the reason a deck's cards could not be read", async (_, error, reason) => {
      const { deps, useCases } = sharingReads();
      deps.deckRepository.listCards = vi.fn(async () => {
        throw error;
      });
      const health = await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(health.report.documents).toContainEqual(
        unreadableDocument(deck.cardsDocumentUrl, reason),
      );
    });

    it("keeps what the check found of a deck's cards document that it could not read either", async () => {
      const { deps, useCases } = sharingReads();
      const unread = unreadableDocument(deck.cardsDocumentUrl, "403 Forbidden");
      vi.mocked(deps.shapeValidator.validateDocumentSince).mockImplementation(async (url) => ({
        unchanged: false,
        value: url === deck.cardsDocumentUrl ? unread : { url, status: "checked", subjects: [] },
        version: null,
      }));
      deps.deckRepository.listCards = vi.fn(async () => {
        throw new Error("No.");
      });
      const health = await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(health.report.documents).toContainEqual(unread);
      expect(health.report.violationCount).toBe(1);
    });

    it("shows a deck's cards document it could not read as unreadable, unclaimed or not", async () => {
      const { deps, useCases } = sharingReads();
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => [deck.cardsDocumentUrl]);
      deps.deckRepository.listCards = vi.fn(async () => {
        throw new Error("No.");
      });
      const health = await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(health.report.documents).toContainEqual(
        unreadableDocument(deck.cardsDocumentUrl, "No."),
      );
      expect(health.report.unclaimed?.map(({ documents }) => documents)).toEqual([
        [deck.cardsDocumentUrl],
      ]);
    });

    it("still fails the check of a deck that cannot be used", async () => {
      const { deps, useCases } = sharingReads();
      deps.deckRepository.listCards = vi.fn(async () => {
        throw new AppError("deckGone", { deck: "Gone" });
      });
      await expect(useCases.checkDeck(instance.url, decks[0]!, text)).rejects.toThrow(AppError);
    });

    it("keeps a newer read of a document when an older one fails after it", async () => {
      const { deps, useCases, fetched } = sharingReads();
      // Read only to list the cards.
      deps.deckRepository.unclaimedDocuments = vi.fn(async () => []);
      deps.deckRepository.isUnclaimedAsRead = vi.fn(async () => false);
      let fail: () => void = () => undefined;
      vi.mocked(deps.deckRepository.listCards).mockImplementationOnce((_one, options) =>
        options!.reads!(
          deck.cardsDocumentUrl,
          () =>
            new Promise<never>((_resolve, reject) => {
              fail = () => reject(new Error("No."));
            }),
        ),
      );
      const first = useCases.checkDeck(instance.url, decks[0]!, text);
      await vi.waitFor(() => expect(deps.deckRepository.listCards).toHaveBeenCalled());
      useCases.forgetDeckCheck(instance.url, decks[1]!);
      await useCases.checkDeck(instance.url, decks[1]!, text);
      fail();
      expect((await first).report.documents).toContainEqual(
        unreadableDocument(deck.cardsDocumentUrl, "No."),
      );
      await useCases.checkDeck(instance.url, decks[2]!, text);
      expect(fetched.get(deck.cardsDocumentUrl)).toBe(1);
    });

    it("keeps what it found for the instance last checked only", async () => {
      const { useCases, checked } = sharing();
      await useCases.checkDeck(instance.url, decks[0]!, text);
      await useCases.checkDeck("https://bob.example/memo/", decks[0]!, text);
      await useCases.checkDeck(instance.url, decks[0]!, text);
      expect(checked.get(deck.cardsDocumentUrl)).toBe(3);
    });
  });
});
