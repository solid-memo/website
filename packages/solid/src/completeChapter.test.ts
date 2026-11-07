// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MAX_COMPLETED_CHAPTERS, type Deck } from "@solid-memo/domain/deck";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";
import type { WriteCheck } from "./writeCheck";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
const COMPLETED = "<https://solid-memo.com/ns/vocab/v1.ttl#completedChapter>";

/** A pod whose catalog holds a course's deck, deck-1, copied from RELEASE. */
async function podWithCourse() {
  const pod = fakePod();
  await pod.put(
    CATALOG,
    `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
<#deck-1> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "Solid"@en ; dcterms:description "A course."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <${INSTANCE}decks/deck-1.ttl> ; sm:reviewsDocument <${INSTANCE}reviews/deck-1.ttl> ;
  prov:wasDerivedFrom <${RELEASE}> .
`,
  );
  return pod;
}

const deck: Deck = {
  id: "deck-1",
  url: `${CATALOG}#deck-1`,
  title: { en: "Solid" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  createdAt: "",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
  sourceUrl: RELEASE,
};

function repositoryOn(fetch: typeof globalThis.fetch, checkWrite?: WriteCheck) {
  return createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-07T10:00:00.000Z"),
    randomId: () => "new",
    checkWrite,
  });
}

const writes = (pod: ReturnType<typeof fakePod>) =>
  pod.requests.filter((request) => request.method !== "GET");
const completedIn = (pod: ReturnType<typeof fakePod>) =>
  pod
    .triples(CATALOG)!
    .filter((triple) => triple.includes(COMPLETED))
    .map((triple) => triple.split(" ")[2]);

describe("completing a course chapter", () => {
  it("adds the chapter to the deck's catalog entry in one write, If-Match the read, and reads back with it", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    const done = await repository.completeChapter(deck, `${RELEASE}#ch-1`);
    expect(done.completedChapters).toEqual([`${RELEASE}#ch-1`]);
    expect(writes(pod)).toEqual([
      expect.objectContaining({ method: "PATCH", url: CATALOG, ifMatch: '"v1"', status: 205 }),
    ]);
    await repository.completeChapter(done, `${RELEASE}#ch-2`);
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-1>`, `<${RELEASE}#ch-2>`]);
    expect(await repository.readDeck(deck.url)).toMatchObject({
      completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`],
    });
  });

  it("writes nothing for a chapter already completed", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.completeChapter(deck, `${RELEASE}#ch-1`);
    pod.clearRequests();
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).resolves.toMatchObject({
      completedChapters: [`${RELEASE}#ch-1`],
    });
    // Nor for the same chapter of a later release: completing it there is the same.
    const later = RELEASE.replace("v1.ttl", "v2.ttl");
    await expect(repository.completeChapter(deck, `${later}#ch-1`)).resolves.toMatchObject({
      completedChapters: [`${RELEASE}#ch-1`],
    });
    expect(writes(pod)).toEqual([]);
  });

  it("adds it again to the document as it is when it changed meanwhile, keeping what changed", async () => {
    const pod = await podWithCourse();
    const elsewhere = repositoryOn(pod.fetch);
    let meanwhile: (() => Promise<unknown>) | null = () =>
      elsewhere.saveDeck({ ...deck, title: { en: "Solid, renamed" } });
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH" && meanwhile !== null) {
        const change = meanwhile;
        meanwhile = null;
        await change();
      }
      return pod.fetch(input, init);
    }) as typeof globalThis.fetch;
    const done = await repositoryOn(fetch).completeChapter(deck, `${RELEASE}#ch-1`);
    expect(writes(pod).map((request) => request.status)).toEqual([205, 412, 205]);
    expect(done).toMatchObject({
      title: { en: "Solid, renamed" },
      completedChapters: [`${RELEASE}#ch-1`],
    });
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-1>`]);
  });

  it("gives up after three writes the pod refuses as changed, at once on any other failure, and on a deck that is gone", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", CATALOG, 412);
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(writes(pod)).toHaveLength(3);
    pod.clearRequests();
    pod.failNext("PATCH", CATALOG, 500);
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).rejects.toThrow();
    expect(writes(pod)).toHaveLength(1);
    await expect(
      repository.completeChapter({ ...deck, url: `${CATALOG}#gone` }, `${RELEASE}#ch-1`),
    ).rejects.toMatchObject({ code: "deckGone" });
    await expect(
      repositoryOn(fakePod().fetch).completeChapter(deck, `${RELEASE}#ch-1`),
    ).rejects.toMatchObject({ code: "deckGone" });
  });

  it("keeps a new completion when the entry already holds MAX_COMPLETED_CHAPTERS of them", async () => {
    const pod = await podWithCourse();
    // As many as a read keeps, none a chapter of the course, as another app may write them.
    const planted = Array.from(
      { length: MAX_COMPLETED_CHAPTERS },
      (_, i) => `<#deck-1> ${COMPLETED} <https://elsewhere.example/x${i}.ttl#other-${i}> .`,
    ).join("\n");
    const catalog = await (await pod.fetch(CATALOG)).text();
    await pod.put(CATALOG, `${catalog}\n${planted}\n`);
    const repository = repositoryOn(pod.fetch);
    const read = (await repository.readDeck(deck.url))!;
    await repository.completeChapter(read, `${RELEASE}#ch-1`);
    expect(completedIn(pod)).toHaveLength(MAX_COMPLETED_CHAPTERS);
    const again = await repository.readDeck(deck.url);
    expect(again?.completedChapters).toContain(`${RELEASE}#ch-1`);
  });

  it.each([
    ["of other documents", (i: number) => `https://elsewhere.example/x${i}.ttl#other-${i}`],
    ["of the course's release", (i: number) => `${RELEASE}#other-${i}`],
  ])("keeps every completion past MAX_COMPLETED_CHAPTERS values %s", async (_, planted) => {
    const pod = await podWithCourse();
    const values = Array.from(
      { length: MAX_COMPLETED_CHAPTERS },
      (_, i) => `<#deck-1> ${COMPLETED} <${planted(i)}> .`,
    ).join("\n");
    const catalog = await (await pod.fetch(CATALOG)).text();
    await pod.put(CATALOG, `${catalog}\n${values}\n`);
    const repository = repositoryOn(pod.fetch);
    const chapters = [1, 2, 3, 4, 5].map((n) => `${RELEASE}#ch-${n}`);
    for (const chapter of chapters) {
      await repository.completeChapter((await repository.readDeck(deck.url))!, chapter);
    }
    const again = await repositoryOn(pod.fetch).readDeck(deck.url);
    expect(again?.completedChapters).toHaveLength(MAX_COMPLETED_CHAPTERS);
    expect(again?.completedChapters).toEqual(expect.arrayContaining(chapters));
    expect(completedIn(pod)).toHaveLength(MAX_COMPLETED_CHAPTERS);
  });
});

describe("changing the chapters completed in the Studio", () => {
  const LATER = RELEASE.replace("v1.ttl", "v2.ttl");

  async function podWithChapters() {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.completeChapter(deck, `${RELEASE}#ch-1`);
    await repository.completeChapter(deck, `${RELEASE}#ch-2`);
    pod.clearRequests();
    return pod;
  }

  it("marks a chapter not done, in one checked write If-Match the read, and writes nothing when it is not done", async () => {
    const pod = await podWithChapters();
    const checked: string[][] = [];
    const repository = repositoryOn(pod.fetch, async (_dataset, subjects) => {
      checked.push([...subjects]);
    });
    // The same chapter of a later release is the same chapter.
    const edited = await repository.setCompletedChapters(deck, {
      kind: "notDone",
      chapterUrl: `${LATER}#ch-1`,
    });
    expect(edited.completedChapters).toEqual([`${RELEASE}#ch-2`]);
    expect(checked).toEqual([[deck.url]]);
    expect(writes(pod)).toEqual([
      expect.objectContaining({ method: "PATCH", url: CATALOG, status: 205 }),
    ]);
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-2>`]);
    pod.clearRequests();
    await expect(
      repository.setCompletedChapters(deck, { kind: "notDone", chapterUrl: `${RELEASE}#ch-1` }),
    ).resolves.toMatchObject({
      completedChapters: [`${RELEASE}#ch-2`],
    });
    expect(writes(pod)).toEqual([]);
  });

  it("restarts the course: no chapter completed", async () => {
    const pod = await podWithChapters();
    const restarted = await repositoryOn(pod.fetch).setCompletedChapters(deck, { kind: "restart" });
    expect(restarted).not.toHaveProperty("completedChapters");
    expect(completedIn(pod)).toEqual([]);
    expect(await repositoryOn(pod.fetch).readDeck(deck.url)).not.toHaveProperty(
      "completedChapters",
    );
  });

  it("reads at most MAX_COMPLETED_CHAPTERS of them, and an edit writes those it keeps of them", async () => {
    const pod = await podWithCourse();
    // Many more than any course has, all named after one of its chapters, as another app may write them.
    const many = Array.from(
      { length: MAX_COMPLETED_CHAPTERS + 500 },
      (_, i) => `https://elsewhere.example/x${i}.ttl#ch-1`,
    );
    const catalog = await (await pod.fetch(CATALOG)).text();
    const planted = many.map((url) => `<#deck-1> ${COMPLETED} <${url}> .`).join("\n");
    await pod.put(CATALOG, `${catalog}\n${planted}\n<#deck-1> ${COMPLETED} <${RELEASE}#ch-2> .\n`);
    const repository = repositoryOn(pod.fetch);
    const read = await repository.readDeck(deck.url);
    // The course's own kept first, then the newest of the others.
    expect(read?.completedChapters).toEqual([...many.slice(501), `${RELEASE}#ch-2`]);
    // The values past the bound are left out of what is written.
    const edited = await repository.setCompletedChapters(deck, {
      kind: "notDone",
      chapterUrl: `${RELEASE}#ch-1`,
    });
    expect(edited.completedChapters).toEqual([`${RELEASE}#ch-2`]);
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-2>`]);
  });

  it("writes nothing the write check refuses", async () => {
    const pod = await podWithChapters();
    const refusing = repositoryOn(pod.fetch, async () => {
      throw new Error("refused");
    });
    await expect(refusing.setCompletedChapters(deck, { kind: "restart" })).rejects.toThrow(
      "refused",
    );
    expect(writes(pod)).toEqual([]);
  });
});

describe("the deck's card language", () => {
  const LANGUAGE = "<https://solid-memo.com/ns/vocab/v1.ttl#deckCardLanguage>";
  const languageIn = (pod: ReturnType<typeof fakePod>) =>
    pod
      .triples(CATALOG)!
      .filter((triple) => triple.includes(LANGUAGE))
      .map((triple) => triple.split(" ")[2]);

  it("sets it on the entry in one write, If-Match the read, replaces it and clears it", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    expect(await repository.setCardLanguage(deck, "sv")).toMatchObject({ cardLanguage: "sv" });
    expect(writes(pod)).toEqual([
      expect.objectContaining({ method: "PATCH", url: CATALOG, ifMatch: '"v1"', status: 205 }),
    ]);
    expect(languageIn(pod)).toEqual(['"sv"']);
    await repository.setCardLanguage(deck, "ko");
    expect(await repository.readDeck(deck.url)).toMatchObject({ cardLanguage: "ko" });
    const cleared = await repository.setCardLanguage(deck, null);
    expect(cleared).not.toHaveProperty("cardLanguage");
    expect(languageIn(pod)).toEqual([]);
  });

  it("writes nothing for the language the entry has, and throws deckGone for a deck it has none of", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.setCardLanguage(deck, "sv");
    pod.clearRequests();
    expect(await repository.setCardLanguage(deck, "sv")).toMatchObject({ cardLanguage: "sv" });
    expect(writes(pod)).toEqual([]);
    await expect(
      repository.setCardLanguage({ ...deck, url: `${CATALOG}#gone` }, "sv"),
    ).rejects.toMatchObject({ code: "deckGone" });
  });

  it("is kept by every save of a deck read before it was set", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    // Another tab sets it while this one holds the deck as read before.
    await repository.setCardLanguage(deck, "sv");
    await repository.renameDeck(deck, { en: "Solid, renamed" });
    await repository.saveDeck({ ...deck, newCardsPerDay: 5 });
    expect(languageIn(pod)).toEqual(['"sv"']);
    expect(await repository.readDeck(deck.url)).toMatchObject({
      title: { en: "Solid" },
      newCardsPerDay: 5,
      cardLanguage: "sv",
    });
  });
});

describe("the hosts whose pictures the deck shows", () => {
  const HOST = "<https://solid-memo.com/ns/vocab/v1.ttl#deckPictureHost>";
  const hostsIn = (pod: ReturnType<typeof fakePod>) =>
    pod
      .triples(CATALOG)!
      .filter((triple) => triple.includes(HOST))
      .map((triple) => triple.split(" ")[2])
      .sort();

  it("adds a host on the entry in one write, If-Match the read, keeps the others, and takes one away", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    expect(await repository.setPictureHost(deck, "a.example", true)).toMatchObject({
      pictureHosts: ["a.example"],
    });
    expect(writes(pod)).toEqual([
      expect.objectContaining({ method: "PATCH", url: CATALOG, ifMatch: '"v1"', status: 205 }),
    ]);
    await repository.setPictureHost(deck, "b.example:8080", true);
    expect(hostsIn(pod)).toEqual(['"a.example"', '"b.example:8080"']);
    expect((await repository.readDeck(deck.url))?.pictureHosts).toEqual(
      expect.arrayContaining(["a.example", "b.example:8080"]),
    );
    await repository.setPictureHost(deck, "a.example", false);
    expect(hostsIn(pod)).toEqual(['"b.example:8080"']);
    const none = await repository.setPictureHost(deck, "b.example:8080", false);
    expect(none).not.toHaveProperty("pictureHosts");
    expect(hostsIn(pod)).toEqual([]);
  });

  it("writes nothing for what the entry says, and throws deckGone for a deck it has none of", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.setPictureHost(deck, "a.example", false);
    expect(writes(pod)).toEqual([]);
    await repository.setPictureHost(deck, "a.example", true);
    pod.clearRequests();
    await repository.setPictureHost(deck, "a.example", true);
    expect(writes(pod)).toEqual([]);
    await expect(
      repository.setPictureHost({ ...deck, url: `${CATALOG}#gone` }, "a.example", true),
    ).rejects.toMatchObject({ code: "deckGone" });
  });

  it("is kept by every save of a deck read before it was set", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.setPictureHost(deck, "a.example", true);
    await repository.renameDeck(deck, { en: "Solid, renamed" });
    await repository.saveDeck({ ...deck, newCardsPerDay: 5 });
    expect(hostsIn(pod)).toEqual(['"a.example"']);
  });
});

describe("registerDeck", () => {
  it("adds a deck's entry with the chapters it completed, in one checked write", async () => {
    const pod = await podWithCourse();
    const checked: string[][] = [];
    const repository = repositoryOn(
      pod.fetch,
      async (_dataset, subjects) => void checked.push([...subjects]),
    );
    const added: Deck = {
      ...deck,
      id: "deck-2",
      url: `${CATALOG}#deck-2`,
      completedChapters: [`${RELEASE}#ch1`],
      cardLanguage: "sv",
    };
    expect(await repository.registerDeck(added)).toBe(added);
    expect(await repository.readDeck(added.url)).toMatchObject({
      id: "deck-2",
      completedChapters: [`${RELEASE}#ch1`],
      cardLanguage: "sv",
    });
    expect(checked[0]).toContain(added.url);
    expect(writes(pod)).toHaveLength(1);
  });

  it("refuses a deck the catalog has an entry of, writing nothing", async () => {
    const pod = await podWithCourse();
    await expect(repositoryOn(pod.fetch).registerDeck(deck)).rejects.toMatchObject({
      code: "alreadyExists",
    });
    expect(writes(pod)).toHaveLength(0);
  });
});
