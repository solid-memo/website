// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type {
  AnswerLog,
  DigestRepository,
  DeckRepository,
  ReviewStateRepository,
  GuestPod,
  ReleaseDraftRepository,
} from "./ports";
import {
  GUEST_INSTANCE_URL,
  GUEST_ORIGIN,
  GUEST_SESSION,
  GUEST_WEBID,
  guestDeckStamp,
} from "@solid-memo/domain/guest";
import { createUseCases, type UseCases } from "./useCases";
import {
  courseDraft,
  deckDraft,
  DRAFT,
  playableCourseDraft,
} from "@solid-memo/domain/testing/releaseDraft";
import { draftSummaryOf, draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { TRIAL_INSTANCE_URL, TRIAL_SESSION } from "@solid-memo/domain/release/trial";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  type Card,
  type Deck,
} from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { fsrsInterval } from "@solid-memo/domain/fsrs";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";

import {
  session,
  document,
  storage,
  catalog,
  sm2s,
  promptOf,
  instance,
  deck,
  card,
  libraryContent,
  makeDeps,
  memoryLog,
} from "./testing/fakePorts";

describe("createUseCases", () => {
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
    expect(deps.sessionGateway.login).toHaveBeenCalledWith("https://alice.example/profile/card#me");
  });

  it("loginWithWebId rejects an invalid WebID without contacting the gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.loginWithWebId("http://alice.example/profile/card#me")).rejects.toThrow(
      "A WebID must start with https://.",
    );
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });

  it("loginWithProvider starts login at the chosen issuer", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.loginWithProvider("https://login.inrupt.com");
    expect(deps.sessionGateway.loginWithIssuer).toHaveBeenCalledWith("https://login.inrupt.com");
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });

  it("loginWithProvider rejects an issuer that is not an https URL", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.loginWithProvider("http://idp.example")).rejects.toThrow(
      "An identity provider must be an https:// URL.",
    );
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
    expect(deps.storageGateway.discoverStorages).toHaveBeenCalledWith(session.webId);
    expect(deps.sessionGateway.discoverOidcIssuer).toHaveBeenCalledWith(session.webId);
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
    expect(deps.webIdDocumentRepository.fetchWebIdDocument).toHaveBeenCalledWith(session.webId);
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
    vi.mocked(deps.sessionGateway.discoverOidcIssuer).mockRejectedValue(new Error("no issuer"));
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
    await expect(useCases.discoverAccount(session)).rejects.toThrow("profile unreachable");
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
    expect(deps.sessionGateway.onSessionExpired).toHaveBeenCalledWith(listener);
    expect(typeof unsubscribe).toBe("function");
  });

  it("viewWebIdDocument fetches the document for the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.viewWebIdDocument(session)).resolves.toEqual(document);
    expect(deps.webIdDocumentRepository.fetchWebIdDocument).toHaveBeenCalledWith(session.webId);
  });

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
        since === version
          ? { unchanged: true as const }
          : { unchanged: false as const, value, version },
      );
    deps.deckRepository.readCardsSince = at("c1", [
      current,
      card2,
    ]) as DeckRepository["readCardsSince"];
    deps.reviewStateRepository.readReviewStatesSince = at(
      "r1",
      sm2s([review]),
    ) as ReviewStateRepository["readReviewStatesSince"];
    deps.shapeValidator.validateDocumentSince = vi.fn(
      async (url: string, since: string | undefined) =>
        since === `v-${url}`
          ? { unchanged: true as const }
          : {
              unchanged: false as const,
              value: { url, status: "checked" as const, subjects: [] },
              version: `v-${url}`,
            },
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
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
    expect(stored()!.receipts[deck.cardsDocumentUrl]).toEqual({
      document: deck.cardsDocumentUrl,
      version: "c1",
      latestFormat: true,
    });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
  });

  it("counts from the schedule while neither document changed", async () => {
    const { deps, useCases } = setup(await learned());
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledExactlyOnceWith(
      deck,
      "r1",
    );
  });

  it("counts from the documents again when one changed, or the deck is studied another way", async () => {
    const digest = await learned();
    const changed = setup({
      ...digest,
      schedules: { [deck.url]: { ...digest.schedules[deck.url]!, cardsVersion: "c0" } },
    });
    await expect(changed.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(changed.deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c0");

    const otherWay = setup(digest);
    await expect(
      otherWay.useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).resolves.toEqual({
      dueCount: 1,
      newCount: 3,
    });
    expect(otherWay.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
  });

  it("counts from the documents again once the instance schedules with another scheduler, and keeps which", async () => {
    const digest = await learned();
    expect(digest.schedules[deck.url]!.schedule.scheduler).toBe("sm2");
    const switched = setup(digest);
    vi.mocked(switched.deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    await expect(switched.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(switched.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
    await vi.waitFor(() => expect(switched.digestRepository.updateDigest).toHaveBeenCalled());
    expect(switched.stored()!.schedules[deck.url]!.schedule.scheduler).toBe("fsrs6");
  });

  it("counts, forecasts and spreads intervals by FSRS-6's due days under FSRS-6, eases by SM-2's", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    const fsrs: FsrsState = {
      cardId: review.cardId,
      direction: review.direction,
      stability: 40,
      difficulty: 3,
      due: "2026-10-26",
      firstReviewedAt: review.firstReviewedAt,
      lastReviewedAt: review.lastReviewedAt,
      formatVersion: 1,
    };
    deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: { sm2: [review], fsrs: [fsrs] },
      version: "r1",
    }));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 0,
      newCount: 1,
    });
    const [progress] = (await useCases.getCardProgress(instance.url, now, { deck })).decks;
    // Thirty days from its last review on the 26th: mature, and not overdue.
    expect(progress!.progress).toEqual({ new: 1, relearning: 0, young: 0, mature: 1 });
    expect(progress!.intervals.find((bin) => bin.count > 0)!.from).toBeGreaterThan(1);
    expect(progress!.eases.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    expect(progress!.overdue).toBe(0);
    const insight = await useCases.deckInsight(instance.url, deck, now, {
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6",
    });
    expect(insight.intervals).toEqual(progress!.intervals);
  });

  it("notes no format receipt for a document holding something outdated, and nothing of a document without a version", async () => {
    const outdated = setup();
    outdated.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [{ ...card, formatVersion: 0 }],
      version: "c1",
    }));
    outdated.deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: sm2s([{ ...review, formatVersion: 1 }]),
      version: "r1",
    }));
    await outdated.useCases.getStudyCounts(instance.url, deck, now);
    await vi.waitFor(() => expect(outdated.digestRepository.updateDigest).toHaveBeenCalled());
    expect(outdated.stored()!.receipts).toEqual({});

    const unversioned = setup();
    unversioned.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [card],
      version: null,
    }));
    await unversioned.useCases.getStudyCounts(instance.url, deck, now);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unversioned.digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("goes on without a digest it cannot read or write", async () => {
    const { deps, useCases, digestRepository } = setup();
    vi.mocked(digestRepository.readDigest).mockRejectedValue(new Error("offline"));
    vi.mocked(digestRepository.updateDigest).mockRejectedValue(new Error("offline"));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await expect(createUseCases(deps).getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
  });

  it("refuses a read without a version that says unchanged", async () => {
    const { deps, useCases } = setup(await learned());
    deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: true as const }));
    await expect(
      useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).rejects.toThrow("came back unchanged");
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("keeps the schedule and checks the reviews document when a study session ends", async () => {
    const { useCases, stored, digestRepository } = setup();
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2));
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
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
      value: {
        url,
        status: "checked" as const,
        subjects: [
          {
            url: `${url}#x`,
            status: "checked" as const,
            shape: "reviewState" as const,
            version: 2,
            violations: [
              { message: { en: "no" }, severity: "violation" as const, constraint: "MinCount" },
            ],
          },
        ],
      },
      version: "r1",
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "checked" as const, subjects: [] },
      version: null,
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(stored()!.receipts[deck.reviewsDocumentUrl]!.conformedTo).toBeUndefined();
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
      { deckUrl: deck.url, title: deck.title, documents: [deck.reviewsDocumentUrl] },
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

  it("claims a deck's documents as the user confirmed, a deck of the instance only", async () => {
    const { deps, useCases } = setup();
    await useCases.claimDeckDocuments(instance.url, deck.url);
    expect(deps.deckRepository.claimDocuments).toHaveBeenCalledWith(deck);
    await expect(
      useCases.claimDeckDocuments(instance.url, `${instance.url}catalog.ttl#deck-other`),
    ).rejects.toMatchObject({ code: "deckGone" });
    expect(deps.deckRepository.claimDocuments).toHaveBeenCalledTimes(1);
  });

  it("keeps no drafts without a repository of them", async () => {
    const useCases = createUseCases(makeDeps());
    await expect(useCases.listReleaseDrafts(instance.url)).resolves.toEqual([]);
    await expect(
      useCases.getReleaseDraft(`${instance.url}drafts/a/v1/release.ttl`),
    ).rejects.toThrow("This app keeps no drafts.");
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([]);
    await expect(
      useCases.makeReleasePublic(instance.url, `${instance.url}releases/a/v1.ttl`, session.webId),
    ).rejects.toThrow("This app keeps no drafts.");
  });

  it("reads no document of an instance as a graph without a reader of them", async () => {
    const useCases = createUseCases(makeDeps());
    const graph = await useCases.readInstanceGraph(instance.url, session.webId);
    const documents = graph.nodes.filter((node) => node.kind === "document");
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((node) => node.unreadable === true)).toBe(true);
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

  it("tells how far along every deck's prompts are and what each has due, at its pace, and keeps its schedule", async () => {
    const { deps, useCases, stored, digestRepository } = setup();
    const other: Deck = {
      ...deck,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      direction: "bidirectional",
      maxReviewsPerDay: 0,
      newCardsPerDay: 3,
    };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, other]);
    const report = await useCases.getCardProgress(instance.url, now);
    expect(report.today).toBe("2026-09-28");
    expect(report.decks.map((one) => ({ deck: one.deck, progress: one.progress }))).toEqual([
      { deck, progress: { new: 1, relearning: 0, young: 1, mature: 0 } },
      { deck: other, progress: { new: 3, relearning: 0, young: 1, mature: 0 } },
    ]);
    // The one prompt each deck has studied fell due before today. Each deck
    // at its own caps: the second lets no review through, so it never catches up.
    expect(
      report.decks.map(({ overdue, daysToClear, newCardsPerDay, introducedToday }) => ({
        overdue,
        daysToClear,
        newCardsPerDay,
        introducedToday,
      })),
    ).toEqual([
      {
        overdue: 1,
        daysToClear: 0,
        newCardsPerDay: DEFAULT_PREFERENCES.newCardsPerDay,
        introducedToday: 0,
      },
      { overdue: 1, daysToClear: null, newCardsPerDay: 3, introducedToday: 0 },
    ]);
    // That prompt, at an interval of a day.
    for (const one of report.decks) {
      expect(one.intervals[0]).toEqual({ from: 1, to: 2, count: 1 });
      expect(one.intervals.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
      expect(one.eases.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    }
    const [own, paced] = report.decks.map((one) => one.forecast);
    expect(own).toHaveLength(30);
    expect(own![0]).toEqual({ studyDay: "2026-09-28", due: 1, reviews: 1 });
    expect(own!.slice(1).every(({ due }) => due === 0)).toBe(true);
    expect(paced![0]).toEqual({ studyDay: "2026-09-28", due: 1, reviews: 0 });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledWith(deck, undefined);
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(other, undefined);
    await vi.waitFor(() => expect(Object.keys(stored()!.schedules)).toEqual([deck.url, other.url]));
    expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2);
  });

  it("tells how far along one deck's prompts are, without listing the decks", async () => {
    const { deps, useCases } = setup();
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks.map((one) => ({ deck: one.deck, progress: one.progress }))).toEqual([
      { deck, progress: { new: 1, relearning: 0, young: 1, mature: 0 } },
    ]);
    expect(deps.deckRepository.listDecks).not.toHaveBeenCalled();
  });

  it("forecasts from the digest's schedule while it is of the documents as they are, for the progress too", async () => {
    const schedule = {
      direction: deck.direction,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-09-25": 2, "2026-09-30": 7 },
      unreviewed: 0,
      studyDay: "2026-09-28",
      reviewedOnDay: 0,
      introducedOnDay: 2,
    };
    const { useCases, digestRepository } = setup({
      receipts: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks[0]!.forecast[2]).toEqual({ studyDay: "2026-09-30", due: 7, reviews: 7 });
    // Two fell due before today: overdue now, and counted in today's forecast.
    expect(report.decks[0]!.overdue).toBe(2);
    expect(report.decks[0]!.forecast[0]).toEqual({ studyDay: "2026-09-28", due: 2, reviews: 2 });
    // The two prompts it says were first reviewed today count against today's new-card cap.
    expect(report.decks[0]!.introducedToday).toBe(2);
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("counts no prompt as met today from a digest's schedule of an earlier day", async () => {
    const schedule = {
      direction: deck.direction,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-09-30": 7 },
      unreviewed: 3,
      studyDay: "2026-09-27",
      reviewedOnDay: 4,
      introducedOnDay: 4,
    };
    const { useCases } = setup({
      receipts: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks[0]!.introducedToday).toBe(0);
  });

  it("refuses a read without a version that says unchanged, for the progress too", async () => {
    const { deps, useCases } = setup();
    deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: true as const,
    }));
    await expect(useCases.getCardProgress(instance.url, now, { deck })).rejects.toThrow(
      "came back unchanged",
    );
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
  const noon = new Date(2026, 8, 21, 12, 0);
  const setup = () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    let id = 0;
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => `id${++id}-0000-0000`,
    });
    return { deps, log, byMonth, useCases };
  };

  it("keeps every answer with what the statistics need, the prior interval and due day from the second on", async () => {
    const { deps, byMonth, useCases } = setup();
    const offset = 0 - noon.getTimezoneOffset();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon, {
      recallMillis: 2400.4,
      gradeMillis: 800,
    });
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(
      promptOf({
        cardId: card.id,
        direction: "back-to-front",
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        due: "2026-09-21",
        firstReviewedAt: "2026-09-01T10:00:00.000Z",
        lastReviewedAt: "2026-09-15T10:00:00.000Z",
        formatVersion: 2,
      }),
    );
    // Eleven minutes to recall: the learner was away, so it is not kept.
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 1, noon, {
      recallMillis: 11 * 60_000,
      gradeMillis: 500,
    });
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 4, noon);
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.get("2026-09")).toEqual([
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id1-0000`,
        deckUrl: deck.url,
        cardUrl: card.url,
        direction: "front-to-back",
        grade: 4,
        answeredAt: noon.toISOString(),
        studyDay: "2026-09-21",
        nextIntervalDays: 1,
        recallMillis: 2400,
        gradeMillis: 800,
        utcOffsetMinutes: offset,
      },
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id2-0000`,
        deckUrl: deck.url,
        cardUrl: card.url,
        direction: "back-to-front",
        grade: 1,
        answeredAt: noon.toISOString(),
        studyDay: "2026-09-21",
        priorIntervalDays: 6,
        nextIntervalDays: 1,
        gradeMillis: 500,
        priorDue: "2026-09-21",
        utcOffsetMinutes: offset,
      },
      // A review timed by no screen, as the Studio's trial gives it: no times.
      expect.not.objectContaining({ recallMillis: expect.anything() }),
    ]);
    expect(byMonth.get("2026-09")![2]).not.toHaveProperty("gradeMillis");
  });

  it("keeps an answer it could not add for later, in order, and does not fail the review", async () => {
    const { log, byMonth, useCases } = setup();
    log.append
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"));
    await expect(
      useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon),
    ).resolves.toBeDefined();
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
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(
      sm2s([
        {
          cardId: card.id,
          direction: "front-to-back",
          easeFactor: 2.6,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-09-22",
          firstReviewedAt: noon.toISOString(),
          lastReviewedAt: noon.toISOString(),
          formatVersion: 2,
        },
      ]),
    );
    await expect(useCases.resetStudyDay(instance.url, deck, noon)).resolves.toBe(1);
    expect(log.removeDay).toHaveBeenCalledWith(instance.url, deck.url, "2026-09-21");
    expect(log.append.mock.invocationCallOrder[0]).toBeLessThan(
      log.removeDay.mock.invocationCallOrder[0]!,
    );
    expect(byMonth.get("2026-09")).toEqual([]);
  });

  it("undoes a second answer of the day: the state just before it written back, not the morning's, the answer out of the log", async () => {
    const { deps, log, byMonth, useCases } = setup();
    const morning: ReviewState = {
      cardId: card.id,
      direction: "back-to-front",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    };
    // The document holds the morning's state, then what the first answer left.
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce(promptOf(morning));
    const first = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "back-to-front" },
      5,
      noon,
    );
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce(
      promptOf(first.state),
    );
    const { undo } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "back-to-front" },
      1,
      noon,
    );
    expect(undo.before).toBe(first.state);
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.get("2026-09")).toHaveLength(2);
    await expect(useCases.undoReview(instance.url, deck, undo)).resolves.toBe(first.state);
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
      save: [first.state],
      remove: [],
    });
    expect(log.removeAnswer).toHaveBeenCalledWith(instance.url, "2026-09-21", undo.answer.id);
    expect(byMonth.get("2026-09")!.map((answer) => answer.grade)).toEqual([5]);
  });

  describe("under FSRS-6", () => {
    const fsrsPrefs = { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const };
    const morning: ReviewState = {
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    };
    const fresh: FsrsState = {
      cardId: card.id,
      direction: "front-to-back",
      stability: 10,
      difficulty: 5,
      due: "2026-09-25",
      firstReviewedAt: morning.firstReviewedAt,
      lastReviewedAt: morning.lastReviewedAt,
      formatVersion: 1,
    };

    it("grades both states in one edit, logs what FSRS-6 set, and undoes both in one save", async () => {
      const { deps, byMonth, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: morning,
        fsrs: fresh,
      });
      const recorded = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      // One edit, with no read of the preferences or the log.
      expect(deps.reviewStateRepository.gradeReviewState).toHaveBeenCalledOnce();
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
      expect(recorded.state).toMatchObject({ repetitions: 3, intervalDays: 15 });
      expect(recorded.fsrs).toMatchObject({
        lastReviewedAt: noon.toISOString(),
        firstReviewedAt: morning.firstReviewedAt,
        previous: {
          stability: 10,
          difficulty: 5,
          due: "2026-09-25",
          lastReviewedAt: morning.lastReviewedAt,
        },
      });
      expect(recorded.fsrs!.stability).toBeGreaterThan(10);
      const nextInterval = fsrsInterval(recorded.fsrs!.stability, fsrsPrefs.desiredRetention);
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")).toEqual([
        expect.objectContaining({
          grade: 4,
          // From the FSRS-6 state's last review (the 15th) to its due day.
          priorIntervalDays: 10,
          priorDue: "2026-09-25",
          nextIntervalDays: nextInterval,
        }),
      ]);
      expect(recorded.undo.fsrs).toEqual({ before: fresh });
      await useCases.undoReview(instance.url, deck, recorded.undo);
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [morning],
        remove: [],
        fsrs: { save: [fresh], remove: [] },
      });
    });

    it("logs a prior interval of 0 when the due day was set before the last review", async () => {
      const { deps, byMonth, useCases } = setup();
      // As Set due date leaves it: due the 10th, last reviewed the 15th.
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: { ...morning, due: "2026-09-10" },
        fsrs: { ...fresh, due: "2026-09-10" },
      });
      await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")).toEqual([
        expect.objectContaining({ priorIntervalDays: 0, priorDue: "2026-09-10" }),
      ]);
    });

    it("logs SM-2's interval and due day as prior when the FSRS-6 state is stale, and removes both of a new prompt on undo", async () => {
      const { deps, byMonth, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce({
        sm2: morning,
        fsrs: { ...fresh, lastReviewedAt: "2026-09-10T10:00:00.000Z" },
      });
      const stale = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      // Estimated from SM-2: no snapshot of FSRS-6's to restore.
      expect(stale.fsrs).not.toHaveProperty("previous");
      const fresh2 = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "back-to-front" },
        3,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")![0]).toMatchObject({
        priorIntervalDays: 6,
        priorDue: "2026-09-21",
      });
      expect(byMonth.get("2026-09")![1]).not.toHaveProperty("priorDue");
      expect(fresh2.undo.fsrs).toEqual({ before: null });
      await useCases.undoReview(instance.url, deck, fresh2.undo);
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
        save: [],
        remove: [fresh2.undo.key],
        fsrs: { save: [], remove: [fresh2.undo.key] },
      });
    });

    it("leaves FSRS-6's state alone under SM-2, and undoes SM-2's alone", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: morning,
        fsrs: fresh,
      });
      const recorded = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
      );
      expect(recorded).not.toHaveProperty("fsrs");
      expect(recorded.undo).not.toHaveProperty("fsrs");
    });
  });

  it("undoes a new prompt's answer still on its way to the log: its state goes, the answer never reaches the log", async () => {
    const { deps, log, byMonth, useCases } = setup();
    log.append.mockRejectedValueOnce(new Error("offline"));
    const { undo } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      0,
      noon,
    );
    expect(undo).toEqual({
      key: { cardId: card.id, direction: "front-to-back" },
      before: null,
      answer: { id: expect.stringMatching(/^answer-/), studyDay: "2026-09-21" },
    });
    await expect(useCases.undoReview(instance.url, deck, undo)).resolves.toBeNull();
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
      save: [],
      remove: [undo.key],
    });
    expect(log.removeAnswer).not.toHaveBeenCalled();
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.size).toBe(0);
  });

  it("computes the statistics of the months asked for, of every deck or of one", async () => {
    const { byMonth, useCases } = setup();
    const answer = (studyDay: string, deckUrl = deck.url): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-09", [answer("2025-09-30")]);
    byMonth.set("2025-10", [answer("2025-10-01")]);
    byMonth.set("2026-09", [
      answer("2026-09-20"),
      answer("2026-09-21", "https://pod.example/other#deck"),
    ]);
    const all = await useCases.getStatistics(instance.url, noon);
    expect(all.days.map((day) => day.studyDay)).toEqual(["2025-10-01", "2026-09-20", "2026-09-21"]);
    expect(all.streaks).toEqual({ current: 2, longest: 2 });
    // The log reaches back past the year: it covers it all.
    expect(all.coverage).toBeNull();
    // How the answers were given comes with them: the card's second introduction is no first try.
    expect(all.firstTry).toEqual({ introduced: 2, recalled: 2 });
    expect(all.week.current.answers).toBe(1);
    // The hours of the day start where the learner's study day does.
    expect(all.dayBoundaryHour).toBe(DEFAULT_PREFERENCES.dayBoundaryHour);
    const one = await useCases.getStatistics(instance.url, noon, { months: 1, deckUrl: deck.url });
    expect(one.days.map((day) => day.studyDay)).toEqual(["2026-09-20"]);
    expect(one.decks).toEqual([
      expect.objectContaining({ introduced: 1, lapses: 0, quiz: { answers: 0, right: 0 } }),
    ]);
  });

  it("says since when times are recorded by every deck's answers, though one deck's statistics are asked for", async () => {
    const { byMonth, useCases } = setup();
    const answer = (studyDay: string, deckUrl: string, timed: boolean): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
      ...(timed ? { recallMillis: 3_000, gradeMillis: 1_000 } : {}),
    });
    byMonth.set("2026-09", [
      answer("2026-09-01", "https://pod.example/other#deck", true),
      // From a tab that recorded no times, after the app began to: unknown, not estimated.
      answer("2026-09-05", deck.url, false),
      answer("2026-09-20", deck.url, true),
    ]);
    const one = await useCases.getStatistics(instance.url, noon, { deckUrl: deck.url });
    expect(one.studyTime.recorded).toEqual({
      since: "2026-09-01",
      answers: 1,
      ms: 4_000,
      unknown: 1,
    });
  });

  it("computes the statistics of the last days asked for, or of the whole log, those up to today of the calendar's weeks, and says where the log begins", async () => {
    const { byMonth, log, useCases } = setup();
    const answer = (studyDay: string): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl: deck.url,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-08", [answer("2025-08-31")]);
    byMonth.set("2026-05", [answer("2026-05-31")]);
    byMonth.set("2026-08", [answer("2026-08-20"), answer("2026-08-23")]);
    byMonth.set("2026-09", [answer("2026-09-21")]);
    // 30 days up to September 21st begin on August 23rd; the figures up to
    // today look back over the calendar's 52 weeks, from September 29th 2025:
    // May is read for them, last August is not.
    const month = await useCases.getStatistics(instance.url, noon, { range: 30 });
    expect(month.days.map((day) => day.studyDay)).toEqual(["2026-08-23", "2026-09-21"]);
    expect(month.totals.answers).toBe(2);
    expect(month.recentDays.map((day) => day.studyDay)).toEqual([
      "2026-05-31",
      "2026-08-20",
      "2026-08-23",
      "2026-09-21",
    ]);
    // Last month's first 21 days lie before the range, and count all the same.
    expect(month.month.previous.answers).toBe(1);
    // Where the cards stood is told week by week from the range's first week, the answers before it read.
    expect(month.memory[0]).toMatchObject({ week: "2026-08-17", young: 1 });
    expect(month.coverage).toBeNull();
    expect(month.logBegins).toBe("2025-08");
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-05", undefined);
    expect(log.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-08", undefined);
    // 500 days reach past last August, where the log begins.
    await expect(useCases.getStatistics(instance.url, noon, { range: 500 })).resolves.toMatchObject(
      { totals: { answers: 5 }, coverage: "2025-08" },
    );
    const all = await useCases.getStatistics(instance.url, noon, { range: "all" });
    expect(all.totals.answers).toBe(5);
    expect(all.coverage).toBe("2025-08");
    // An empty log covers nothing.
    byMonth.clear();
    await expect(
      useCases.getStatistics(instance.url, noon, { range: "all" }),
    ).resolves.toMatchObject({ totals: { answers: 0 }, coverage: null, logBegins: null });
  });

  it("saves the answers of the range asked for as a CSV file, of every deck or of one", async () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    const fileExchange = { save: vi.fn(), open: vi.fn(async () => null) };
    const useCases = createUseCases({ ...deps, answerLog: log, fileExchange });
    const answer = (studyDay: string, deckUrl = deck.url): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2026-05", [answer("2026-05-31")]);
    byMonth.set("2026-09", [answer("2026-09-21"), answer("2026-09-20", "https://pod.example/o#d")]);
    const rows = () => (fileExchange.save.mock.lastCall![2] as string).trim().split("\r\n");
    await useCases.saveAnswers(instance.url, noon, { range: 30 });
    expect(fileExchange.save).toHaveBeenCalledWith(
      "solid-memo-answers-2026-09-21.csv",
      "text/csv",
      expect.stringMatching(/^answered_at,study_day,/),
    );
    expect(rows().map((row) => row.split(",")[1])).toEqual([
      "study_day",
      "2026-09-20",
      "2026-09-21",
    ]);
    await useCases.saveAnswers(instance.url, noon, { range: "all", deckUrl: deck.url });
    expect(rows().map((row) => row.split(",")[1])).toEqual([
      "study_day",
      "2026-05-31",
      "2026-09-21",
    ]);
    await useCases.saveAnswers(instance.url, noon);
    expect(rows()).toHaveLength(4);
  });

  it("shares the months it read with loadAnswerLog, each read again only once it changed, and drops those the log no longer has", async () => {
    const { byMonth, log, useCases } = setup();
    const answer = (studyDay: string): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl: deck.url,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-01", [answer("2025-01-10")]);
    byMonth.set("2026-08", [answer("2026-08-10")]);
    byMonth.set("2026-09", [answer("2026-09-10")]);
    await useCases.getStatistics(instance.url, noon);
    expect(log.readMonthSince).toHaveBeenCalledTimes(2);
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-08", undefined);
    log.readMonthSince.mockClear();
    // The whole log keeps the year's months read, and reads them only to see they are unchanged.
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(3);
    expect(log.readMonthSince.mock.calls).toEqual([
      [instance.url, "2025-01", undefined],
      [instance.url, "2026-08", "v0"],
      [instance.url, "2026-09", "v0"],
    ]);
    log.readMonthSince.mockClear();
    // And the year again keeps what the whole log read.
    await expect(useCases.getStatistics(instance.url, noon)).resolves.toMatchObject({
      totals: { answers: 2 },
    });
    expect(log.readMonthSince.mock.calls).toEqual([
      [instance.url, "2026-08", "v0"],
      [instance.url, "2026-09", "v0"],
    ]);
    // A month the log no longer has is forgotten: when it comes back, it is read whole.
    const august = byMonth.get("2026-08")!;
    byMonth.delete("2026-08");
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(2);
    byMonth.set("2026-08", august);
    log.readMonthSince.mockClear();
    await useCases.loadAnswerLog(instance.url);
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-08", undefined);
  });

  it("reads a month once for reads asked at once, but again for one asked after an answer was added", async () => {
    const { byMonth, log, useCases } = setup();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.getStatistics(instance.url, noon);
    // Each read waits until let through.
    let letThrough = () => {};
    const gate = new Promise<void>((resolve) => (letThrough = resolve));
    const read = log.readMonthSince.getMockImplementation()!;
    log.readMonthSince.mockImplementation(async (...args) => {
      await gate;
      return read(...args);
    });
    log.readMonthSince.mockClear();
    const together = [
      useCases.getStatistics(instance.url, noon),
      useCases.getCardProgress(instance.url, noon, { deck }),
    ];
    await vi.waitFor(() => expect(log.readMonthSince).toHaveBeenCalledTimes(1));
    // An answer added meanwhile: the read under way may miss it, so a read asked after it does not share it.
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    const after = useCases.getStatistics(instance.url, noon);
    await vi.waitFor(() => expect(log.readMonthSince).toHaveBeenCalledTimes(2));
    letThrough();
    await Promise.all(together);
    await expect(after).resolves.toMatchObject({ totals: { answers: 2 } });
    expect(byMonth.get("2026-09")).toHaveLength(2);
    expect(log.readMonthSince).toHaveBeenCalledTimes(2);
  });

  it("is checked in the full check, one document a month, and is empty without a log", async () => {
    const { deps, byMonth, useCases } = setup();
    byMonth.set("2026-09", []);
    await useCases.validateInstance(instance.url);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
      `${instance.url}history/2026-09.ttl`,
      "pod",
    );
    const plain = createUseCases(makeDeps());
    await expect(plain.getStatistics(instance.url, noon)).resolves.toMatchObject({
      totals: { answers: 0, studyDays: 0, cards: 0 },
    });
  });
});

describe("the Studio's answer history and schedule insight", () => {
  const at = new Date("2026-10-09T12:00:00.000Z");
  const live: Card = { ...card, formatVersion: CARD_FORMAT_VERSION };
  const other: Card = { ...live, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2` };
  const retired: Card = {
    ...live,
    id: "card-3",
    url: `${deck.cardsDocumentUrl}#card-3`,
    retired: true,
  };
  const state = (cardId: string, extra: Partial<ReviewState> = {}): ReviewState => ({
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 3,
    repetitions: 1,
    due: "2026-10-10",
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-07T10:00:00.000Z",
    formatVersion: 2,
    ...extra,
  });
  const states = [
    state("card-1"),
    state("card-2", { due: "2026-10-09", intervalDays: 40, easeFactor: 1.3 }),
    state("card-3"),
  ];
  let n = 0;
  const answer = (
    cardId: string,
    grade: Answer["grade"],
    studyDay = "2026-10-01",
    extra: Partial<Answer> = {},
  ): Answer => ({
    id: `answer-${++n}`,
    deckUrl: deck.url,
    // Answered before an upgrade moved the cards into another document.
    cardUrl: `${instance.url}decks/deck-1-old.ttl#${cardId}`,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
    ...extra,
  });

  /** An answer to a prompt already introduced. */
  const reviewed = { priorIntervalDays: 1 };

  /** An answer log of two months, at versions "s1" and "o1"; cards at "c1", reviews at "r1"; a digest kept in memory. */
  function setup(digest: InstanceDigest | null = null) {
    const deps = makeDeps();
    const months: Record<string, Answer[]> = {
      // card-1 lapses four times in its reviews; its course answer is no lapse.
      "2026-09": [
        answer("card-1", 1, "2026-09-12", reviewed),
        answer("card-1", 2, "2026-09-13", reviewed),
        answer("card-1", 1, "2026-09-14", reviewed),
      ],
      "2026-10": [
        answer("card-1", 0, "2026-10-01", reviewed),
        answer("card-1", 2, "2026-10-02", {
          ...reviewed,
          mode: "multiple-choice",
          chosenDistractor: `${instance.url}decks/deck-1-old.ttl#card-1-d1`,
        }),
        answer("card-1", 4, "2026-10-03", reviewed),
        answer("card-2", 1, "2026-10-01", reviewed),
        answer("card-3", 0, "2026-10-01", reviewed),
        answer("card-3", 0, "2026-10-02", reviewed),
        answer("card-3", 0, "2026-10-03", reviewed),
        answer("card-3", 0, "2026-10-04", reviewed),
        answer("card-1", 0, "2026-10-04", { deckUrl: `${instance.url}catalog.ttl#deck-2` }),
      ],
    };
    const versions: Record<string, string> = { "2026-09": "s1", "2026-10": "o1" };
    const answerLog: AnswerLog = {
      append: vi.fn(async () => undefined),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => Object.keys(months)),
      readMonth: vi.fn(),
      readMonthSince: vi.fn(
        async (_instanceUrl: string, month: string, version: string | undefined) =>
          version === versions[month]
            ? { unchanged: true as const }
            : { unchanged: false as const, value: months[month]!, version: versions[month]! },
      ),
      removeDay: vi.fn(),
      removeAnswer: vi.fn(),
    };
    let stored = digest;
    const digestRepository: DigestRepository = {
      readDigest: vi.fn(async () => stored),
      updateDigest: vi.fn(async (_instanceUrl, change) => {
        stored = change(stored);
      }),
    };
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({
      unchanged: false,
      value: [live, other, retired],
      version: "c1",
    });
    vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockResolvedValue({
      unchanged: false,
      value: sm2s(states),
      version: "r1",
    });
    const useCases = createUseCases({ ...deps, answerLog, digestRepository });
    return { deps, useCases, answerLog, months, versions, digestRepository, stored: () => stored };
  }

  it("loads every month of the answer log, and reads one again only once it changed", async () => {
    const { useCases, answerLog, months, versions } = setup();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(12);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", undefined);
    months["2026-10"] = [...months["2026-10"]!, answer("card-2", 5, "2026-10-08")];
    versions["2026-10"] = "o2";
    vi.mocked(answerLog.readMonthSince).mockClear();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(13);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", "s1");
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-10", "o1");
    // Unchanged months come from what was read before.
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(13);
  });

  it("keeps no month the log gave no version of, and reads it again each time", async () => {
    const { useCases, answerLog } = setup();
    vi.mocked(answerLog.readMonthSince).mockResolvedValue({
      unchanged: false,
      value: [answer("card-1", 3)],
      version: null,
    });
    await useCases.loadAnswerLog(instance.url);
    vi.mocked(answerLog.readMonthSince).mockClear();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(2);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", undefined);
  });

  it("gives a card's answers in its deck, newest first, named in the deck's cards document as it is now", async () => {
    const { useCases } = setup();
    const answers = await useCases.cardAnswers(instance.url, deck, "card-1");
    expect(answers.map((each) => [each.studyDay, each.grade])).toEqual([
      ["2026-10-03", 4],
      ["2026-10-02", 2],
      ["2026-10-01", 0],
      ["2026-09-14", 1],
      ["2026-09-13", 2],
      ["2026-09-12", 1],
    ]);
    expect(answers[1]).toMatchObject({
      cardUrl: live.url,
      chosenDistractor: `${deck.cardsDocumentUrl}#card-1-d1`,
    });
  });

  it("finds the deck's hardest cards in use and the wrong options chosen most, in the last twelve months", async () => {
    const { deps, useCases, answerLog, months, versions } = setup();
    const asked: Card = { ...live, distractors: [{ id: "card-1-d1", text: { en: "wrong" } }] };
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({
      unchanged: false,
      value: [asked, other, retired],
      version: "c1",
    });
    // Before the twelve months, which begin on November 1st, 2025: not read.
    months["2025-10"] = [answer("card-2", 0, "2025-10-31", reviewed)];
    versions["2025-10"] = "p1";
    const report = await useCases.getCardProgress(instance.url, at, { deck });
    const [progress] = report.decks;
    // card-1 lapses four times in five reviews (its course answer is none);
    // card-2 once in one; card-3 is retired; the other deck's answer is not this deck's.
    expect(progress!.hardest).toEqual({
      reviews: 10,
      cards: [
        { card: asked, lapses: 4, reviews: 5 },
        { card: other, lapses: 1, reviews: 1 },
      ],
    });
    expect(progress!.courseAnswers).toBe(1);
    expect(progress!.confusions).toEqual([
      { card: asked, distractor: asked.distractors![0], picks: 1 },
    ]);
    expect(answerLog.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-10", undefined);
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledTimes(1);
  });

  it("shows the cards' progress without what is hard when the answer log cannot be read", async () => {
    const { useCases, answerLog } = setup();
    vi.mocked(answerLog.readMonthSince).mockRejectedValue(new Error("403"));
    const [progress] = (await useCases.getCardProgress(instance.url, at, { deck })).decks;
    expect(progress!.progress).not.toBeUndefined();
    expect(progress!.hardest).toEqual({ reviews: 0, cards: [] });
    expect(progress!.courseAnswers).toBe(0);
    expect(progress!.confusions).toEqual([]);
    vi.mocked(answerLog.months).mockRejectedValue(new Error("unreachable"));
    await expect(useCases.getCardProgress(instance.url, at, { deck })).resolves.toMatchObject({
      decks: [{ hardest: { reviews: 0, cards: [] } }],
    });
  });

  it("forecasts the deck's reviews capped by its pace, spreads its prompts, and finds its leeches in use", async () => {
    const { useCases, digestRepository, stored } = setup();
    const insight = await useCases.deckInsight(
      instance.url,
      { ...deck, maxReviewsPerDay: 1 },
      at,
      DEFAULT_PREFERENCES,
    );
    expect(insight.today).toBe("2026-10-09");
    expect(insight.maxReviewsPerDay).toBe(1);
    expect(insight.forecast).toHaveLength(30);
    expect(insight.forecast.slice(0, 3)).toEqual([
      { studyDay: "2026-10-09", due: 1, reviews: 1 },
      { studyDay: "2026-10-10", due: 1, reviews: 1 },
      { studyDay: "2026-10-11", due: 0, reviews: 0 },
    ]);
    // The retired card is not scheduled.
    expect(insight.scheduled).toBe(2);
    expect(insight.intervals.find((bin) => bin.from === 2)).toMatchObject({ count: 1 });
    expect(insight.eases[0]).toMatchObject({ from: 1.3, count: 1 });
    expect(insight.lapses.since).toBe("2026-09");
    expect(insight.lapses.lapses.get(live.url)).toBe(4);
    // card-3 is forgotten as often, but retired.
    expect(insight.leeches).toEqual([{ card: live, lapses: 4 }]);
    // The schedule was computed afresh, and kept.
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalled());
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
  });

  it("forecasts from the digest's schedule while it is of the documents as they are, with the instance's pace", async () => {
    const schedule = {
      direction: "front-to-back" as const,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-10-11": 7 },
      unreviewed: 0,
      studyDay: "2026-10-09",
      reviewedOnDay: 0,
      introducedOnDay: 0,
    };
    const { useCases, digestRepository } = setup({
      receipts: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const insight = await useCases.deckInsight(instance.url, deck, at, DEFAULT_PREFERENCES);
    expect(insight.maxReviewsPerDay).toBe(DEFAULT_PREFERENCES.maxReviewsPerDay);
    expect(insight.forecast[2]).toEqual({ studyDay: "2026-10-11", due: 7, reviews: 7 });
    expect(insight.forecast[0]).toEqual({ studyDay: "2026-10-09", due: 0, reviews: 0 });
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
});

describe("openTrial", () => {
  const trialInstance: Instance = { url: TRIAL_INSTANCE_URL, name: "Trial" };
  function sandbox() {
    const trialUseCases = {
      createInstance: vi.fn(async () => trialInstance),
      switchScheduler: vi.fn(async () => undefined),
      startCourse: vi.fn(async () => deck),
      importLibraryDeck: vi.fn(async () => deck),
    };
    const pod = { exists: vi.fn(), start: vi.fn(async () => undefined), discard: vi.fn() };
    return { useCases: trialUseCases as unknown as UseCases, pod, trialUseCases };
  }
  function withSandbox() {
    const deps = makeDeps();
    const made = sandbox();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: {
        ...DEFAULT_PREFERENCES,
        answerScale: "minimal",
        dayBoundaryHour: 2,
        newCardsPerDay: 1,
        scheduler: "fsrs6",
        desiredRetention: 0.85,
      },
      formatVersion: 5,
    });
    const trialSandbox = vi.fn(() => made);
    return { deps, made, trialSandbox, useCases: createUseCases({ ...deps, trialSandbox }) };
  }

  it("starts a course draft in a sandbox of its own, as a learner with the user's answer scale, study day and scheduler", async () => {
    const { made, trialSandbox, useCases } = withSandbox();
    const draft = playableCourseDraft();
    const opened = await useCases.openTrial(draft, instance.url);
    expect(opened).toEqual({
      ok: true,
      trial: { useCases: made.useCases, instance: trialInstance, deck },
    });
    expect(trialSandbox).toHaveBeenCalledWith(draft);
    expect(made.pod.start).toHaveBeenCalled();
    expect(made.trialUseCases.createInstance).toHaveBeenCalledWith(TRIAL_SESSION, {
      containerUrl: TRIAL_INSTANCE_URL,
      name: "Trial",
      registrationTarget: "private",
    });
    expect(made.trialUseCases.switchScheduler).toHaveBeenCalledWith(TRIAL_INSTANCE_URL, {
      ...DEFAULT_PREFERENCES,
      answerScale: "minimal",
      dayBoundaryHour: 2,
      scheduler: "fsrs6",
      desiredRetention: 0.85,
    });
    expect(made.trialUseCases.startCourse).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT, isCourse: true }),
    );
    expect(made.trialUseCases.importLibraryDeck).not.toHaveBeenCalled();
  });

  it("imports a deck draft as a library deck", async () => {
    const { made, useCases } = withSandbox();
    await useCases.openTrial(deckDraft(), instance.url);
    expect(made.trialUseCases.importLibraryDeck).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT }),
    );
    expect(made.trialUseCases.startCourse).not.toHaveBeenCalled();
  });

  it("refuses a draft that cannot be played, with what keeps it from it, making nothing", async () => {
    const { trialSandbox, useCases } = withSandbox();
    const opened = await useCases.openTrial(courseDraft(), instance.url);
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.problems.map((problem) => problem.code)).toEqual([
      "fewDistractors",
      "fewDistractors",
      "chapterWithoutStep",
    ]);
    expect(trialSandbox).not.toHaveBeenCalled();
  });

  it("plays no trial unless given a sandbox", async () => {
    await expect(createUseCases(makeDeps()).openTrial(deckDraft(), instance.url)).rejects.toThrow(
      "plays no trials",
    );
  });
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
    vi.mocked(deps.instanceRepository.attachInstance).mockResolvedValue({
      url: TARGET,
      name: "My study",
    });
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
    expect(await createUseCases(deps).restoreSession()).toEqual({
      session: GUEST_SESSION,
      origin: "restored",
    });
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
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(
      new Error("no name"),
    );
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
    expect(await createUseCases(deps).findGuestStudy()).toEqual({
      instances: [{ instance: guestInstance, deckCount: 1 }],
    });
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
          properties: [
            {
              predicate: "http://xmlns.com/foaf/0.1/name",
              values: [{ type: "literal", value: "Alice" }],
            },
          ],
        },
      ],
    } as WebIdDocument);
    const hold = vi.fn(() => vi.fn());
    const progress: string[] = [];
    const outcome = await createUseCases({ ...deps, writeFence: { hold } }).transferGuestStudy(
      session,
      guestInstance,
      { containerUrl: ` ${TARGET.slice(0, -1)} `, registrationTarget: "private" },
      (p) =>
        progress.push(
          `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
        ),
    );
    expect(outcome).toEqual({
      ok: true,
      instance: { url: TARGET, name: "My study" },
      tidied: true,
    });
    const move = {
      from: GUEST_INSTANCE_URL,
      to: TARGET,
      renames: { [GUEST_WEBID]: session.webId },
    };
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
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(`${TARGET}meta.ttl`, "pod");
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
    expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
      webId: GUEST_WEBID,
      instance: guestInstance,
    });
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
      "validate 3/7 (0 of 6)",
      "validate 3/7 (1 of 6)",
      "validate 3/7 (2 of 6)",
      "validate 3/7 (3 of 6)",
      "validate 3/7 (4 of 6)",
      "validate 3/7 (5 of 6)",
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
    const held = () =>
      holds.filter(({ release }) => release.mock.calls.length === 0).map(({ url }) => url);
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
    await expect(useCases.removeInterruptedGuestMove(guestInstance)).rejects.toMatchObject({
      code: "guestStudyBeingMoved",
    });
    expect(deps.instanceCopier.ensureAbsent).not.toHaveBeenCalled();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
  });

  it("transferGuestStudy moves the study to the target as a request sends its address", async () => {
    const { deps } = guestDeps();
    const typed = TARGET.replace("https://", "HTTPS://").replace(/\/$/, "");
    await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: ` ${typed} `,
      registrationTarget: "public",
    });
    expect(deps.instanceCopier.ensureAbsent).toHaveBeenCalledWith(TARGET);
  });

  it("transferGuestStudy deletes the whole guest pod with its last instance", async () => {
    const { deps, guestPod } = guestDeps();
    vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
      vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
      return { keptFolder: null, keptReleases: false, keptDocuments: [] };
    });
    await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "public",
    });
    expect(guestPod.discard).toHaveBeenCalledOnce();
  });

  it("transferGuestStudy, and the rest of the app, run without a journal, with the system's clock and fresh ids", async () => {
    const { updateJournal: _j, now: _n, newId: _i, ...deps } = guestDeps().deps;
    const useCases = createUseCases(deps);
    await expect(
      useCases.transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
    expect(useCases.newDeckGroup(instance.url, { en: "Group" }).url).toMatch(
      /#group-[0-9a-f-]{36}$/,
    );
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("transferGuestStudy keeps a catalog-less study as it is, and adds answers still on their way first", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
    const answerLog: AnswerLog = {
      append: vi.fn(async () => undefined),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => []),
      readMonth: vi.fn(async () => []),
      readMonthSince: vi.fn(),
      removeDay: vi.fn(async () => undefined),
      removeAnswer: vi.fn(async () => undefined),
    };
    vi.mocked(answerLog.append).mockRejectedValueOnce(new Error("offline"));
    const useCases = createUseCases({ ...deps, answerLog });
    const guestDeck = { ...deck, url: `${GUEST_INSTANCE_URL}catalog.ttl#deck-1` };
    await useCases.recordReview(
      GUEST_INSTANCE_URL,
      guestDeck,
      { card, direction: "front-to-back" },
      4,
      new Date("2026-10-03T10:00:00.000Z"),
    );
    await vi.waitFor(() => expect(answerLog.append).toHaveBeenCalledOnce());
    await useCases.transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });
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
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: true });
    expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
      webId: GUEST_WEBID,
      instance: guestInstance,
    });
  });

  it("transferGuestStudy says the study moved even when the guest's could not be tidied away", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: false });
  });

  it("transferGuestStudy moves only from the guest's pod into a user's", async () => {
    const { deps } = guestDeps();
    const useCases = createUseCases(deps);
    const target = { containerUrl: TARGET, registrationTarget: "private" as const };
    const refusal =
      "A guest's study moves from the guest's pod into the pod of a user who logged in.";
    await expect(useCases.transferGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(
      refusal,
    );
    await expect(useCases.transferGuestStudy(session, instance, target)).rejects.toThrow(refusal);
    await expect(
      useCases.transferGuestStudy(session, guestInstance, {
        ...target,
        containerUrl: `${GUEST_ORIGIN}x/`,
      }),
    ).rejects.toThrow(refusal);
  });

  it.each([
    [
      "stage",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("boom")),
      false,
    ],
    [
      "copy",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceCopier.copyResource).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
    [
      "adopt",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.deckRepository.saveCatalog).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
    [
      "register",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceRepository.attachInstance).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
  ] as const)(
    "transferGuestStudy failing at %s leaves the guest's study as it was and removes the copy",
    async (step, fail, copied) => {
      const { deps } = guestDeps();
      fail(deps);
      const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      });
      expect(outcome).toEqual({ ok: false, step, error: new Error("boom"), cleanedUp: true });
      expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledTimes(copied ? 1 : 0);
      if (copied) expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledWith(TARGET);
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    },
  );

  it("transferGuestStudy, at a target already taken, keeps the note of the interrupted move whose copy is there", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("taken"));
    const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });
    expect(outcome).toMatchObject({ ok: false, step: "stage", cleanedUp: true });
    expect(deps.updateJournal.begin).not.toHaveBeenCalled();
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
  });

  it("transferGuestStudy refuses a copy that still names the guest's pod, or does not conform", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.mentions).mockImplementation(async (url) =>
      url.endsWith("2026-10.ttl"),
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({
      ok: false,
      step: "adopt",
      error: new AppError("guestUrlsLeft", { url: `${TARGET}history/2026-10.ttl` }),
      cleanedUp: true,
    });
    vi.mocked(deps.instanceCopier.mentions).mockResolvedValue(false);
    const violation = {
      message: { en: "x" },
      severity: "violation" as const,
      constraint: "MinCount",
    };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([]);
    vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
      url.endsWith("meta.ttl")
        ? {
            url,
            status: "checked" as const,
            subjects: [
              {
                url: `${url}#it`,
                status: "checked" as const,
                shape: "instance" as const,
                version: 2,
                violations: [violation],
              },
            ],
          }
        : { url, status: "missing" as const, subjects: [] },
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "validate",
      error: new AppError("movedCopyInvalid", { count: 1 }),
    });
  });

  it("transferGuestStudy refuses to register when the guest's study changed while it was copied", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.isUnchanged).mockResolvedValueOnce(false);
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "verify",
      error: new AppError("resourceChangedDuringCopy", {
        url: `${GUEST_INSTANCE_URL}catalog.ttl`,
      }),
    });
    expect(deps.instanceRepository.attachInstance).not.toHaveBeenCalled();
    // A resource that appeared meanwhile is a change too.
    const more = guestDeps();
    const listed = await more.deps.instanceCopier.listResources(GUEST_INSTANCE_URL);
    vi.mocked(more.deps.instanceCopier.listResources)
      .mockResolvedValueOnce(listed)
      .mockResolvedValueOnce([...listed, `${GUEST_INSTANCE_URL}new.ttl`]);
    expect(
      await createUseCases(more.deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "verify",
      error: new AppError("instanceChangedDuringCopy"),
    });
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
    const course = guestDeckOf("deck-g1", {
      sourceUrl: RELEASE,
      completedChapters: [`${RELEASE}#ch-1`],
    });
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
    const guestFsrs: FsrsState = {
      cardId: "q-1",
      direction: "front-to-back",
      stability: 2.3,
      difficulty: 2.1,
      due: "2026-10-03",
      firstReviewedAt: guestState.firstReviewedAt,
      lastReviewedAt: guestState.lastReviewedAt,
      formatVersion: 1,
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
        answerTo(course, "answer-1", {
          mode: "multiple-choice",
          chosenDistractor: `${course.cardsDocumentUrl}#q-1-d1`,
        }),
        answerTo(own, "answer-2"),
        // A deck the guest removed: its answers have no deck to go with.
        answerTo(guestDeckOf("deck-gone"), "answer-3"),
      ];
      const answerLog: AnswerLog = {
        append: vi.fn(async () => undefined),
        appendAll: vi.fn(async () => undefined),
        months: vi.fn(async (url: string) => (url === GUEST_INSTANCE_URL ? ["2026-10"] : [])),
        readMonth: vi.fn(async () => answers),
        readMonthSince: vi.fn(),
        removeDay: vi.fn(async () => undefined),
        removeAnswer: vi.fn(async () => undefined),
      };
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck],
      );
      vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({
        readOnly: false,
        children: [
          { kind: "group", group: GROUP, children: [{ kind: "deck", deck: course }] },
          { kind: "deck", deck: own },
        ],
      });
      vi.mocked(deps.deckRepository.listCards).mockImplementation(async (of) =>
        of.url === course.url ? [guestCard] : [],
      );
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (of) =>
        of.url === course.url ? { sm2: [guestState], fsrs: [guestFsrs] } : sm2s([]),
      );
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
    const stampOf = (of: Deck) =>
      guestDeckStamp(of, (url) => (of.url === course.url ? `version of ${url}` : ""));
    /** The guest's arrangement around the decks it was added as, as a group's note stamps it. */
    const arrangementOf = (first: Deck, second: Deck) =>
      JSON.stringify([
        { kind: "group", group: GROUP, children: [{ kind: "deck", url: first.url }] },
        { kind: "deck", url: second.url },
      ]);

    it("planGuestMerge lists the guest's decks with the instance's from the same release, and counts the guest's drafts", async () => {
      const { deps } = mergeDeps();
      expect(await createUseCases(deps).planGuestMerge(guestInstance, target)).toEqual({
        decks: [
          { deck: course, sameRelease: [targetDeck] },
          { deck: own, sameRelease: [] },
        ],
        drafts: 0,
      });
      const list = vi.fn(async (url: string) => (url === guestInstance.url ? [{}, {}] : [{}]));
      const releaseDraftRepository = { list } as unknown as ReleaseDraftRepository;
      expect(
        await createUseCases({ ...deps, releaseDraftRepository }).planGuestMerge(
          guestInstance,
          target,
        ),
      ).toMatchObject({ drafts: 2 });
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
        (p) =>
          progress.push(
            `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
          ),
      );
      const first = added("deck-n1", course);
      const second = added("deck-n2", own);
      expect(outcome).toEqual({
        ok: true,
        instance: { ...target, url: TARGET.slice(0, -1) },
        added: [first, second],
        tidied: true,
      });
      expect(hold).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      // The guest's study, checked whole before anything is written.
      expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
        `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
        "pod",
      );
      const { url: _url, formatVersion: _version, ...content } = guestCard;
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
        first,
        { save: [content], remove: [] },
        { whole: true },
      );
      // The guest's FSRS-6 states come along with SM-2's.
      expect(deps.reviewStateRepository.createReviewStates).toHaveBeenCalledExactlyOnceWith(first, {
        sm2: [guestState],
        fsrs: [guestFsrs],
      });
      expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[first], [second]]);
      // Documents before the entry that names them.
      expect(
        vi.mocked(deps.deckRepository.applyCardChanges).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0]!,
      );
      expect(
        vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(deps.deckRepository.addDeck).mock.invocationCallOrder[0]!);
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
        [
          TARGET,
          [
            {
              ...answers[1],
              id: "answer-2-deck-n2",
              deckUrl: second.url,
              cardUrl: `${second.cardsDocumentUrl}#q-1`,
            },
          ],
        ],
      ]);
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledExactlyOnceWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title },
            children: [{ kind: "deck", url: first.url }],
          },
          { kind: "deck", url: second.url },
        ],
      });
      // The target's preferences stay; the guest's are not read, nor anything registered.
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
      expect(deps.instanceRepository.registerDataClasses).not.toHaveBeenCalled();
      expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
        webId: GUEST_WEBID,
        instance: guestInstance,
      });
      // Each deck's note kept while the guest's study was here, then forgotten.
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: first.url, stamp: stampOf(course) }),
      );
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${own.url} added to ${TARGET}`,
        JSON.stringify({ url: second.url, stamp: stampOf(own) }),
      );
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-n3`,
          stamp: arrangementOf(first, second),
        }),
      );
      expect(journal.size).toBe(0);
      expect(progress).toEqual([
        "read 0/6 (0 of 2)",
        "read 0/6 (1 of 2)",
        "decks 1/6 (0 of 2)",
        "decks 1/6 (1 of 2)",
        "arrange 2/6",
        "drafts 3/6 (0 of 0)",
        "verify 4/6 (0 of 5)",
        "verify 4/6 (1 of 5)",
        "verify 4/6 (2 of 5)",
        "verify 4/6 (3 of 5)",
        "verify 4/6 (4 of 5)",
        "tidy 5/6",
        "tidy 6/6",
      ]);
    });

    it("mergeGuestStudy leaves out the decks skipped, with their answers and places, and makes no groups when the guest made none", async () => {
      const { deps, guestPod } = mergeDeps();
      vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({
        readOnly: false,
        children: [],
      });
      vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
        vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
        return { keptFolder: null, keptReleases: false, keptDocuments: [] };
      });
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target, {
        skip: [course.url],
      });
      expect(outcome).toMatchObject({ ok: true, added: [added("deck-n1", own)] });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.createReviewStates).not.toHaveBeenCalled();
      expect(deps.answerLog.appendAll).toHaveBeenCalledExactlyOnceWith(TARGET, [
        expect.objectContaining({
          id: "answer-2-deck-n1",
          deckUrl: `${TARGET}catalog.ttl#deck-n1`,
        }),
      ]);
      expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
      expect(guestPod.discard).toHaveBeenCalledOnce();
    });

    describe("a guest's drafts", () => {
      const GUEST_DRAFT = draftUrlOf(GUEST_INSTANCE_URL, "solid", 1);
      const guestDraft = rebaseDraft(courseDraft(), GUEST_DRAFT);
      const DRAFT_DOCUMENTS = [
        GUEST_DRAFT,
        `${GUEST_INSTANCE_URL}drafts/solid/v1/chapter-ch-a.ttl`,
      ];
      const stamp = DRAFT_DOCUMENTS.map((url) => `${url} version of ${url}`).join("\n");
      const copyNamed = (name: string) => draftUrlOf(TARGET, name, 1);

      /** mergeDeps with the guest's draft, its documents listed, and the instance's drafts `targetDrafts`. */
      function draftDeps(targetDrafts: string[]) {
        const merge = mergeDeps();
        vi.mocked(merge.deps.instanceCopier.listResources).mockResolvedValue([
          ...RESOURCES,
          `${GUEST_INSTANCE_URL}drafts/`,
          ...DRAFT_DOCUMENTS,
        ]);
        const summaryOf = (url: string) => draftSummaryOf(rebaseDraft(guestDraft, url))!;
        const releaseDraftRepository = {
          list: vi.fn(async (url: string) =>
            url === GUEST_INSTANCE_URL ? [summaryOf(GUEST_DRAFT)] : targetDrafts.map(summaryOf),
          ),
          documents: vi.fn(async (url: string) =>
            url === GUEST_INSTANCE_URL ? DRAFT_DOCUMENTS : [],
          ),
          read: vi.fn(async () => ({ draft: guestDraft, version: "v1" })),
          create: vi.fn(async (_instance: string, draft: ReleaseDraft) => draftSummaryOf(draft)!),
        } as unknown as ReleaseDraftRepository & { create: ReturnType<typeof vi.fn> };
        return {
          ...merge,
          deps: { ...merge.deps, releaseDraftRepository },
          releaseDraftRepository,
        };
      }

      it("copies each into the instance, under the next free name, never over one of its drafts", async () => {
        const { deps, releaseDraftRepository, journal } = draftDeps([copyNamed("solid")]);
        const progress: string[] = [];
        const outcome = await createUseCases(deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
          {},
          (p) =>
            progress.push(
              `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
            ),
        );
        expect(outcome).toMatchObject({ ok: true, tidied: true });
        expect(releaseDraftRepository.read).toHaveBeenCalledWith(GUEST_DRAFT);
        expect(releaseDraftRepository.create).toHaveBeenCalledExactlyOnceWith(
          TARGET,
          rebaseDraft(guestDraft, copyNamed("solid-2")),
        );
        expect(progress).toContain("drafts 3/6 (0 of 1)");
        // Its note kept while the guest's study was here, then forgotten.
        expect(deps.updateJournal.begin).toHaveBeenCalledWith(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        expect(journal.size).toBe(0);
        // Copied before the guest's study goes.
        expect(releaseDraftRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(deps.instanceRepository.deleteInstance).mock.invocationCallOrder[0]!,
        );
      });

      it("copies one copied from this device before only when the guest changed it since, or the instance no longer has the copy", async () => {
        const unchanged = draftDeps([copyNamed("solid"), copyNamed("solid-2")]);
        unchanged.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        expect(
          await createUseCases(unchanged.deps).mergeGuestStudy(session, guestInstance, target),
        ).toMatchObject({ ok: true });
        expect(unchanged.releaseDraftRepository.create).not.toHaveBeenCalled();

        const changed = draftDeps([copyNamed("solid"), copyNamed("solid-2")]);
        changed.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp: "older versions" }),
        );
        await createUseCases(changed.deps).mergeGuestStudy(session, guestInstance, target);
        expect(changed.releaseDraftRepository.create).toHaveBeenCalledExactlyOnceWith(
          TARGET,
          rebaseDraft(guestDraft, copyNamed("solid-3")),
        );

        const gone = draftDeps([copyNamed("solid")]);
        gone.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        await createUseCases(gone.deps).mergeGuestStudy(session, guestInstance, target);
        expect(gone.releaseDraftRepository.create).toHaveBeenCalledOnce();
      });

      it("keeps the guest's study, and the decks added, when a draft cannot be copied", async () => {
        const { deps, releaseDraftRepository } = draftDeps([]);
        releaseDraftRepository.create.mockRejectedValueOnce(
          new AppError("changedElsewhere", { url: `${TARGET}catalog.ttl` }),
        );
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toMatchObject({
          ok: false,
          step: "drafts",
          error: { code: "changedElsewhere" },
          added: [added("deck-n1", course), added("deck-n2", own)],
          copied: [],
        });
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      });

      it("says which drafts are in the instance when it fails after copying them, those copied before among them", async () => {
        const fresh = draftDeps([]);
        const listed = [...RESOURCES, `${GUEST_INSTANCE_URL}drafts/`, ...DRAFT_DOCUMENTS];
        vi.mocked(fresh.deps.instanceCopier.listResources)
          .mockResolvedValueOnce(listed)
          .mockResolvedValueOnce([...listed, `${GUEST_INSTANCE_URL}new.ttl`]);
        const outcome = await createUseCases(fresh.deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
        );
        expect(outcome).toMatchObject({
          ok: false,
          step: "verify",
          error: { code: "guestStudyChanged" },
          copied: [{ url: copyNamed("solid"), name: "solid" }],
        });
        expect(fresh.deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();

        const before = draftDeps([copyNamed("solid")]);
        before.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid"), stamp }),
        );
        vi.mocked(before.deps.instanceCopier.listResources)
          .mockResolvedValueOnce(listed)
          .mockResolvedValueOnce([]);
        const again = await createUseCases(before.deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
        );
        expect(again).toMatchObject({
          ok: false,
          step: "verify",
          copied: [{ url: copyNamed("solid"), name: "solid" }],
        });
        expect(before.releaseDraftRepository.create).not.toHaveBeenCalled();
      });
    });

    it("mergeGuestStudy adds a deck it added from this device before, unchanged since, only its answers again", async () => {
      const { deps, journal } = mergeDeps();
      const before = added("deck-earlier", course);
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck, before],
      );
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: stampOf(course) }),
      );
      journal.set(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-earlier`,
          stamp: arrangementOf(before, added("deck-n1", own)),
        }),
      );
      // A note of a deck the instance no longer has is no reason to leave one out.
      journal.set(
        `${own.url} added to ${TARGET}`,
        JSON.stringify({ url: `${TARGET}catalog.ttl#deck-removed`, stamp: stampOf(own) }),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      expect(outcome).toMatchObject({ ok: true, added: [before, added("deck-n1", own)] });
      expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[added("deck-n1", own)]]);
      // The same entries as before: adding them again changes nothing.
      expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [
        expect.objectContaining({ id: "answer-1-deck-earlier", deckUrl: before.url }),
      ]);
      expect(vi.mocked(deps.updateJournal.begin).mock.calls.map(([key]) => key)).toEqual([
        `${own.url} added to ${TARGET}`,
        `${GROUP.url} added to ${TARGET}`,
      ]);
      // The group an earlier run made is made under the same URL: a graft already made changes nothing.
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-earlier`, title: GROUP.title },
            children: [{ kind: "deck", url: before.url }],
          },
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
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: "older versions" }),
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: true,
        added: [added("deck-n1", course)],
      });
      // Its answers are entries of their own, beside those of the deck added before: no entry names two decks.
      expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [
        expect.objectContaining({
          id: "answer-1-deck-n1",
          deckUrl: `${TARGET}catalog.ttl#deck-n1`,
        }),
      ]);
    });

    it("mergeGuestStudy adds again a deck whose entry alone the guest changed since, and makes groups arranged otherwise anew", async () => {
      const { deps, journal } = mergeDeps();
      const before = added("deck-earlier", course);
      const renamed = { ...course, title: { en: "Renamed" }, newCardsPerDay: 5 };
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [renamed, own] : [targetDeck, before],
      );
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: stampOf(course) }),
      );
      journal.set(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-earlier`,
          stamp: arrangementOf(before, added("deck-n1", own)),
        }),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      const again = added("deck-n1", renamed);
      expect(outcome).toMatchObject({ ok: true, added: [again, added("deck-n2", own)] });
      expect(deps.deckRepository.addDeck).toHaveBeenCalledWith(again);
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title },
            children: [{ kind: "deck", url: again.url }],
          },
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
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
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
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: true });
    });

    it("mergeGuestStudy adds only from the guest's pod to an instance of a user who logged in", async () => {
      const { deps } = mergeDeps();
      const useCases = createUseCases(deps);
      const refusal =
        "A guest's study is added from the guest's pod to an instance of a user who logged in.";
      await expect(useCases.mergeGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(
        refusal,
      );
      await expect(useCases.mergeGuestStudy(session, instance, target)).rejects.toThrow(refusal);
      await expect(useCases.mergeGuestStudy(session, guestInstance, guestInstance)).rejects.toThrow(
        refusal,
      );
    });

    it("mergeGuestStudy adds nothing from a guest's study that does not conform, or that a newer version wrote", async () => {
      const { deps } = mergeDeps();
      const violation = {
        message: { en: "x" },
        severity: "violation" as const,
        constraint: "MinCount",
      };
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
        url,
        status: "checked" as const,
        subjects: url.endsWith("catalog.ttl")
          ? [
              {
                url: `${url}#x`,
                status: "checked" as const,
                shape: "deck" as const,
                version: 6,
                violations: [violation],
              },
            ]
          : [],
      }));
      expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toEqual({
        ok: false,
        instance: target,
        step: "read",
        error: new AppError("guestStudyInvalid", { count: 1 }),
        added: [],
        copied: [],
      });
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
        url,
        status: "checked" as const,
        subjects: [
          {
            url: `${url}#x`,
            status: "newer" as const,
            shape: "card" as const,
            version: 9,
            latest: 5,
          },
        ],
      }));
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "read",
        error: new AppError("guestStudyTooNew"),
      });
      expect(deps.deckRepository.addDeck).not.toHaveBeenCalled();
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy writes nothing of a deck that would still name the guest's pod", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        { ...guestCard, frontImageUrl: `${GUEST_ORIGIN}picture.png` },
      ]);
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
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
      vi.mocked(deps.deckRepository.addDeck)
        .mockResolvedValueOnce(added("deck-n1", own))
        .mockRejectedValueOnce(new Error("offline"));
      vi.mocked(deps.deckRepository.deleteDocument).mockRejectedValueOnce(
        new Error("still offline"),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      expect(outcome).toEqual({
        ok: false,
        instance: target,
        step: "decks",
        error: new Error("offline"),
        added: [added("deck-n1", own)],
        copied: [],
      });
      // The entry was not written after all: the documents nothing names go.
      expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(`${TARGET}catalog.ttl#deck-n2`);
      expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n2` }),
          `${TARGET}decks/deck-n2.ttl`,
        ],
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n2` }),
          `${TARGET}reviews/deck-n2.ttl`,
        ],
      ]);
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      expect(journal.size).toBe(1);
      expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy deletes only what it wrote of a deck it could not add, and counts a deck whose entry was written though its answer was lost", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.reviewStateRepository.createReviewStates).mockRejectedValueOnce(
        new AppError("createdElsewhere", { url: "x" }),
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: false, step: "decks", added: [], copied: [] });
      expect(deps.deckRepository.readDeck).not.toHaveBeenCalled();
      // The cards document it wrote goes; the reviews document someone else created stays.
      expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n1` }),
          `${TARGET}decks/deck-n1.ttl`,
        ],
      ]);

      const lost = mergeDeps();
      const there = added("deck-n1", course);
      vi.mocked(lost.deps.deckRepository.addDeck).mockRejectedValueOnce(
        new Error("connection reset"),
      );
      vi.mocked(lost.deps.deckRepository.readDeck).mockResolvedValueOnce(there);
      expect(
        await createUseCases(lost.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: true,
        added: [there, added("deck-n2", own)],
      });
      expect(lost.deps.deckRepository.deleteDocument).not.toHaveBeenCalled();

      const unknown = mergeDeps();
      vi.mocked(unknown.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new Error("connection reset"),
      );
      vi.mocked(unknown.deps.deckRepository.readDeck).mockRejectedValueOnce(new Error("offline"));
      expect(
        await createUseCases(unknown.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: false, step: "decks" });
      // A write whose answer was lost may have been made: its document goes, as nothing names it.
      expect(vi.mocked(unknown.deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n1` }),
          `${TARGET}decks/deck-n1.ttl`,
        ],
      ]);
    });

    it.each([
      [
        "decks",
        (deps: MergeDeps) =>
          vi.mocked(deps.answerLog.appendAll).mockRejectedValueOnce(new Error("boom")),
        1,
      ],
      [
        "arrange",
        (deps: MergeDeps) =>
          vi.mocked(deps.deckRepository.editDeckTree).mockRejectedValueOnce(new Error("boom")),
        2,
      ],
    ] as const)(
      "mergeGuestStudy failing at %s keeps the decks added and the guest's study",
      async (step, fail, count) => {
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
      },
    );

    it("mergeGuestStudy keeps the guest's study when it changed while it was being added", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.instanceCopier.listResources)
        .mockResolvedValueOnce(RESOURCES)
        .mockResolvedValueOnce([...RESOURCES, `${GUEST_INSTANCE_URL}new.ttl`]);
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "verify",
        error: new AppError("guestStudyChanged"),
      });
      const changed = mergeDeps();
      let reads = 0;
      vi.mocked(changed.deps.instanceCopier.versionOf).mockImplementation(async (url) =>
        url.endsWith("2026-10.ttl") && ++reads > 1 ? "newer" : `version of ${url}`,
      );
      expect(
        await createUseCases(changed.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "verify",
        error: new AppError("guestStudyChanged", {
          url: `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
        }),
      });
      expect(changed.deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy says the study was added even when the guest's could not be deleted, and keeps its notes", async () => {
      const { deps, journal } = mergeDeps();
      vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: true, tidied: false });
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
      await useCases.recordReview(
        GUEST_INSTANCE_URL,
        own,
        { card, direction: "front-to-back" },
        4,
        new Date("2026-10-03T10:00:00.000Z"),
      );
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
    vi.mocked(deps.instanceCopier.deleteRecursively).mockRejectedValueOnce(
      new Error("still offline"),
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({
      ok: false,
      step: "copy",
      error: "offline",
      cleanedUp: false,
      leftoverUrl: TARGET,
    });
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
  });
});
