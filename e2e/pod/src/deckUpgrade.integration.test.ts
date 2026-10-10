// @vitest-environment node
/**
 * A library deck upgrade against a real Solid server (docs/migrations.md
 * "How an upgrade is applied"): the app's own use cases and Solid
 * adapters, wired as in createAppUseCases, over a fetch that records every request
 * as it reaches the server. The upgrade writes the deck's cards first,
 * held to the read its plan was made from, then the review states of the
 * cards it removes, then the catalog entry, which names the new release;
 * each write is conditional, and a failure leaves what was written so,
 * nothing put back: planned again, the upgrade is offered and finishes, or,
 * once a newer release is out, takes the deck on to that one. No document
 * changes its address.
 */
import { beforeAll, describe, expect, inject, it, vi } from "vitest";
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

/** The library with the deck's releases published, the last its current one. */
function libraryOf(...published: LibraryDeckContent[]): DeckLibrary {
  const current = published.at(-1)!;
  return {
    listLibraryDecks: async () => [
      {
        url: current.url,
        seriesUrl: current.seriesUrl,
        version: current.version,
        releases: published.map((release) => ({ url: release.url, version: release.version })),
        themes: [],
        keywords: current.keywords,
        title: current.title,
        cardCount: current.cards.length,
        authors: current.authors,
        direction: current.direction,
        sources: [],
      },
    ],
    fetchLibraryDeck: async (url) => {
      const release = published.find((candidate) => candidate.url === url);
      if (release === undefined) throw new Error(`No release ${url}`);
      return release;
    },
    fetchCourseOutline: async (releaseUrl) => ({ releaseUrl, chapters: [] }),
    // The release check is the Studio's: no index is read here.
    readLibraryIndex: async () => ({ url: "https://site.example/decks/index.ttl", publisher: null, releases: [] }),
    // No release is added from a link here.
    readRelease: async (url) => {
      throw new Error(`No release is read from a link: ${url}`);
    },
    publishedBeside: async () => null,
  };
}

const library = libraryOf(V1, V2);

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
  /** The ETag of the pod's answer, once it came. */
  etag?: string | null;
}

/** The app as createAppUseCases wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(
  options: {
    /** Answers the request with a failure of its own: the pod never sees it. */
    failOn?: (request: Recorded) => boolean;
    /** Runs as the app is about to make the request: another device's doing. */
    onRequest?: (request: Recorded) => Promise<void>;
    /** The request is made, and its answer lost on the way: the app sees a network failure. */
    loseAnswer?: (request: Recorded) => boolean;
    /** The library as it is then: release 2 the current one, unless said otherwise. */
    deckLibrary?: DeckLibrary;
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
  /** Each request as it reaches the server, with its answer's status and ETag. */
  const sent: Recorded[] = [];
  const writeFence = createWriteFence(async (input, init) => {
    const recorded = record(input, init);
    sent.push(recorded);
    if (options.failOn?.(recorded)) return new Response("injected failure", { status: 500 });
    const response = await fetch(input, init);
    recorded.status = response.status;
    recorded.etag = response.headers.get("ETag");
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
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  const deckRepository = createSolidDeckRepository(deps);
  const reviewStateRepository = createSolidReviewStateRepository(deps);
  const useCases: UseCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: options.deckLibrary ?? library,
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const instanceOf = (deck: Deck) => deck.url.slice(0, deck.url.lastIndexOf("/") + 1);

/**
 * Every write to one of the documents was held to the version it was read
 * at: If-Match the ETag the server gave the last read of it, where the
 * server enforces If-Match; else made right after a read of it.
 */
function expectConditional(sent: Recorded[], documents: readonly string[], conditional: Preconditions): void {
  for (const [index, request] of sent.entries()) {
    if (!isWrite(request) || !documents.includes(request.url)) continue;
    const named = `${request.method} ${request.url}`;
    if (!conditional.edits) {
      expect(sent[index - 1], named).toMatchObject({ method: "GET", url: request.url });
      continue;
    }
    const read = sent
      .slice(0, index)
      .reverse()
      .find((earlier) => earlier.method === "GET" && earlier.url === request.url && typeof earlier.etag === "string");
    expect(read, named).toBeDefined();
    expect(request.ifMatch, named).toBe(read!.etag);
  }
}

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

  it("upgrades the deck where it is, its cards first, its entry last, each write held to its read; review states, sharing and another app's triples kept", async () => {
    const deck = await seedDeck(server);
    // Another app's triple on a card, and a subject of its own, in the cards document.
    await changeElsewhere(deck.cardsDocumentUrl, `<#sweden> <${FOREIGN}> "kept" . <#other-app> <${FOREIGN}> "theirs" .`);
    const { useCases, deckRepository, reviewStateRepository, sent } = app();
    const acl = await aclOf(deck.cardsDocumentUrl);
    const aclBefore = await fetch(acl).then((response) => response.text());
    const plan = (await useCases.planLibraryUpgrade(deck))!;
    expect(plan).toMatchObject({ toVersion: "2", add: [{ id: "norway" }], change: [{ id: "sweden" }], remove: [{ id: "latvia" }] });

    const outcome = await useCases.applyLibraryUpgrade(deck, plan);

    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
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

    // Each of the deck's documents written once, where it is, in this order: what the deck is at is said last.
    const writes = sent.filter(isWrite);
    const catalog = `${instanceOf(deck)}catalog.ttl`;
    expect(writes.map((request) => request.url)).toEqual([deck.cardsDocumentUrl, deck.reviewsDocumentUrl, catalog]);
    // The cards in one PUT of the whole document, held to the read the plan was made from.
    expect(writes[0]!.method).toBe("PUT");
    expectConditional(sent, [deck.cardsDocumentUrl, deck.reviewsDocumentUrl, catalog], conditional);
    // Nothing is kept beside the deck: no copy, no backup.
    expect(await status(`${instanceOf(deck)}backups/`)).toBe(404);
    expect(await status(`${deck.cardsDocumentUrl.replace(/\.ttl$/, "")}-0f3a.ttl`)).toBe(404);
    expect((await useCases.validateInstance(instanceOf(deck))).conforms).toBe(true);
    expect(await useCases.planLibraryUpgrade(upgraded)).toBeNull();
  });

  it("lists an instance's copies from one read of the library's index, and upgrades them one after another", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const { deckRepository, reviewStateRepository } = app();
    const seeded: Deck[] = [];
    for (let made = 0; made < 2; made++) {
      const deck = await deckRepository.importDeck(instanceUrl, V1);
      await reviewStateRepository.saveReviewState(deck, review("sweden", 6));
      seeded.push(deck);
    }
    // Release 2's title in ASCII: two upgrades patch it into one catalog, which the
    // Community Solid Server's in-memory store would otherwise cut short (docs/testing.md).
    const ascii: DeckLibrary = { ...library, fetchLibraryDeck: async (url) => (url === V2.url ? { ...V2, title: { en: "Capitals", sv: "Huvudstader" } } : V1) };
    const { useCases } = app({ deckLibrary: ascii });
    const reads = vi.spyOn(ascii, "listLibraryDecks");
    try {
      const copies = await useCases.listLibraryUpdates(instanceUrl);
      expect(reads).toHaveBeenCalledTimes(1);
      expect(copies.map((copy) => [copy.deck.url, copy.version, copy.newer]).sort()).toEqual(
        seeded.map((deck) => [deck.url, "1", true]).sort(),
      );

      for (const { deck } of copies) {
        const outcome = await useCases.applyLibraryUpgrade(deck, (await useCases.planLibraryUpgrade(deck))!);
        expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
      }

      const after = await useCases.listLibraryUpdates(instanceUrl);
      expect(after.map((copy) => [copy.deck.url, copy.version, copy.newer]).sort()).toEqual(
        seeded.map((deck) => [deck.url, "2", false]).sort(),
      );
      for (const { deck } of after) expect(await reviewStateRepository.listReviewStates(deck)).toEqual([review("sweden", 6)]);
    } finally {
      reads.mockRestore();
    }
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
   * An upgrade stopped part-way leaves the deck readable, as its documents
   * are: what it did not write is byte for byte as it was (written by hand,
   * which a server's rewrite would not keep so); planned again, the
   * upgrade is offered and finishes, no card it wrote taken for the
   * user's.
   */
  describe("stopped part-way", () => {
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

    /** The deck as its documents are: its entry, cards and review states read, and conforming. */
    async function expectReadable(useCases: UseCases, deck: Deck): Promise<void> {
      expect((await useCases.validateInstance(instanceOf(deck))).conforms).toBe(true);
      expect(await useCases.listCards(deck)).not.toEqual([]);
      expect(await useCases.getStudyQueue(instanceOf(deck), deck, new Date("2026-10-10T12:00:00Z"))).toBeDefined();
    }

    it("after its cards, its entry's write failing: the deck reads with the new release's cards, and offered again, the upgrade finishes", async () => {
      const seeded = await prepared();
      const first = app({ failOn: (request) => isWrite(request) && request.url.endsWith("/catalog.ttl") });
      const outcome = await first.useCases.applyLibraryUpgrade(seeded.deck, (await first.useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "entry", changed: true });
      // Nothing is put back: the cards and review states are the new release's, the entry still names the old one.
      expect(first.sent.filter(isWrite).map((request) => request.url)).toEqual([
        seeded.deck.cardsDocumentUrl,
        seeded.deck.reviewsDocumentUrl,
        `${instanceOf(seeded.deck)}catalog.ttl`,
      ]);
      const { useCases, deckRepository, sent } = app();
      expect(await deckRepository.readDeck(seeded.deck.url)).toEqual(seeded.deck);
      expect((await deckRepository.listCards(seeded.deck)).map((card) => [card.id, card.back.en]).sort()).toEqual([
        ["denmark", "Copenhagen"],
        ["norway", "Oslo"],
        ["sweden", "Stockholm"],
      ]);
      expect((await app().reviewStateRepository.listReviewStates(seeded.deck)).map((state) => state.cardId)).toEqual(["sweden"]);
      await expectReadable(useCases, seeded.deck);

      // Offered again: the cards already as the release has them are the release's, none the user's.
      const again = (await useCases.planLibraryUpgrade(seeded.deck))!;
      expect(again).toMatchObject({ releaseUrl: V2.url, add: [], change: [], remove: [], kept: [], gone: ["latvia"] });
      expect(again.applied.map((card) => card.id).sort()).toEqual(["norway", "sweden"]);
      expect(await useCases.applyLibraryUpgrade(seeded.deck, again)).toMatchObject({ ok: true, deck: { sourceUrl: V2.url } });
      // It finishes with the entry alone, held to its read.
      expect(sent.filter(isWrite).map((request) => request.url)).toEqual([`${instanceOf(seeded.deck)}catalog.ttl`]);
      expectConditional(sent, [`${instanceOf(seeded.deck)}catalog.ttl`], conditional);
      const upgraded = (await deckRepository.readDeck(seeded.deck.url))!;
      expect(upgraded).toMatchObject({ sourceUrl: V2.url, title: { en: "Capitals", sv: "Huvudstäder" } });
      expect(await useCases.planLibraryUpgrade(upgraded)).toBeNull();
      // Another app's blank node on a card is kept through it all.
      expect(await said(seeded.deck.cardsDocumentUrl)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^_:\S+ <https:\/\/other-app\.example\/ns#by> "another app" \.$/)]),
      );
    });

    it("after its cards, its entry's write failing, then a newer release out: offered again, it takes the deck on to that one, no card it wrote taken for the user's", async () => {
      const seeded = await prepared();
      const catalog = `${instanceOf(seeded.deck)}catalog.ttl`;
      const first = app({ failOn: (request) => isWrite(request) && request.url === catalog });
      const outcome = await first.useCases.applyLibraryUpgrade(seeded.deck, (await first.useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "entry", changed: true });

      // Release 3 is out: Sweden and Norway fixed again, the cards the cut-off upgrade wrote as release 2 has them.
      const V3 = release(3, [libraryCard("sweden", "Stockholm, Sweden"), libraryCard("denmark", "Copenhagen"), libraryCard("norway", "Oslo, Norway")]);
      const { useCases, deckRepository, sent } = app({ deckLibrary: libraryOf(V1, V2, V3) });
      const again = (await useCases.planLibraryUpgrade(seeded.deck))!;
      expect(again).toMatchObject({ releaseUrl: V3.url, add: [], remove: [], kept: [], gone: ["latvia"] });
      expect(again.change.map((card) => card.id).sort()).toEqual(["norway", "sweden"]);
      expect(await useCases.applyLibraryUpgrade(seeded.deck, again)).toMatchObject({ ok: true, deck: { sourceUrl: V3.url } });
      // The cards, then the entry: the removed card's state went with the first run.
      expect(sent.filter(isWrite).map((request) => request.url)).toEqual([seeded.deck.cardsDocumentUrl, catalog]);
      expectConditional(sent, [seeded.deck.cardsDocumentUrl, catalog], conditional);
      expect((await deckRepository.listCards(seeded.deck)).map((card) => [card.id, card.back.en]).sort()).toEqual([
        ["denmark", "Copenhagen"],
        ["norway", "Oslo, Norway"],
        ["sweden", "Stockholm, Sweden"],
      ]);
      expect(await useCases.planLibraryUpgrade((await deckRepository.readDeck(seeded.deck.url))!)).toBeNull();
      expect((await useCases.validateInstance(instanceOf(seeded.deck))).conforms).toBe(true);
    });

    it("after its cards, its entry's write failing on a release that only removes a card: offered again, it moves the deck to that release", async () => {
      const seeded = await prepared();
      const catalog = `${instanceOf(seeded.deck)}catalog.ttl`;
      // Release 2, as a release made before cards could be retired: Latvia removed, nothing else.
      const removing = libraryOf(V1, { ...V1, url: V2.url, version: "2", cards: V1.cards.filter((card) => card.id !== "latvia") });
      const first = app({ deckLibrary: removing, failOn: (request) => isWrite(request) && request.url === catalog });
      const plan = (await first.useCases.planLibraryUpgrade(seeded.deck))!;
      expect(plan).toMatchObject({ add: [], change: [], remove: [{ id: "latvia" }] });
      const outcome = await first.useCases.applyLibraryUpgrade(seeded.deck, plan);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "entry", changed: true });

      // The card and its review state are gone, the entry still names release 1: the upgrade is offered again.
      const { useCases, deckRepository, sent } = app({ deckLibrary: removing });
      expect(await deckRepository.readDeck(seeded.deck.url)).toEqual(seeded.deck);
      const again = (await useCases.planLibraryUpgrade(seeded.deck))!;
      expect(again).toMatchObject({ add: [], change: [], remove: [], applied: [], gone: ["latvia"] });
      expect(await useCases.applyLibraryUpgrade(seeded.deck, again)).toMatchObject({ ok: true, deck: { sourceUrl: V2.url } });
      expect(sent.filter(isWrite).map((request) => request.url)).toEqual([catalog]);
      expect(await useCases.planLibraryUpgrade((await deckRepository.readDeck(seeded.deck.url))!)).toBeNull();
    });

    it("after its cards, the review states' write failing: offered again, it drops the states left of the cards it removed, and finishes", async () => {
      const seeded = await prepared();
      const first = app({ failOn: (request) => isWrite(request) && request.url === seeded.deck.reviewsDocumentUrl });
      const outcome = await first.useCases.applyLibraryUpgrade(seeded.deck, (await first.useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "reviews", changed: true });
      // The review states as they were, byte for byte; the deck readable, its removed card's state unread.
      expect((await servedBytes([seeded.deck.reviewsDocumentUrl]))[0]).toBe(seeded.before[1]);
      const { useCases, sent } = app();
      await expectReadable(useCases, seeded.deck);
      const again = (await useCases.planLibraryUpgrade(seeded.deck))!;
      expect(again.gone).toEqual(["latvia"]);
      expect(await useCases.applyLibraryUpgrade(seeded.deck, again)).toMatchObject({ ok: true });
      expect(sent.filter(isWrite).map((request) => request.url)).toEqual([seeded.deck.reviewsDocumentUrl, `${instanceOf(seeded.deck)}catalog.ttl`]);
      expect((await app().reviewStateRepository.listReviewStates(seeded.deck)).map((state) => state.cardId)).toEqual(["sweden"]);
    });

    it("its cards' write failing: both documents byte for byte as they were, and the entry", async () => {
      const failing = await prepared();
      const first = app({ failOn: (request) => isWrite(request) && request.url === failing.deck.cardsDocumentUrl });
      const failed = await first.useCases.applyLibraryUpgrade(failing.deck, (await first.useCases.planLibraryUpgrade(failing.deck))!);
      expect(failed, JSON.stringify(failed)).toMatchObject({ ok: false, step: "cards", changed: true });
      expect(await servedBytes(failing.documents)).toEqual(failing.before);
      expect(await app().deckRepository.readDeck(failing.deck.url)).toEqual(failing.deck);
    });

    it("its cards' write refused for a change another device made since the plan read them (412): the deck as it was, but for that change", async (context) => {
      if (!conditional.edits) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
      const seeded = await prepared();
      let changed: string | undefined;
      const { useCases, sent } = app({
        onRequest: async (request) => {
          // Another device edits a card just as the upgrade writes the cards.
          if (changed !== undefined || !isWrite(request) || request.url !== seeded.deck.cardsDocumentUrl) return;
          if (!everyEdit) await sleep(1100);
          await changeElsewhere(seeded.deck.cardsDocumentUrl, `<#denmark> <${FOREIGN}> "edited elsewhere" .`);
          changed = (await servedBytes([seeded.deck.cardsDocumentUrl]))[0];
        },
      });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "cards", changed: false, error: { code: "changedElsewhere" } });
      expect(sent.find((request) => isWrite(request) && request.url === seeded.deck.cardsDocumentUrl)).toMatchObject({ status: 412 });
      // The cards as the other device left them, the review states and the entry as they were.
      expect(await servedBytes(seeded.documents)).toEqual([changed, seeded.before[1]]);
      expect(await app().deckRepository.readDeck(seeded.deck.url)).toEqual(seeded.deck);
    });

    it("its entry's write made but its answer lost: the entry tells it done", async () => {
      const seeded = await prepared();
      let lost = false;
      const { useCases } = app({
        loseAnswer: (request) => !lost && isWrite(request) && request.url.endsWith("/catalog.ttl") && (lost = true),
      });
      const outcome = await useCases.applyLibraryUpgrade(seeded.deck, (await useCases.planLibraryUpgrade(seeded.deck))!);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, deck: { sourceUrl: V2.url } });
      expect(lost).toBe(true);
    });
  });
});
