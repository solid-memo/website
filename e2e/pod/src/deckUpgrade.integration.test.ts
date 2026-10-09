// @vitest-environment node
/**
 * A library deck upgrade against a real Solid server (docs/migrations.md):
 * the app's own use cases and Solid adapters, wired as in main.tsx, over a
 * fetch that records every request as it reaches the server (after the
 * write fence). The upgrade backs up the bytes of the deck's documents,
 * upgrades and checks a working copy of them, writes them in place, each
 * only while it is as backed up, checks them again and moves the catalog
 * entry to the new release; a failure after a write puts back what it
 * wrote, byte for byte. No document changes its address.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { DeckLibrary, ShapeValidator } from "@solid-memo/application/ports";
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
  contentType: string | null;
  /** The pod's answer, once it came. */
  status?: number;
}

/** The app as main.tsx wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(
  options: {
    /** Answers the request with a failure of its own, after the fence: the pod never sees it. */
    failOn?: (request: Recorded) => boolean;
    /** Runs as the app is about to make the request: another device's doing. */
    onRequest?: (request: Recorded) => Promise<void>;
    /** The request is made, and its answer lost on the way: the app sees a network failure. */
    loseAnswer?: (request: Recorded) => boolean;
    /** What the shape check says of a document, from what it would have said. */
    check?: (url: string, report: Awaited<ReturnType<ShapeValidator["validateDocument"]>>) => typeof report;
  } = {},
) {
  const record = (input: RequestInfo | URL, init?: RequestInit): Recorded => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    return {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
      contentType: headers.get("Content-Type"),
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
    const recorded = record(input, init);
    await options.onRequest?.(recorded);
    const response = await writeFence.fetch(input, init);
    if (options.loseAnswer?.(recorded)) throw new TypeError("Failed to fetch");
    return response;
  };
  const validator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const shapeValidator: typeof validator =
    options.check === undefined
      ? validator
      : { ...validator, validateDocument: async (url) => options.check!(url, await validator.validateDocument(url)) };
  const checkWrite = validator.checkSubjects;
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

/**
 * The document written again as a person might write it by hand: prefixes
 * of its own, a comment, its statements in the order opposite to the
 * server's, the document's own IRIs relative, and a blank node of another
 * app's on a card, which a server's rewrite would not keep as they are.
 */
async function writeByHand(url: string, note: string, extra = ""): Promise<void> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  const quads = new Parser({ baseIRI: url }).parse(turtle).reverse();
  const writer = new Writer({ prefixes: { c: "https://solid-memo.com/ns/vocab/v1.ttl#", t: "http://purl.org/dc/terms/", x: "http://www.w3.org/2001/XMLSchema#" } });
  writer.addQuads(quads);
  const written = await new Promise<string>((resolve, reject) => writer.end((error, result: string) => (error ? reject(error) : resolve(result))));
  const body = `# ${note}\n${written.split(`<${url}#`).join("<#")}\n${extra}\n`;
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
  if (!response.ok) throw new Error(`Writing ${url} by hand: ${response.status}`);
}

/** The bytes the server serves for each document, asked for as the app asks (Accept: text/turtle), one character a byte. */
async function servedBytes(urls: readonly string[]): Promise<string[]> {
  return Promise.all(urls.map(async (url) => Buffer.from(await (await fetch(url, { headers: { accept: "text/turtle" } })).arrayBuffer()).toString("latin1")));
}

const status = async (url: string) => (await fetch(url, { method: "HEAD" })).status;
const isWrite = (request: Recorded) => !READS.has(request.method);

/**
 * Each document's last write put it back: its bytes whole (PUT) with the
 * Content-Type they were served with, held to the version the upgrade left
 * it at (If-Match where the server enforces it, else right after a read
 * of it).
 */
function expectPutBack(sent: Recorded[], documents: readonly string[], conditional: Preconditions): void {
  for (const url of documents) {
    const putBack = sent.filter((request) => request.method === "PUT" && request.url === url).at(-1);
    expect(putBack, url).toBeDefined();
    expect(sent.filter((request) => isWrite(request) && request.url === url).at(-1), url).toBe(putBack);
    expect(putBack!.contentType, url).toMatch(/^text\/turtle/);
    if (conditional.edits) expect(putBack!.ifMatch, url).toMatch(/^"/);
    else expect(sent[sent.indexOf(putBack!) - 1], url).toMatchObject({ method: "GET", url });
  }
}
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

  it("upgrades the deck where it is: its documents, review states and sharing kept, every write conditional, its backup and working copy gone", async () => {
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

    // Each document written once, only of the version backed up, after its working copy was written;
    // everything else written was in the upgrade's folder, or the entry.
    const writes = sent.filter(isWrite);
    const backups = `${instanceOf(deck)}backups/`;
    const folder = writes.find((request) => request.url.startsWith(backups) && request.url.endsWith("/manifest.ttl"))!.url.replace(/manifest\.ttl$/, "");
    for (const url of [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]) {
      const own = writes.filter((request) => request.url === url);
      expect(own.map((request) => request.method), url).toEqual(url === deck.cardsDocumentUrl ? ["PUT"] : [expect.stringMatching(/^(PATCH|PUT)$/)]);
      if (conditional.edits) expect(own[0]!.ifMatch, url).toBe(versions.get(url));
      else expect(sent[sent.indexOf(own[0]!) - 1], url).toMatchObject({ method: "GET", url });
      // After its bytes were kept, and its working copy upgraded.
      const path = url.slice(instanceOf(deck).length);
      expect(writes.indexOf(own[0]!), url).toBeGreaterThan(writes.findIndex((request) => request.url === `${folder}${path}.orig`));
      const stagedWrites = writes.filter((request) => request.url === `${folder}staging/${path}` && request.method !== "DELETE");
      expect(stagedWrites.length, url).toBeGreaterThan(0);
      expect(writes.indexOf(own[0]!), url).toBeGreaterThan(writes.indexOf(stagedWrites.at(-1)!));
    }
    expect(
      writes.filter(
        (request) =>
          ![deck.cardsDocumentUrl, deck.reviewsDocumentUrl, `${instanceOf(deck)}catalog.ttl`].includes(request.url) &&
          !request.url.startsWith(backups),
      ),
    ).toEqual([]);
    // No access control but the upgrade's own files' is written.
    expect(writes.filter((request) => request.url.endsWith(".acl") && !request.url.startsWith(backups))).toEqual([]);
    // The entry, the last write, made once, only of the catalog document as it was read, where the server enforces it.
    const entry = writes.filter((request) => request.url === `${instanceOf(deck)}catalog.ttl`);
    expect(entry).toHaveLength(1);
    if (conditional.edits) expect(entry[0]!.ifMatch).toMatch(/^"/);
    expect(writes.indexOf(entry[0]!)).toBeGreaterThan(
      Math.max(...[deck.cardsDocumentUrl, deck.reviewsDocumentUrl].map((url) => writes.findIndex((request) => request.url === url))),
    );
    // Everything the upgrade made in its folder was first written where nothing was.
    const made = new Set<string>();
    for (const write of writes.filter((request) => request.url.startsWith(backups) && request.method === "PUT")) {
      if (made.has(write.url)) continue;
      made.add(write.url);
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

  /**
   * A failed upgrade leaves the deck exactly as it was: the bytes the
   * server serves for its cards and reviews documents, asked for as the
   * app asks, are those it served before — written by hand, which a
   * server's rewrite would not keep so — its entry as it was, and nothing
   * of the upgrade left in the instance.
   */
  describe("byte for byte", () => {
    async function prepared() {
      const deck = await seedDeck(server);
      await writeByHand(
        deck.cardsDocumentUrl,
        "The deck's cards, written by hand.",
        `<#sweden> <https://other-app.example/ns#seen> [ <https://other-app.example/ns#by> "another app" ] .`,
      );
      await writeByHand(deck.reviewsDocumentUrl, "What was studied, written by hand.");
      const documents = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl];
      return { deck, documents, before: await servedBytes(documents) };
    }

    /** The deck's documents as before, but where `except` gives other bytes; its entry as it was; nothing of the upgrade left. */
    async function expectAsItWas(seeded: Awaited<ReturnType<typeof prepared>>, except: (string | undefined)[] = []): Promise<void> {
      expect(await servedBytes(seeded.documents)).toEqual(seeded.before.map((bytes, index) => except[index] ?? bytes));
      expect(await app().deckRepository.readDeck(seeded.deck.url)).toEqual(seeded.deck);
      expect(await status(`${instanceOf(seeded.deck)}backups/`)).toBe(404);
    }

    it("changes nothing of the deck when its working copy cannot be written", async () => {
      const seeded = await prepared();
      const { useCases, sent } = app({ failOn: (request) => isWrite(request) && request.url.includes("/staging/") });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "copy", asItWas: true, undo: null });
      expect(sent.filter(isWrite).filter((request) => seeded.documents.includes(request.url))).toEqual([]);
      await expectAsItWas(seeded);
    });

    it("changes nothing of the deck when one of its documents changed elsewhere after it was backed up", async () => {
      const seeded = await prepared();
      let studied = false;
      const { useCases, sent } = app({
        onRequest: async (request) => {
          // As the working copy is written, another device studies.
          if (studied || !isWrite(request) || !request.url.includes("/staging/")) return;
          studied = true;
          if (!everyEdit) await sleep(1100);
          await changeElsewhere(seeded.deck.reviewsDocumentUrl, `<#denmark> <${FOREIGN}> "studied elsewhere" .`);
        },
      });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "verify", asItWas: true, undo: null });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "deckChangedDuringUpgrade", vars: { url: seeded.deck.reviewsDocumentUrl } });
      expect(sent.filter(isWrite).filter((request) => seeded.documents.includes(request.url))).toEqual([]);
      await expectAsItWas(seeded, [undefined, (await servedBytes([seeded.deck.reviewsDocumentUrl]))[0]]);
    });

    it("puts the cards back when the review states changed elsewhere just before their write, and keeps that change", async () => {
      const seeded = await prepared();
      let reviewed = false;
      const elsewhere = app().reviewStateRepository;
      const { useCases, sent } = app({
        // Another device answers a card just as the upgrade writes the review states.
        onRequest: async (request) => {
          if (reviewed || !isWrite(request) || request.url !== seeded.deck.reviewsDocumentUrl) return;
          reviewed = true;
          if (!everyEdit) await sleep(1100);
          await elsewhere.saveReviewState(seeded.deck, review("denmark", 1));
        },
      });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(reviewed).toBe(true);
      // The cards were written, and are put back; the states' write was refused, so never made.
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "write",
        asItWas: true,
        undo: { restored: [seeded.deck.cardsDocumentUrl], kept: [], removed: true },
      });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "changedElsewhere" });
      const states = await app().reviewStateRepository.listReviewStates(seeded.deck);
      expect(states.map((state) => state.cardId).sort()).toEqual(["denmark", "latvia", "sweden"]);
      await expectAsItWas(seeded, [undefined, (await servedBytes([seeded.deck.reviewsDocumentUrl]))[0]]);
      expectPutBack(sent, [seeded.deck.cardsDocumentUrl], conditional);
    });

    it("puts both documents back when the review states' write fails, or is made but its answer lost", async () => {
      const failing = await prepared();
      const first = app({ failOn: (request) => isWrite(request) && request.url === failing.deck.reviewsDocumentUrl });
      const failed = await first.useCases.applyLibraryUpgrade(failing.deck, (await first.useCases.planLibraryUpgrade(failing.deck))!);
      expect(failed, JSON.stringify(failed)).toMatchObject({
        ok: false,
        step: "write",
        asItWas: true,
        undo: { restored: [failing.deck.cardsDocumentUrl], kept: [], removed: true },
      });
      expectPutBack(first.sent, [failing.deck.cardsDocumentUrl], conditional);
      await expectAsItWas(failing);

      const lost = await prepared();
      let gone = false;
      const second = app({
        loseAnswer: (request) => !gone && isWrite(request) && request.url === lost.deck.reviewsDocumentUrl && (gone = true),
      });
      const outcome = await second.useCases.applyLibraryUpgrade(lost.deck, (await second.useCases.planLibraryUpgrade(lost.deck))!);
      // Its version never noted, the review states are told the upgrade's by what its working copy says.
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "write",
        asItWas: true,
        undo: { restored: [lost.deck.reviewsDocumentUrl, lost.deck.cardsDocumentUrl], kept: [], removed: true },
      });
      expectPutBack(second.sent, lost.documents, conditional);
      await expectAsItWas(lost);
    });

    it("puts both documents back when one fails its check once written", async () => {
      const seeded = await prepared();
      let checks = 0;
      const injected = { message: { en: "Injected." }, severity: "violation" as const, constraint: "MinCount" };
      const { useCases, sent } = app({
        // The cards' second check where they are is after the upgrade wrote them; the first, before it read them for the plan.
        check: (url, report) =>
          url !== seeded.deck.cardsDocumentUrl || ++checks < 2
            ? report
            : { ...report, subjects: [...report.subjects, { url: `${url}#sweden`, status: "checked", shape: "card", version: 5, violations: [injected] }] },
      });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "validate",
        asItWas: true,
        undo: { restored: [seeded.deck.reviewsDocumentUrl, seeded.deck.cardsDocumentUrl], kept: [], removed: true },
      });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "updatedInstanceInvalid", vars: { count: 1 } });
      expectPutBack(sent, seeded.documents, conditional);
      await expectAsItWas(seeded);
    });

    it("puts both documents back when the entry cannot be moved to the new release", async () => {
      const seeded = await prepared();
      const { useCases, sent } = app({ failOn: (request) => isWrite(request) && request.url.endsWith("/catalog.ttl") });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "entry",
        asItWas: true,
        undo: { restored: [seeded.deck.reviewsDocumentUrl, seeded.deck.cardsDocumentUrl], kept: [], removed: true },
      });
      expectPutBack(sent, seeded.documents, conditional);
      await expectAsItWas(seeded);
    });

    it("upgrades a deck written by hand, and deletes what it backed up", async () => {
      const seeded = await prepared();
      const { useCases, deckRepository } = app();
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, tidied: true });
      expect((await deckRepository.listCards(seeded.deck)).map((card) => card.id).sort()).toEqual(["denmark", "norway", "sweden"]);
      expect(await said(seeded.deck.cardsDocumentUrl)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^_:\S+ <https:\/\/other-app\.example\/ns#by> "another app" \.$/)]),
      );
      expect(await status(`${instanceOf(seeded.deck)}backups/`)).toBe(404);
    });
  });
});
