// @vitest-environment node
/**
 * A library deck upgrade against a real Solid server (docs/migrations.md):
 * the app's own use cases and Solid adapters, wired as in main.tsx, over a
 * fetch that records every request as it reaches the server (after the
 * write fence). The upgrade backs the deck's documents up, writes them in
 * place, each only while it is as backed up, reads them back and moves
 * the catalog entry to the new release; a failure after a write puts back
 * what it wrote. No document changes its address.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer } from "n3";
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
import { createSolidDocumentBackups } from "@solid-memo/solid/solidDocumentBackups";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { aclOf, changeElsewhere, etagMarksEveryEdit, preconditionsOf, type Preconditions } from "./serverTraits";

const SERVERS = inject("solidServers");
const LIBRARY = "https://solid-memo.test/decks/capitals/";
const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const FRIEND = "https://bob.example/profile/card#me";
/** A predicate of another app's, which the upgrade keeps where it is. */
const FOREIGN = "https://other-app.example/ns#note";

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
  ifMatch: string | null;
  ifNoneMatch: string | null;
  /** The pod's answer, once it came. */
  status?: number;
}

/** The app as main.tsx wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(options: { failOn?: (request: Recorded) => boolean; onRequest?: (request: Recorded) => Promise<void> } = {}) {
  const record = (input: RequestInfo | URL, init?: RequestInit): Recorded => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    return {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
    };
  };
  /** Each request as it reaches the server, after the fence: with the If-Match it set, and its own checks. */
  const sent: Recorded[] = [];
  const writeFence = createWriteFence(async (input, init) => {
    const recorded = record(input, init);
    sent.push(recorded);
    if (options.failOn?.(recorded)) return new Response("injected failure", { status: 500 });
    const response = await fetch(input, init);
    recorded.status = response.status;
    return response;
  });
  // What the app attempts, before the fence: where another device's change is made, as the app is about to write.
  const podFetch: typeof fetch = async (input, init) => {
    await options.onRequest?.(record(input, init));
    return writeFence.fetch(input, init);
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
    documentBackups: createSolidDocumentBackups({ fetch: podFetch, checkWrite }),
    writeFence,
  });
  return { useCases, deckRepository, reviewStateRepository, sent };
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const instanceOf = (deck: Deck) => deck.url.slice(0, deck.url.lastIndexOf("/") + 1);

/** A document's triples, as N-Triples lines, sorted: what it says, however the server writes it. */
async function said(url: string): Promise<string[]> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" })
    .quadsToString(new Parser({ baseIRI: url }).parse(turtle))
    .split("\n")
    .filter((line) => line !== "")
    .sort();
}

describe.each(SERVERS)("a library deck upgrade on $name", ({ url: server }) => {
  /** What this server does with preconditions (preconditionsOf). */
  let conditional: Preconditions = { edits: false, creations: false };
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = await preconditionsOf(server);
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("upgrades the deck where it is: its documents, review states and sharing kept, every write conditional, the backup gone", async () => {
    const deck = await seedDeck(server);
    // Another app's triple on a card, and a subject of its own, in the cards document.
    await changeElsewhere(deck.cardsDocumentUrl, `<#sweden> <${FOREIGN}> "kept" . <#other-app> <${FOREIGN}> "theirs" .`);
    const { useCases, deckRepository, reviewStateRepository, sent } = app();
    const acl = await aclOf(deck.cardsDocumentUrl);
    const aclBefore = await fetch(acl).then((response) => response.text());
    const versions = new Map<string, string | null>();
    for (const url of [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]) versions.set(url, (await fetch(url)).headers.get("etag"));
    const plan = (await useCases.planLibraryUpgrade(deck))!;
    expect(plan).toMatchObject({ toVersion: "2", add: [{ id: "norway" }], change: [{ id: "sweden" }], remove: [{ id: "latvia" }] });

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, tidied: true });
    const upgraded = (await deckRepository.readDeck(deck.url))!;
    expect(upgraded).toMatchObject({
      url: deck.url,
      cardsDocumentUrl: deck.cardsDocumentUrl,
      reviewsDocumentUrl: deck.reviewsDocumentUrl,
      sourceUrl: V2.url,
      formatVersion: 6,
      title: { en: "Capitals", sv: "Huvudstäder" },
      // Still the old release's, the keywords take up the new release's, every language.
      keywords: { en: ["capitals", "europe"], sv: ["huvudstader"] },
    });
    const cards = await deckRepository.listCards(upgraded);
    expect(cards.map((card) => [card.id, card.back.en]).sort()).toEqual([
      ["denmark", "Copenhagen"],
      ["norway", "Oslo"],
      ["sweden", "Stockholm"],
    ]);
    expect(await reviewStateRepository.listReviewStates(upgraded)).toEqual([review("sweden", 6)]);
    // Who may open the cards is as it was: their access rules are untouched.
    expect(await fetch(acl).then((response) => response.text())).toBe(aclBefore);
    // The other app's triple and subject survive the cards' whole write.
    expect(await said(deck.cardsDocumentUrl)).toEqual(
      expect.arrayContaining([
        `<${deck.cardsDocumentUrl}#sweden> <${FOREIGN}> "kept" .`,
        `<${deck.cardsDocumentUrl}#other-app> <${FOREIGN}> "theirs" .`,
      ]),
    );

    // Each document written once, only of the version backed up; everything else written was the backup's, or the entry.
    const writes = sent.filter(isWrite);
    const backups = `${instanceOf(deck)}backups/`;
    for (const url of [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]) {
      const own = writes.filter((request) => request.url === url);
      expect(own.map((request) => request.method), url).toEqual(url === deck.cardsDocumentUrl ? ["PUT"] : [expect.stringMatching(/^(PATCH|PUT)$/)]);
      if (conditional.edits) expect(own[0]!.ifMatch, url).toBe(versions.get(url));
      else expect(sent[sent.indexOf(own[0]!) - 1], url).toMatchObject({ method: "GET", url });
    }
    expect(
      writes.filter((request) => ![deck.cardsDocumentUrl, deck.reviewsDocumentUrl, `${instanceOf(deck)}catalog.ttl`].includes(request.url) && !request.url.startsWith(backups)),
    ).toEqual([]);
    // The entry, the last write, made once, only of the catalog document as it was read, where the server enforces it.
    const entry = writes.filter((request) => request.url === `${instanceOf(deck)}catalog.ttl`);
    expect(entry).toHaveLength(1);
    if (conditional.edits) expect(entry[0]!.ifMatch).toMatch(/^"/);
    expect(writes.indexOf(entry[0]!)).toBeGreaterThan(Math.max(...[deck.cardsDocumentUrl, deck.reviewsDocumentUrl].map((url) => writes.findIndex((request) => request.url === url))));
    for (const write of writes.filter((request) => request.url.startsWith(backups) && request.method === "PUT")) {
      expect(write.ifNoneMatch, write.url).toBe("*");
    }
    await expect(useCases.listBackups({ url: instanceOf(deck), name: "Main" })).resolves.toEqual([]);
    expect(await status(backups)).toBe(404);
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

  it("writes nothing over a review saved elsewhere while it runs, and puts back the cards it wrote", async () => {
    const deck = await seedDeck(server);
    const cardsBefore = await said(deck.cardsDocumentUrl);
    const elsewhere = app().reviewStateRepository;
    let reviewed = false;
    const { useCases, deckRepository } = app({
      // Another device answers a card just as the upgrade writes the review states.
      onRequest: async (request) => {
        if (reviewed || !isWrite(request) || request.url !== deck.reviewsDocumentUrl) return;
        reviewed = true;
        // A server whose versions are to the second needs the next second to tell.
        if (!everyEdit) await sleep(1100);
        await elsewhere.saveReviewState(deck, review("denmark", 1));
      },
    });
    const plan = (await useCases.planLibraryUpgrade(deck))!;

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(reviewed).toBe(true);
    expect(outcome).toMatchObject({ ok: false, step: "write", asItWas: true, error: { code: "changedElsewhere" } });
    expect(await deckRepository.readDeck(deck.url)).toEqual(deck);
    expect(await said(deck.cardsDocumentUrl)).toEqual(cardsBefore);
    const states = await app().reviewStateRepository.listReviewStates(deck);
    expect(states.map((state) => state.cardId).sort()).toEqual(["denmark", "latvia", "sweden"]);
    await expect(useCases.listBackups({ url: instanceOf(deck), name: "Main" })).resolves.toEqual([]);
  });

  it("puts the deck back as it was when the entry cannot be moved to the new release", async () => {
    const deck = await seedDeck(server);
    const before = [await said(deck.cardsDocumentUrl), await said(deck.reviewsDocumentUrl)];
    const { useCases, deckRepository } = app({
      failOn: (request) => isWrite(request) && request.url.endsWith("/catalog.ttl"),
    });
    const plan = (await useCases.planLibraryUpgrade(deck))!;

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome).toMatchObject({ ok: false, step: "entry", asItWas: true });
    expect(await deckRepository.readDeck(deck.url)).toEqual(deck);
    expect([await said(deck.cardsDocumentUrl), await said(deck.reviewsDocumentUrl)]).toEqual(before);
    await expect(useCases.listBackups({ url: instanceOf(deck), name: "Main" })).resolves.toEqual([]);
  });

  it("upgrades a deck an earlier version moved to documents of its own, where they are", async () => {
    const seeded = await seedDeck(server);
    const { useCases, deckRepository } = app();
    // As an upgrade by an earlier version left it: its cards moved to decks/<id>-<uuid>.ttl, every IRI of
    // the document with them, and its reviews document kept, its states naming their cards in the first one.
    const moved = seeded.cardsDocumentUrl.replace(/\.ttl$/, "-0f3a.ttl");
    const turtle = await fetch(seeded.cardsDocumentUrl, { headers: { accept: "text/turtle" } }).then((response) => response.text());
    const put = await fetch(moved, { method: "PUT", headers: { "content-type": "text/turtle" }, body: turtle.split(seeded.cardsDocumentUrl).join(moved) });
    expect(put.ok).toBe(true);
    const deck = await deckRepository.upgradeDeckEntry(seeded, { ...seeded, cardsDocumentUrl: moved });
    expect(await deckRepository.listCards(deck)).toHaveLength(3);

    const outcome = await useCases.applyLibraryUpgrade(deck, (await useCases.planLibraryUpgrade(deck))!);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    expect(await deckRepository.readDeck(deck.url)).toMatchObject({ cardsDocumentUrl: moved, reviewsDocumentUrl: seeded.reviewsDocumentUrl, sourceUrl: V2.url });
    expect((await deckRepository.listCards(deck)).map((card) => card.id).sort()).toEqual(["denmark", "norway", "sweden"]);
    // The states written before the move name their cards in the first document, and are read all the same.
    expect(await app().reviewStateRepository.listReviewStates(deck)).toEqual([review("sweden", 6)]);
  });
});
