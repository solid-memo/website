// @vitest-environment node
/**
 * A library deck upgrade against a real Solid server (docs/migrations.md):
 * the app's own use cases and Solid adapters, wired as in main.tsx, over a
 * fetch that records every request. The upgrade writes new documents,
 * checks them and switches the deck's catalog entry over; the deck's own
 * documents are never written, only deleted once the deck has moved.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { DeckLibrary } from "@solid-memo/application/ports";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryCard, LibraryDeckContent } from "@solid-memo/domain/library";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import type { ReviewState } from "@solid-memo/domain/review";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { aclOf, ETAG_OUTLIVES_EDITS, etagMarksEveryEdit } from "./serverTraits";

const SERVERS = inject("solidServers");
const LIBRARY = "https://solid-memo.test/decks/capitals/";
const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const FRIEND = "https://bob.example/profile/card#me";

const libraryCard = (id: string, back: string): LibraryCard => ({
  id,
  front: { en: id },
  back: { en: back },
  formatVersion: 4,
});

function release(version: number, cards: LibraryCard[]): LibraryDeckContent {
  return {
    url: `${LIBRARY}v${version}.ttl`,
    seriesUrl: librarySeriesUrlOf(`${LIBRARY}v1.ttl`),
    title: version === 1 ? { en: "Capitals" } : { en: "Capitals", sv: "Huvudstäder" },
    description: { en: "Capitals of Europe." },
    formatVersion: 5,
    authors: ["Anton Wiklund"],
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    direction: "front-to-back",
    version: String(version),
    themes: [],
    // Release 2 adds a keyword in English and its Swedish keywords, ASCII:
    // the Community Solid Server's in-memory store cuts a patched document
    // with more characters outside ASCII short (docs/testing.md).
    keywords: version === 1 ? { en: ["capitals"] } : { en: ["capitals", "europe"], sv: ["huvudstader"] },
    cards,
  };
}

/** Release 1, and release 2: Sweden fixed, Latvia removed, Norway added. */
const V1 = release(1, [libraryCard("sweden", "Stockholm?"), libraryCard("denmark", "Copenhagen"), libraryCard("latvia", "Riga")]);
const V2 = release(2, [libraryCard("sweden", "Stockholm"), libraryCard("denmark", "Copenhagen"), libraryCard("norway", "Oslo")]);

const library: DeckLibrary = {
  listLibraryDecks: async () => [
    {
      url: V2.url,
      seriesUrl: V2.seriesUrl,
      version: "2",
      releases: [
        { url: V1.url, version: "1" },
        { url: V2.url, version: "2" },
      ],
      themes: [],
      keywords: V2.keywords,
      title: V2.title,
      cardCount: V2.cards.length,
      authors: V2.authors,
      direction: V2.direction,
      sources: [],
    },
  ],
  fetchLibraryDeck: async (url) => (url === V2.url ? V2 : V1),
  fetchCourseOutline: async (releaseUrl) => ({ releaseUrl, chapters: [] }),
};

const review = (cardId: string, intervalDays: number): ReviewState => ({
  cardId,
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays,
  repetitions: 2,
  due: "2026-10-09",
  firstReviewedAt: "2026-09-20T10:00:00.000Z",
  lastReviewedAt: "2026-10-03T10:00:00.000Z",
  formatVersion: 2,
});

interface Recorded {
  method: string;
  url: string;
  /** The pod's answer, once it came. */
  status?: number;
}

/** The app as main.tsx wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(options: { failOn?: (request: Recorded) => boolean; onRequest?: (request: Recorded) => Promise<void> } = {}) {
  const writeFence = createWriteFence(fetch);
  const attempts: Recorded[] = [];
  const podFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const recorded: Recorded = {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
    };
    attempts.push(recorded);
    await options.onRequest?.(recorded);
    if (options.failOn?.(recorded)) return new Response("injected failure", { status: 500 });
    const response = await writeFence.fetch(input, init);
    recorded.status = response.status;
    return response;
  };
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  const deckRepository = createSolidDeckRepository(deps);
  const reviewStateRepository = createSolidReviewStateRepository(deps);
  const useCases: UseCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: library,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository,
    preferencesRepository: createSolidPreferencesRepository(deps),
    reviewStateRepository,
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
  });
  return { useCases, deckRepository, reviewStateRepository, attempts };
}

/** A fresh instance holding a copy of release 1, studied (Sweden and Latvia reviewed), its cards shared with a friend. */
async function seedDeck(server: string): Promise<Deck> {
  const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
  const { deckRepository, reviewStateRepository } = app();
  const deck = await deckRepository.importDeck(instanceUrl, V1);
  await reviewStateRepository.applyReviewChanges(deck, { save: [], remove: [] });
  for (const state of [review("sweden", 6), review("latvia", 3)]) await reviewStateRepository.saveReviewState(deck, state);
  const response = await fetch(await aclOf(deck.cardsDocumentUrl), {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body: `@prefix acl: <http://www.w3.org/ns/auth/acl#> . @prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#public> a acl:Authorization ; acl:agentClass foaf:Agent ; acl:accessTo <${deck.cardsDocumentUrl}> ;
    acl:mode acl:Read, acl:Write, acl:Control .
<#friend> a acl:Authorization ; acl:agent <${FRIEND}> ; acl:accessTo <${deck.cardsDocumentUrl}> ; acl:mode acl:Read .`,
  });
  if (!response.ok) throw new Error(`Sharing ${deck.cardsDocumentUrl}: ${response.status}`);
  return (await deckRepository.readDeck(deck.url))!;
}

const status = async (url: string) => (await fetch(url, { method: "HEAD" })).status;
const isWrite = (request: Recorded) => !READS.has(request.method);

describe.each(SERVERS)("a library deck upgrade on $name", ({ url: server }) => {
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("moves the deck into new documents, keeping its URL, review states and sharing, and never writes its old ones", async () => {
    const deck = await seedDeck(server);
    const { useCases, deckRepository, reviewStateRepository, attempts } = app();
    const oldAcl = await aclOf(deck.cardsDocumentUrl);
    const plan = (await useCases.planLibraryUpgrade(deck))!;
    expect(plan).toMatchObject({ toVersion: "2", add: [{ id: "norway" }], change: [{ id: "sweden" }], remove: [{ id: "latvia" }] });

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, tidied: true });
    const upgraded = (await deckRepository.readDeck(deck.url))!;
    expect(upgraded).toMatchObject({
      url: deck.url,
      sourceUrl: V2.url,
      formatVersion: 6,
      title: { en: "Capitals", sv: "Huvudstäder" },
      // Still the old release's, the keywords take up the new release's, every language.
      keywords: { en: ["capitals", "europe"], sv: ["huvudstader"] },
    });
    expect(upgraded.cardsDocumentUrl).toMatch(new RegExp(`/decks/${deck.id}-[0-9a-f-]+\\.ttl$`));
    expect(upgraded.reviewsDocumentUrl).toMatch(new RegExp(`/reviews/${deck.id}-[0-9a-f-]+\\.ttl$`));
    const cards = await deckRepository.listCards(upgraded);
    expect(cards.map((card) => [card.id, card.back.en]).sort()).toEqual([
      ["denmark", "Copenhagen"],
      ["norway", "Oslo"],
      ["sweden", "Stockholm"],
    ]);
    expect(cards.every((card) => card.url.startsWith(`${upgraded.cardsDocumentUrl}#`))).toBe(true);
    expect(await reviewStateRepository.listReviewStates(upgraded)).toEqual([review("sweden", 6)]);

    const acl = await fetch(await aclOf(upgraded.cardsDocumentUrl)).then((response) => response.text());
    expect(acl).toContain(FRIEND);
    expect(await status(deck.cardsDocumentUrl)).toBe(404);
    expect(await status(oldAcl)).toBe(404);
    expect(await status(deck.reviewsDocumentUrl)).toBe(404);
    const toOld = attempts.filter(
      (request) => isWrite(request) && [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].includes(request.url),
    );
    expect(toOld.map((request) => request.method)).toEqual(["DELETE", "DELETE"]);
  });

  it("keeps the keywords the user changed, in every language", async () => {
    const seeded = await seedDeck(server);
    const { useCases, deckRepository } = app();
    const deck = await useCases.describeDeck(seeded, {
      description: { en: "Capitals of Europe." },
      topics: [],
      keywords: { en: ["capitals", "mine"] },
    });
    const plan = (await useCases.planLibraryUpgrade(deck))!;
    expect(plan.keywords).toBeUndefined();

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    expect((await deckRepository.readDeck(deck.url))!.keywords).toEqual({ en: ["capitals", "mine"] });
  });

  it("gives up, deleting what it wrote, when a review is saved elsewhere while it runs", async (context) => {
    const deck = await seedDeck(server);
    // Without ETags the upgrade compares contents, which no edit outlives.
    const tagged = (await fetch(deck.reviewsDocumentUrl)).headers.get("etag") !== null;
    if (tagged && !everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const elsewhere = app().reviewStateRepository;
    let reviewed = false;
    const { useCases, deckRepository, attempts } = app({
      // Another device answers a card as the upgrade writes the new review states.
      onRequest: async (request) => {
        if (reviewed || !isWrite(request) || !request.url.includes(`/reviews/${deck.id}-`)) return;
        reviewed = true;
        await elsewhere.saveReviewState(deck, review("denmark", 1));
      },
    });
    const plan = (await useCases.planLibraryUpgrade(deck))!;

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome).toMatchObject({ ok: false, step: "verify", cleanedUp: true });
    expect(await deckRepository.readDeck(deck.url)).toEqual(deck);
    const states = await app().reviewStateRepository.listReviewStates(deck);
    expect(states.map((state) => state.cardId).sort()).toEqual(["denmark", "latvia", "sweden"]);
    expect(await deckRepository.listCards(deck)).toHaveLength(3);
    const created = [...new Set(attempts.filter((r) => r.method === "PUT" && r.url.includes(`${deck.id}-`)).map((r) => r.url))];
    for (const url of created) expect(await status(url)).toBe(404);
  });

  it("leaves the deck as it was, and no new documents, when the switch fails", async () => {
    const deck = await seedDeck(server);
    const { useCases, deckRepository, attempts } = app({
      failOn: (request) => isWrite(request) && request.url.endsWith("/catalog.ttl"),
    });
    const plan = (await useCases.planLibraryUpgrade(deck))!;

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome).toMatchObject({ ok: false, step: "switch", cleanedUp: true });
    expect(await deckRepository.readDeck(deck.url)).toEqual(deck);
    const created = [...new Set(attempts.filter((r) => r.method === "PUT" && r.url.includes(`${deck.id}-`)).map((r) => r.url))];
    expect(created.filter((url) => !url.endsWith(".acl"))).toHaveLength(2);
    for (const url of created.filter((url) => !url.endsWith(".acl"))) expect(await status(url)).toBe(404);
    expect(await status(deck.cardsDocumentUrl)).toBe(200);
  });
});
