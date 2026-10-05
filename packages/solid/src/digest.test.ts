import { describe, expect, it } from "vitest";
import { buildThing, createSolidDataset, createThing, setThing } from "@inrupt/solid-client";
import type { Deck } from "@solid-memo/domain/deck";
import { ABSENT_VERSION, emptyDigest, withReceipt, withSchedule, type StoredSchedule } from "@solid-memo/domain/studyDigest";
import { readDataset, readDatasetSince, saveDataset, UNCHANGED, versionOf } from "./datasets";
import { readSince } from "./readSince";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidDigestRepository } from "./solidDigestRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CARDS = `${INSTANCE}decks/deck-1.ttl`;
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const DIGEST = `${INSTANCE}digest.ttl`;
const SM = "https://pod.solid-memo.com/vocab/v1#";
const PREFIXES = `@prefix sm: <${SM}> . @prefix dcterms: <http://purl.org/dc/terms/> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n`;

const deck = {
  url: `${INSTANCE}catalog.ttl#deck-1`,
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
} as Deck;

async function podWithDeck() {
  const pod = fakePod();
  await pod.put(CARDS, `${PREFIXES}<#a> a sm:Card ; sm:formatVersion 1 ; sm:front "Sweden" ; sm:back "Stockholm" .`);
  return pod;
}

describe("reading a document since a version", () => {
  it("says UNCHANGED when the pod answers 304, and reads it when it changed", async () => {
    const pod = await podWithDeck();
    const version = pod.etag(CARDS)!;
    expect(await readDatasetSince(CARDS, version, pod.fetch)).toBe(UNCHANGED);
    pod.touch(CARDS);
    const read = await readDatasetSince(CARDS, version, pod.fetch);
    expect(read).not.toBe(UNCHANGED);
    expect(versionOf(read as object)).toBe(pod.etag(CARDS));
    // A plain read afterwards revalidates what that read learned.
    await readDataset(CARDS, pod.fetch);
    expect(pod.requests.at(-1)).toMatchObject({ ifNoneMatch: pod.etag(CARDS), status: 304 });
  });

  it("is not shared with a read that starts after a write to the document", async () => {
    const pod = await podWithDeck();
    const version = pod.etag(CARDS)!;
    const letGo = pod.holdReads();
    const before = readDatasetSince(CARDS, version, pod.fetch);
    letGo();
    const dataset = await readDataset(CARDS, pod.fetch);
    const holdAgain = pod.holdReads();
    const stillBefore = readDatasetSince(CARDS, version, pod.fetch);
    const elsewhere = readDataset(REVIEWS, pod.fetch).catch(() => null);
    await saveDataset(CARDS, setThing(dataset, buildThing(createThing({ url: `${CARDS}#b` })).addStringNoLocale(`${SM}front`, "x").build()), pod.fetch);
    const after = readDatasetSince(CARDS, version, pod.fetch);
    holdAgain();
    expect(await after).not.toBe(UNCHANGED);
    expect(await stillBefore).not.toBe(UNCHANGED);
    expect(await before).toBe(UNCHANGED);
    await elsewhere;
    // The read the write ended does not end the one that replaced it, which is now done too.
    expect(await readDatasetSince(CARDS, pod.etag(CARDS)!, pod.fetch)).toBe(UNCHANGED);
  });

  it("is null when there is no document, and fails as a read does otherwise", async () => {
    const pod = fakePod();
    expect(await readDatasetSince(CARDS, '"v1"', pod.fetch)).toBeNull();
    pod.failNext("GET", CARDS, 500);
    await expect(readDatasetSince(CARDS, '"v1"', pod.fetch)).rejects.toThrow();
  });

  it("shares a read of the same version under way", async () => {
    const pod = await podWithDeck();
    const version = pod.etag(CARDS)!;
    const [a, b] = await Promise.all([readDatasetSince(CARDS, version, pod.fetch), readDatasetSince(CARDS, version, pod.fetch)]);
    expect([a, b]).toEqual([UNCHANGED, UNCHANGED]);
    expect(pod.requests).toHaveLength(1);
  });

  it("knows no version of a dataset not read from a pod", () => {
    expect(versionOf(createSolidDataset())).toBeUndefined();
  });

  it("gives the version of what it read, ABSENT_VERSION for no document, and none when the pod gave none", async () => {
    const pod = await podWithDeck();
    const read = await readSince(CARDS, undefined, pod.fetch);
    expect(read).toMatchObject({ unchanged: false, version: pod.etag(CARDS) });
    expect(await readSince(REVIEWS, undefined, pod.fetch)).toEqual({ unchanged: false, value: null, version: ABSENT_VERSION });
    expect(await readSince(REVIEWS, ABSENT_VERSION, pod.fetch)).toEqual({ unchanged: true });
    expect(await readSince(CARDS, ABSENT_VERSION, pod.fetch)).toMatchObject({ unchanged: false, version: pod.etag(CARDS) });
    expect(await readSince(REVIEWS, '"gone"', pod.fetch)).toEqual({ unchanged: false, value: null, version: ABSENT_VERSION });
    const noEtag = (async () => {
      const response = new Response(`<#a> <#b> "c" .`, { headers: { "Content-Type": "text/turtle" } });
      Object.defineProperty(response, "url", { value: CARDS });
      return response;
    }) as unknown as typeof globalThis.fetch;
    expect(await readSince(CARDS, undefined, noEtag)).toMatchObject({ unchanged: false, version: null });
  });
});

describe("cards, review states and checks since a version", () => {
  it("reads a deck's cards and review states unless they are unchanged", async () => {
    const pod = await podWithDeck();
    const decks = createSolidDeckRepository({ fetch: pod.fetch, now: () => new Date(), randomId: () => "x" });
    const reviews = createSolidReviewStateRepository({ fetch: pod.fetch });
    const cards = await decks.readCardsSince(deck, undefined);
    expect(cards).toMatchObject({ unchanged: false, version: pod.etag(CARDS) });
    expect(cards.unchanged || cards.value.map((c) => c.id)).toEqual(["a"]);
    expect(await decks.readCardsSince(deck, pod.etag(CARDS))).toEqual({ unchanged: true });
    expect(await decks.readCardsSince({ ...deck, cardsDocumentUrl: `${INSTANCE}decks/none.ttl` }, undefined)).toEqual({
      unchanged: false,
      value: [],
      version: ABSENT_VERSION,
    });

    expect(await reviews.readReviewStatesSince(deck, undefined)).toEqual({ unchanged: false, value: [], version: ABSENT_VERSION });
    expect(await reviews.readReviewStatesSince(deck, ABSENT_VERSION)).toEqual({ unchanged: true });
    await pod.put(
      REVIEWS,
      `${PREFIXES}<#a> a sm:ReviewState ; sm:formatVersion 2 ; sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-09-22" ;
        sm:firstReviewedAt "2026-09-21T10:00:00Z"^^xsd:dateTime ; sm:lastReviewedAt "2026-09-21T10:00:00Z"^^xsd:dateTime .`,
    );
    const states = await reviews.readReviewStatesSince(deck, ABSENT_VERSION);
    expect(states.unchanged || states.value.map((s) => s.cardId)).toEqual(["a"]);
  });

  it("checks a document unless it is unchanged", async () => {
    const pod = await podWithDeck();
    const validator = createShaclShapeValidator({
      fetch: pod.fetch,
      shapesFetch: () => Promise.reject(new Error("no shapes needed")),
      shapesBaseUrl: "https://shapes.example/",
      vocabBaseUrl: "https://vocab.example/",
      vendorBaseUrl: "https://app.example/vendor/",
      loader: { load: async () => createSolidDataset() as never, loadProfile: async () => [], loadReferenceData: async () => [] },
      loadEngine: async () => ({ createEngine: () => ({ validateNode: async () => [], validate: async () => [] }), mergeDatasets: () => ({}) as never }),
    });
    expect(await validator.validateDocumentSince(CARDS, pod.etag(CARDS))).toEqual({ unchanged: true });
    const checked = await validator.validateDocumentSince(CARDS, undefined);
    expect(checked).toMatchObject({ unchanged: false, version: pod.etag(CARDS), value: { url: CARDS, status: "checked" } });
    expect(await validator.validateDocumentSince(REVIEWS, undefined)).toMatchObject({
      unchanged: false,
      version: ABSENT_VERSION,
      value: { url: REVIEWS, status: "missing" },
    });
  });
});

describe("the instance's digest in the pod", () => {
  const schedule: StoredSchedule = {
    deck: deck.url,
    cardsVersion: '"v1"',
    reviewsVersion: ABSENT_VERSION,
    schedule: {
      direction: "front-to-back",
      dayBoundaryHour: 4,
      dueByDay: { "2026-10-01": 2 },
      unreviewed: 3,
      studyDay: "2026-10-01",
      reviewedOnDay: 1,
      introducedOnDay: 0,
    },
  };
  const learned = (digest = emptyDigest()) =>
    withSchedule(withReceipt(digest, CARDS, '"v1"', { conformedTo: "rules", latestFormat: true }), schedule);

  it("is null until something is learned, then read back as written", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    expect(await digests.readDigest(INSTANCE)).toBeNull();
    await digests.updateDigest(INSTANCE, (stored) => learned(stored ?? undefined));
    expect(await digests.readDigest(INSTANCE)).toEqual(learned());
    expect(pod.requests.filter((r) => r.method === "PUT")).toEqual([
      expect.objectContaining({ url: DIGEST, ifNoneMatch: "*", status: 201 }),
    ]);
  });

  it("edits only what changed, checks it first, and writes nothing when nothing did", async () => {
    const pod = fakePod();
    const checked: string[][] = [];
    const digests = createSolidDigestRepository({
      fetch: pod.fetch,
      checkWrite: async (_dataset, subjects) => void checked.push([...subjects]),
    });
    await digests.updateDigest(INSTANCE, () => learned());
    const written = pod.etag(DIGEST);
    pod.clearRequests();
    await digests.updateDigest(INSTANCE, (stored) => withReceipt(stored!, REVIEWS, '"r1"', { latestFormat: true }));
    expect(pod.requests.filter((r) => r.method !== "GET")).toEqual([
      expect.objectContaining({ method: "PATCH", url: DIGEST, ifMatch: written }),
    ]);
    expect(checked.at(-1)).toEqual([`${DIGEST}#receipt-reviews-deck-1.ttl`]);
    pod.clearRequests();
    await digests.updateDigest(INSTANCE, (stored) => stored!);
    expect(pod.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  it("removes what is no longer known", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, () => learned());
    await digests.updateDigest(INSTANCE, (stored) => ({ receipts: {}, schedules: stored!.schedules }));
    expect(await digests.readDigest(INSTANCE)).toEqual({ receipts: {}, schedules: { [deck.url]: schedule } });
    expect(pod.triples(DIGEST)!.some((t) => t.includes("#receipt-"))).toBe(false);
    await digests.updateDigest(INSTANCE, () => emptyDigest());
    expect(pod.triples(DIGEST)).toEqual([]);
  });

  it("writes changes asked for while a write is under way together, in the next one", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const first = digests.updateDigest(INSTANCE, (stored) => withReceipt(stored ?? emptyDigest(), CARDS, '"v1"', { latestFormat: true }));
    const second = digests.updateDigest(INSTANCE, (stored) => withReceipt(stored!, REVIEWS, '"r1"', { latestFormat: true }));
    const third = digests.updateDigest(INSTANCE, (stored) => withSchedule(stored!, schedule));
    await Promise.all([first, second, third]);
    expect(pod.requests.filter((r) => r.method !== "GET")).toHaveLength(2);
    expect(Object.keys((await digests.readDigest(INSTANCE))!.receipts)).toEqual([CARDS, REVIEWS]);
  });

  it("reads and changes again when the digest changed elsewhere meanwhile, six times in all, waiting longer each time", async () => {
    const pod = fakePod();
    const waits: number[] = [];
    const digests = createSolidDigestRepository({ fetch: pod.fetch, wait: async (ms) => void waits.push(ms) });
    await digests.updateDigest(INSTANCE, () => learned());
    pod.failNext("PATCH", DIGEST, 412);
    await digests.updateDigest(INSTANCE, (stored) => withReceipt(stored!, REVIEWS, '"r1"', {}));
    expect((await digests.readDigest(INSTANCE))!.receipts[REVIEWS]).toEqual({ document: REVIEWS, version: '"r1"' });
    expect(waits).toEqual([50]);
    waits.length = 0;
    for (let i = 0; i < 6; i++) pod.failNext("PATCH", DIGEST, 412);
    await expect(digests.updateDigest(INSTANCE, (stored) => withReceipt(stored!, REVIEWS, '"r2"', {}))).rejects.toThrow(
      "changed elsewhere",
    );
    expect(waits).toEqual([50, 100, 150, 200, 250]);
  });

  it("waits by the clock when no wait is given", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, () => learned());
    pod.failNext("PATCH", DIGEST, 412);
    const started = Date.now();
    await digests.updateDigest(INSTANCE, (stored) => withReceipt(stored!, REVIEWS, '"r1"', {}));
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("fails a change the pod refuses, and keeps writing later ones", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    pod.failNext("PUT", DIGEST, 500);
    await expect(digests.updateDigest(INSTANCE, () => learned())).rejects.toThrow();
    await digests.updateDigest(INSTANCE, () => learned());
    expect(await digests.readDigest(INSTANCE)).toEqual(learned());
  });

  it("leaves out what does not fit its shape", async () => {
    const pod = fakePod();
    await pod.put(
      DIGEST,
      `${PREFIXES}<#receipt-x> a sm:DocumentReceipt ; sm:receiptOf <decks/x.ttl> .
       <#schedule-x> a sm:DeckSchedule ; sm:scheduleOf <catalog.ttl#x> .
       <#other> a sm:Card .`,
    );
    expect(await createSolidDigestRepository({ fetch: pod.fetch }).readDigest(INSTANCE)).toEqual(emptyDigest());
  });
});
