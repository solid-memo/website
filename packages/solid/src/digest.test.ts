// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { buildThing, createSolidDataset, createThing, setThing } from "./client/rdf";
import type { Deck } from "@solid-memo/domain/deck";
import {
  ABSENT_VERSION,
  emptyDigest,
  addReceipt,
  changedDigest,
  setMonthSummaries,
  setSchedule,
  type DigestChange,
  type StoredMonthSummary,
  type StoredSchedule,
} from "@solid-memo/domain/studyDigest";
import { readDataset, readDatasetSince, saveDataset, UNCHANGED, versionOf } from "./datasets";
import { MAX_CATALOG_LINKS } from "./catalogLinks";
import { MAX_DRAFT_DOCUMENTS_IN_ALL } from "./solidReleaseDraftRepository";
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
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const PREFIXES = `@prefix sm: <${SM}> . @prefix dcterms: <http://purl.org/dc/terms/> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n`;

const deck = {
  url: `${INSTANCE}catalog.ttl#deck-1`,
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
} as Deck;

async function podWithDeck() {
  const pod = fakePod();
  await pod.put(
    CARDS,
    `${PREFIXES}<#a> a sm:Card ; sm:formatVersion 1 ; sm:front "Sweden" ; sm:back "Stockholm" .`,
  );
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
    // A plain read afterward revalidates what that read learned.
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
    await saveDataset(
      CARDS,
      setThing(
        dataset,
        buildThing(createThing({ url: `${CARDS}#b` }))
          .addStringNoLocale(`${SM}front`, "x")
          .build(),
      ),
      pod.fetch,
    );
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
    const [a, b] = await Promise.all([
      readDatasetSince(CARDS, version, pod.fetch),
      readDatasetSince(CARDS, version, pod.fetch),
    ]);
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
    expect(await readSince(REVIEWS, undefined, pod.fetch)).toEqual({
      unchanged: false,
      value: null,
      version: ABSENT_VERSION,
    });
    expect(await readSince(REVIEWS, ABSENT_VERSION, pod.fetch)).toEqual({ unchanged: true });
    expect(await readSince(CARDS, ABSENT_VERSION, pod.fetch)).toMatchObject({
      unchanged: false,
      version: pod.etag(CARDS),
    });
    expect(await readSince(REVIEWS, '"gone"', pod.fetch)).toEqual({
      unchanged: false,
      value: null,
      version: ABSENT_VERSION,
    });
    const noEtag = (async () => {
      const response = new Response(`<#a> <#b> "c" .`, {
        headers: { "Content-Type": "text/turtle" },
      });
      Object.defineProperty(response, "url", { value: CARDS });
      return response;
    }) as unknown as typeof globalThis.fetch;
    expect(await readSince(CARDS, undefined, noEtag)).toMatchObject({
      unchanged: false,
      version: null,
    });
  });
});

describe("a stored version that cannot be sent as a header value", () => {
  it.each([
    ["a newline", "a\nb"],
    ["a NUL", "a\u0000b"],
    ["a character above U+00FF", "\u20ac"],
  ])("reads the document plainly for %s, and gives its real version", async (_, version) => {
    const pod = await podWithDeck();
    const read = await readSince(CARDS, version, pod.fetch);
    expect(read).toMatchObject({ unchanged: false, version: pod.etag(CARDS) });
    expect(pod.requests).toEqual([expect.objectContaining({ ifNoneMatch: null, status: 200 })]);
  });

  it.each([
    ["a strong ETag", '"v1"'],
    ["a weak ETag", 'W/"v1"'],
    ["a character up to U+00FF", '"\u00e9"'],
  ])("still asks conditionally with %s", async (_, version) => {
    const pod = await podWithDeck();
    await readSince(CARDS, version, pod.fetch);
    expect(pod.requests).toEqual([expect.objectContaining({ ifNoneMatch: version })]);
  });

  it("is written over with the version the read gave", async () => {
    const pod = await podWithDeck();
    const history = `${INSTANCE}history/2026-09.ttl`;
    await pod.put(
      DIGEST,
      `${PREFIXES}
      <#r1> a sm:DocumentReceipt ; sm:formatVersion 1 ;
        sm:receiptOf <${CARDS}> ; sm:documentVersion "a\\nb" .
      <#s1> a sm:DeckSchedule ; sm:formatVersion 2 ; sm:scheduleOf <${deck.url}> ;
        sm:cardsVersion "\u20ac" ; sm:reviewsVersion "absent" ;
        sm:scheduledDirection sm:frontToBack ; sm:scheduledDayBoundaryHour 4 ; sm:scheduledWith sm:sm2 ;
        sm:scheduledOn "2026-10-01" ; sm:unreviewedCount 0 ; sm:reviewedOnDayCount 0 ; sm:introducedOnDayCount 0 .
      <#m1> a sm:MonthSummary ; sm:formatVersion 1 ;
        sm:summaryOf <${history}> ; sm:summarizedVersion "a\\u0000b" ;
        sm:youngReviewCount 0 ; sm:youngRecalledCount 0 .`,
    );
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const stored = (await digests.readDigest(INSTANCE))!;
    const planted = [
      stored.receipts[CARDS]!.version,
      stored.schedules[deck.url]!.cardsVersion,
      stored.months[history]!.version,
    ];
    expect(planted).toEqual(["a\nb", "\u20ac", "a\u0000b"]);

    for (const version of planted) {
      await expect(readSince(CARDS, version, pod.fetch)).resolves.toMatchObject({
        unchanged: false,
        version: pod.etag(CARDS),
      });
    }

    await digests.updateDigest(INSTANCE, (draft) => {
      draft.receipts[CARDS] = { ...draft.receipts[CARDS]!, version: pod.etag(CARDS)! };
      draft.schedules[deck.url] = {
        ...draft.schedules[deck.url]!,
        cardsVersion: pod.etag(CARDS)!,
      };
      draft.months[history] = { ...draft.months[history]!, version: pod.etag(CARDS)! };
    });
    const healed = (await digests.readDigest(INSTANCE))!;
    expect(healed.receipts[CARDS]!.version).toBe(pod.etag(CARDS));
    expect(healed.schedules[deck.url]!.cardsVersion).toBe(pod.etag(CARDS));
    expect(healed.months[history]!.version).toBe(pod.etag(CARDS));
  });
});

describe("cards, review states and checks since a version", () => {
  it("reads a deck's cards and review states unless they are unchanged", async () => {
    const pod = await podWithDeck();
    const decks = createSolidDeckRepository({
      fetch: pod.fetch,
      now: () => new Date(),
      randomId: () => "x",
    });
    const reviews = createSolidReviewStateRepository({ fetch: pod.fetch });
    const cards = await decks.readCardsSince(deck, undefined);
    expect(cards).toMatchObject({ unchanged: false, version: pod.etag(CARDS) });
    expect(cards.unchanged || cards.value.map((c) => c.id)).toEqual(["a"]);
    expect(await decks.readCardsSince(deck, pod.etag(CARDS))).toEqual({ unchanged: true });
    expect(
      await decks.readCardsSince(
        { ...deck, cardsDocumentUrl: `${INSTANCE}decks/none.ttl` },
        undefined,
      ),
    ).toEqual({
      unchanged: false,
      value: [],
      version: ABSENT_VERSION,
    });

    expect(await reviews.readReviewStatesSince(deck, undefined)).toEqual({
      unchanged: false,
      value: { sm2: [], fsrs: [] },
      version: ABSENT_VERSION,
    });
    expect(await reviews.readReviewStatesSince(deck, ABSENT_VERSION)).toEqual({ unchanged: true });
    await pod.put(
      REVIEWS,
      `${PREFIXES}<#a> a sm:ReviewState ; sm:formatVersion 2 ; sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-09-22" ;
        sm:firstReviewedAt "2026-09-21T10:00:00Z"^^xsd:dateTime ; sm:lastReviewedAt "2026-09-21T10:00:00Z"^^xsd:dateTime .`,
    );
    const states = await reviews.readReviewStatesSince(deck, ABSENT_VERSION);
    expect(states.unchanged || states.value.sm2.map((s) => s.cardId)).toEqual(["a"]);
  });

  it("checks a document unless it is unchanged", async () => {
    const pod = await podWithDeck();
    const validator = createShaclShapeValidator({
      fetch: pod.fetch,
      shapesFetch: () => Promise.reject(new Error("no shapes needed")),
      shapesBaseUrl: "https://shapes.example/",
      vocabBaseUrl: "https://vocab.example/",
      vendorBaseUrl: "https://app.example/vendor/",
      loader: {
        load: async () => createSolidDataset() as never,
        loadProfile: async () => [],
        loadReferenceData: async () => [],
      },
      loadEngine: async () => ({
        createEngine: () => ({ validateNode: async () => [], validate: async () => [] }),
        mergeDatasets: () => ({}) as never,
        mapIris: (data) => data,
      }),
    });
    expect(await validator.validateDocumentSince(CARDS, pod.etag(CARDS))).toEqual({
      unchanged: true,
    });
    const checked = await validator.validateDocumentSince(CARDS, undefined);
    expect(checked).toMatchObject({
      unchanged: false,
      version: pod.etag(CARDS),
      value: { url: CARDS, status: "checked" },
    });
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
      scheduler: "sm2" as const,
      dueByDay: { "2026-10-01": 2 },
      unreviewed: 3,
      studyDay: "2026-10-01",
      reviewedOnDay: 1,
      introducedOnDay: 0,
    },
  };
  const month: StoredMonthSummary = {
    document: `${INSTANCE}history/2026-09.ttl`,
    version: '"m1"',
    summary: {
      days: [
        { studyDay: "2026-09-29", answers: 12, introduced: 3, reviews: 8, lapses: 1 },
        { studyDay: "2026-09-30", answers: 1, introduced: 0, reviews: 0, lapses: 0 },
      ],
      young: { reviews: 6, recalled: 5 },
      recallSeconds: { 4: 7, 60: 1 },
    },
  };
  const learn: DigestChange = (draft) => {
    addReceipt(draft, CARDS, '"v1"', { conformedTo: "rules", latestFormat: true });
    setSchedule(draft, schedule);
    setMonthSummaries(draft, { [month.document]: month });
  };
  const learned = () => changedDigest(null, [learn]);

  it("is null until something is learned, then read back as written", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    expect(await digests.readDigest(INSTANCE)).toBeNull();
    await digests.updateDigest(INSTANCE, learn);
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
    await digests.updateDigest(INSTANCE, learn);
    const written = pod.etag(DIGEST);
    pod.clearRequests();
    await digests.updateDigest(INSTANCE, (draft) =>
      addReceipt(draft, REVIEWS, '"r1"', { latestFormat: true }),
    );
    expect(pod.requests.filter((r) => r.method !== "GET")).toEqual([
      expect.objectContaining({ method: "PATCH", url: DIGEST, ifMatch: written }),
    ]);
    expect(checked.at(-1)).toEqual([`${DIGEST}#receipt-reviews-deck-1.ttl`]);
    pod.clearRequests();
    await digests.updateDigest(INSTANCE, () => undefined);
    expect(pod.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  it("removes what is no longer known", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, learn);
    await digests.updateDigest(INSTANCE, (draft) => {
      draft.receipts = {};
      draft.months = {};
    });
    expect(await digests.readDigest(INSTANCE)).toEqual({
      receipts: {},
      schedules: { [deck.url]: schedule },
      months: {},
    });
    expect(pod.triples(DIGEST)!.some((t) => t.includes("#receipt-"))).toBe(false);
    expect(pod.triples(DIGEST)!.some((t) => t.includes("#month-"))).toBe(false);
    await digests.updateDigest(INSTANCE, (draft) => Object.assign(draft, emptyDigest()));
    expect(pod.triples(DIGEST)).toEqual([]);
  });

  it("removes what is dropped at whichever subject it was read from, in one write", async () => {
    const pod = fakePod();
    const summary = (subject: string, document: string) =>
      `<${subject}> a sm:MonthSummary ; sm:formatVersion 1 ; sm:summaryOf <${document}> ;
         sm:summarizedVersion "v" ; sm:youngReviewCount 0 ; sm:youngRecalledCount 0 ;
         sm:studyDayCounts "2026-01-01 1 0 0 0" .\n`;
    let planted = PREFIXES;
    for (let i = 0; i < 300; i++)
      planted += summary(`#m${i}`, `https://elsewhere.example/x${i}/history/2026-01.ttl`);
    planted += `<#r> a sm:DocumentReceipt ; sm:formatVersion 1 ; sm:receiptOf <decks/x.ttl> ;
        sm:documentVersion "v" .\n`;
    await pod.put(DIGEST, planted);
    const checked: string[][] = [];
    const digests = createSolidDigestRepository({
      fetch: pod.fetch,
      checkWrite: async (_dataset, subjects) => void checked.push([...subjects]),
    });
    expect(Object.keys((await digests.readDigest(INSTANCE))!.months)).toHaveLength(300);
    pod.clearRequests();
    await digests.updateDigest(INSTANCE, (draft) => {
      draft.receipts = {};
      draft.months = {};
    });
    expect(pod.requests.filter((r) => r.method !== "GET")).toHaveLength(1);
    expect(checked[0]).toHaveLength(301);
    expect(checked[0]).toContain(`${DIGEST}#m0`);
    expect(checked[0]).toContain(`${DIGEST}#r`);
    expect(pod.triples(DIGEST)).toEqual([]);
  });

  it("removes a dropped month at every subject that says it, one subject at a time", async () => {
    const pod = fakePod();
    let planted = PREFIXES;
    for (let i = 0; i < 2000; i++)
      planted += `<#m${i}> a sm:MonthSummary ; sm:formatVersion 1 ;
         sm:summaryOf <https://elsewhere.example/x/history/2026-01.ttl> ; sm:summarizedVersion "v" ;
         sm:youngReviewCount 0 ; sm:youngRecalledCount 0 .\n`;
    await pod.put(DIGEST, planted);
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const push = Array.prototype.push;
    let widest = 0;
    Array.prototype.push = function (this: unknown[], ...items: unknown[]) {
      if (typeof items[0] === "string" && items[0].startsWith(`${DIGEST}#m`))
        widest = Math.max(widest, items.length);
      return push.apply(this, items);
    };
    try {
      await digests.updateDigest(INSTANCE, (draft) => setMonthSummaries(draft, {}));
    } finally {
      Array.prototype.push = push;
    }
    // Spreading every subject into one call fails past the engine's
    // argument limit, so a key said often enough could never be removed.
    expect(widest).toBe(1);
    expect(pod.triples(DIGEST)).toEqual([]);
  });

  it("writes a summary over every subject it was read from", async () => {
    const pod = fakePod();
    const said = (subject: string) =>
      `<${subject}> a sm:MonthSummary ; sm:formatVersion 1 ; sm:summaryOf <history/2026-09.ttl> ;
         sm:summarizedVersion "v" ; sm:youngReviewCount 0 ; sm:youngRecalledCount 0 .\n`;
    await pod.put(DIGEST, `${PREFIXES}${said("#month-history-2026-09.ttl")}${said("#again")}`);
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, (draft) =>
      setMonthSummaries(draft, { [month.document]: month }),
    );
    const subjects = new Set(pod.triples(DIGEST)!.map((t) => t.split(" ")[0]));
    expect([...subjects]).toEqual([`<${DIGEST}#month-history-2026-09.ttl>`]);
    expect(await digests.readDigest(INSTANCE)).toEqual(
      changedDigest(null, [(draft) => setMonthSummaries(draft, { [month.document]: month })]),
    );
  });

  it("writes changes asked for while a write is under way together, in the next one", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const first = digests.updateDigest(INSTANCE, (draft) =>
      addReceipt(draft, CARDS, '"v1"', { latestFormat: true }),
    );
    const second = digests.updateDigest(INSTANCE, (draft) =>
      addReceipt(draft, REVIEWS, '"r1"', { latestFormat: true }),
    );
    const third = digests.updateDigest(INSTANCE, (draft) => setSchedule(draft, schedule));
    await Promise.all([first, second, third]);
    expect(pod.requests.filter((r) => r.method !== "GET")).toHaveLength(2);
    expect(Object.keys((await digests.readDigest(INSTANCE))!.receipts)).toEqual([CARDS, REVIEWS]);
  });

  it("reads and changes again when the digest changed elsewhere meanwhile, six times in all, waiting longer each time", async () => {
    const pod = fakePod();
    const waits: number[] = [];
    const digests = createSolidDigestRepository({
      fetch: pod.fetch,
      wait: async (ms) => void waits.push(ms),
    });
    await digests.updateDigest(INSTANCE, learn);
    pod.failNext("PATCH", DIGEST, 412);
    await digests.updateDigest(INSTANCE, (draft) => addReceipt(draft, REVIEWS, '"r1"', {}));
    expect((await digests.readDigest(INSTANCE))!.receipts[REVIEWS]).toEqual({
      document: REVIEWS,
      version: '"r1"',
    });
    expect(waits).toEqual([50]);
    waits.length = 0;
    for (let i = 0; i < 6; i++) pod.failNext("PATCH", DIGEST, 412);
    await expect(
      digests.updateDigest(INSTANCE, (draft) => addReceipt(draft, REVIEWS, '"r2"', {})),
    ).rejects.toThrow("changed elsewhere");
    expect(waits).toEqual([50, 100, 150, 200, 250]);
  });

  it("waits by the clock when no wait is given", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, learn);
    pod.failNext("PATCH", DIGEST, 412);
    const started = Date.now();
    await digests.updateDigest(INSTANCE, (draft) => addReceipt(draft, REVIEWS, '"r1"', {}));
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("fails a change the pod refuses, and keeps writing later ones", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    pod.failNext("PUT", DIGEST, 500);
    await expect(digests.updateDigest(INSTANCE, learn)).rejects.toThrow();
    await digests.updateDigest(INSTANCE, learn);
    expect(await digests.readDigest(INSTANCE)).toEqual(learned());
  });

  it("reads a schedule of format 1 as SM-2's, and writes it over in format 2", async () => {
    const pod = fakePod();
    const subject = `${DIGEST}#schedule-catalog.ttl-deck-1`;
    await pod.put(
      DIGEST,
      `${PREFIXES}<#schedule-catalog.ttl-deck-1> a sm:DeckSchedule ; sm:formatVersion 1 ;
        sm:scheduleOf <catalog.ttl#deck-1> ; sm:cardsVersion "\\"v1\\"" ; sm:reviewsVersion "${ABSENT_VERSION}" ;
        sm:scheduledDirection sm:frontToBack ; sm:scheduledDayBoundaryHour 4 ; sm:scheduledOn "2026-10-01" ;
        sm:dueOnDay "2026-10-01 2" ; sm:unreviewedCount 3 ; sm:reviewedOnDayCount 1 ; sm:introducedOnDayCount 0 .`,
    );
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const read = await digests.readDigest(INSTANCE);
    expect(read!.schedules[deck.url]).toEqual(schedule);
    await digests.updateDigest(INSTANCE, (draft) =>
      setSchedule(draft, { ...schedule, schedule: { ...schedule.schedule, unreviewed: 2 } }),
    );
    const triples = pod.triples(DIGEST)!.filter((t) => t.startsWith(`<${subject}>`));
    expect(triples).toContain(
      `<${subject}> <${SM}formatVersion> "2"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
    );
    expect(triples).toContain(`<${subject}> <${SM}scheduledWith> <${SM}sm2> .`);
    expect(triples.filter((t) => t.includes("formatVersion"))).toHaveLength(1);
  });

  it("leaves out what does not fit its shape", async () => {
    const pod = fakePod();
    await pod.put(
      DIGEST,
      `${PREFIXES}<#receipt-x> a sm:DocumentReceipt ; sm:receiptOf <decks/x.ttl> .
       <#schedule-x> a sm:DeckSchedule ; sm:scheduleOf <catalog.ttl#x> .
       <#month-x> a sm:MonthSummary ; sm:summaryOf <history/2026-09.ttl> .
       <#month-y> a sm:MonthSummary ; sm:formatVersion 1 ; sm:summaryOf <history/2026-08.ttl> ;
         sm:summarizedVersion "v" ; sm:youngReviewCount 0 ; sm:youngRecalledCount 0 ;
         sm:studyDayCounts "2026-08-01 x" .
       <#other> a sm:Card .`,
    );
    expect(await createSolidDigestRepository({ fetch: pod.fetch }).readDigest(INSTANCE)).toEqual(
      emptyDigest(),
    );
  });

  /** A schedule of format 1 of the deck `deckUrl`, at the subject `#<id>`. */
  const scheduleAt = (id: string, deckUrl: string) =>
    `<#${id}> a sm:DeckSchedule ; sm:formatVersion 1 ;
        sm:scheduleOf <${deckUrl}> ; sm:cardsVersion "v1" ; sm:reviewsVersion "${ABSENT_VERSION}" ;
        sm:scheduledDirection sm:frontToBack ; sm:scheduledDayBoundaryHour 4 ; sm:scheduledOn "2026-10-01" ;
        sm:unreviewedCount 3 ; sm:reviewedOnDayCount 1 ; sm:introducedOnDayCount 0 .\n`;
  const receiptAt = (id: string, document: string) =>
    `<#${id}> a sm:DocumentReceipt ; sm:formatVersion 1 ; sm:receiptOf <${document}> ;
        sm:documentVersion "v" .\n`;

  it("leaves out a receipt of no document's address and a schedule of no deck of the instance, and removes them at the next write", async () => {
    const pod = fakePod();
    await pod.put(
      DIGEST,
      PREFIXES +
        receiptAt("folder", "decks/") +
        receiptAt("acl", "decks/x.ttl.acl") +
        receiptAt("kept", "decks/x.ttl") +
        receiptAt("again", "decks/x.ttl") +
        scheduleAt("foreign", "https://elsewhere.example/i/catalog.ttl#deck-1") +
        scheduleAt("other", `${INSTANCE}meta.ttl#deck-1`) +
        scheduleAt("deck", "catalog.ttl#deck-1") +
        scheduleAt("twice", "catalog.ttl#deck-1"),
    );
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const read = (await digests.readDigest(INSTANCE))!;
    expect(Object.keys(read.receipts)).toEqual([`${INSTANCE}decks/x.ttl`]);
    expect(Object.keys(read.schedules)).toEqual([deck.url]);
    await digests.updateDigest(INSTANCE, (draft) =>
      addReceipt(draft, REVIEWS, '"r1"', { latestFormat: true }),
    );
    const subjects = new Set(pod.triples(DIGEST)!.map((t) => t.split(" ")[0]));
    for (const id of ["folder", "acl", "foreign", "other"])
      expect(subjects).not.toContain(`<${DIGEST}#${id}>`);
    for (const id of ["kept", "again", "deck", "twice"])
      expect(subjects).toContain(`<${DIGEST}#${id}>`);
  });

  // Its four fixed documents, each deck's two and each of the drafts' documents.
  const MAX_RECEIPTS = 4 + 2 * MAX_CATALOG_LINKS + MAX_DRAFT_DOCUMENTS_IN_ALL;
  /** A digest of `receipts` receipts and `schedules` schedules, none of the fixtures'. */
  const plantedDigest = (receipts: number, schedules: number) => {
    let planted = PREFIXES;
    for (let i = 0; i < receipts; i++) planted += receiptAt(`r${i}`, `decks/d${i}.ttl`);
    for (let i = 0; i < schedules; i++) planted += scheduleAt(`s${i}`, `catalog.ttl#planted-${i}`);
    return planted;
  };

  it("reads no more receipts and schedules than an instance can have, and removes the rest at the next write", async () => {
    const pod = fakePod();
    await pod.put(DIGEST, plantedDigest(MAX_RECEIPTS + 1, MAX_CATALOG_LINKS + 1));
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    const read = (await digests.readDigest(INSTANCE))!;
    expect(Object.keys(read.receipts)).toHaveLength(MAX_RECEIPTS);
    expect(Object.keys(read.schedules)).toHaveLength(MAX_CATALOG_LINKS);
    await digests.updateDigest(INSTANCE, () => undefined);
    const after = (await digests.readDigest(INSTANCE))!;
    expect(Object.keys(after.receipts)).toHaveLength(MAX_RECEIPTS);
    expect(Object.keys(after.schedules)).toHaveLength(MAX_CATALOG_LINKS);
    expect(pod.triples(DIGEST)!.filter((t) => t.includes("receiptOf"))).toHaveLength(MAX_RECEIPTS);
  });

  it("keeps what is learned while the digest holds as many as it may, in place of the earliest", async () => {
    const pod = fakePod();
    await pod.put(DIGEST, plantedDigest(MAX_RECEIPTS, MAX_CATALOG_LINKS));
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, (draft) => {
      addReceipt(draft, REVIEWS, '"r1"', { latestFormat: true });
      setSchedule(draft, schedule);
    });
    const after = (await digests.readDigest(INSTANCE))!;
    expect(after.receipts[REVIEWS]?.version).toBe('"r1"');
    expect(after.schedules[deck.url]).toEqual(schedule);
    expect(Object.keys(after.receipts)).toHaveLength(MAX_RECEIPTS);
    expect(Object.keys(after.schedules)).toHaveLength(MAX_CATALOG_LINKS);
    expect(after.receipts[`${INSTANCE}decks/d0.ttl`]).toBeUndefined();
    expect(after.receipts[`${INSTANCE}decks/d1.ttl`]).toBeDefined();
    expect(after.schedules[`${INSTANCE}catalog.ttl#planted-0`]).toBeUndefined();
  });

  it("writes no more than it may of what is learned at once", async () => {
    const pod = fakePod();
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    await digests.updateDigest(INSTANCE, (draft) => {
      for (let i = 0; i <= MAX_RECEIPTS; i++)
        addReceipt(draft, `${INSTANCE}decks/d${i}.ttl`, '"v"', { latestFormat: true });
    });
    const after = (await digests.readDigest(INSTANCE))!;
    expect(Object.keys(after.receipts)).toHaveLength(MAX_RECEIPTS);
  });

  it("leaves out a month summary with days not of its month, and writes the one made again over it", async () => {
    const pod = fakePod();
    const subject = `${DIGEST}#month-history-2026-09.ttl`;
    await pod.put(
      DIGEST,
      `${PREFIXES}<#month-history-2026-09.ttl> a sm:MonthSummary ; sm:formatVersion 1 ;
         sm:summaryOf <history/2026-09.ttl> ; sm:summarizedVersion "\\"m1\\"" ;
         sm:youngReviewCount 0 ; sm:youngRecalledCount 0 ;
         sm:studyDayCounts "2026-09-29 1 0 0 0", "2027-01-60 1 0 0 0" .`,
    );
    const digests = createSolidDigestRepository({ fetch: pod.fetch });
    expect(await digests.readDigest(INSTANCE)).toEqual(emptyDigest());
    await digests.updateDigest(INSTANCE, (draft) =>
      setMonthSummaries(draft, { [month.document]: month }),
    );
    expect(await digests.readDigest(INSTANCE)).toEqual(
      changedDigest(null, [(draft) => setMonthSummaries(draft, { [month.document]: month })]),
    );
    const days = pod
      .triples(DIGEST)!
      .filter((t) => t.startsWith(`<${subject}> <${SM}studyDayCounts>`));
    expect(days).toEqual([
      `<${subject}> <${SM}studyDayCounts> "2026-09-29 12 3 8 1" .`,
      `<${subject}> <${SM}studyDayCounts> "2026-09-30 1 0 0 0" .`,
    ]);
  });
});
