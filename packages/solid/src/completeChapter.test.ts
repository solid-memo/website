import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";
import type { WriteCheck } from "./writeCheck";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
const COMPLETED = "<https://solid-memo.com/ns/vocab/v1.ttl#completedChapter>";

/** A pod whose catalogue holds a course's deck, deck-1, copied from RELEASE. */
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
  return createSolidDeckRepository({ fetch, now: () => new Date("2026-10-07T10:00:00.000Z"), randomId: () => "new", checkWrite });
}

const writes = (pod: ReturnType<typeof fakePod>) => pod.requests.filter((request) => request.method !== "GET");
const completedIn = (pod: ReturnType<typeof fakePod>) =>
  pod.triples(CATALOG)!.filter((triple) => triple.includes(COMPLETED)).map((triple) => triple.split(" ")[2]);

describe("completing a course chapter", () => {
  it("adds the chapter to the deck's catalog entry in one write, If-Match the read, and reads back with it", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    const done = await repository.completeChapter(deck, `${RELEASE}#ch-1`);
    expect(done.completedChapters).toEqual([`${RELEASE}#ch-1`]);
    expect(writes(pod)).toEqual([expect.objectContaining({ method: "PATCH", url: CATALOG, ifMatch: '"v1"', status: 205 })]);
    await repository.completeChapter(done, `${RELEASE}#ch-2`);
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-1>`, `<${RELEASE}#ch-2>`]);
    expect(await repository.readDeck(deck.url)).toMatchObject({ completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`] });
  });

  it("writes nothing for a chapter already completed", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    await repository.completeChapter(deck, `${RELEASE}#ch-1`);
    pod.clearRequests();
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).resolves.toMatchObject({ completedChapters: [`${RELEASE}#ch-1`] });
    // Nor for the same chapter of a later release: completing it there is the same.
    const later = RELEASE.replace("v1.ttl", "v2.ttl");
    await expect(repository.completeChapter(deck, `${later}#ch-1`)).resolves.toMatchObject({ completedChapters: [`${RELEASE}#ch-1`] });
    expect(writes(pod)).toEqual([]);
  });

  it("adds it again to the document as it is when it changed meanwhile, keeping what changed", async () => {
    const pod = await podWithCourse();
    const elsewhere = repositoryOn(pod.fetch);
    let meanwhile: (() => Promise<unknown>) | null = () => elsewhere.saveDeck({ ...deck, title: { en: "Solid, renamed" } });
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
    expect(done).toMatchObject({ title: { en: "Solid, renamed" }, completedChapters: [`${RELEASE}#ch-1`] });
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-1>`]);
  });

  it("gives up after three writes the pod refuses as changed, at once on any other failure, and on a deck that is gone", async () => {
    const pod = await podWithCourse();
    const repository = repositoryOn(pod.fetch);
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", CATALOG, 412);
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(writes(pod)).toHaveLength(3);
    pod.clearRequests();
    pod.failNext("PATCH", CATALOG, 500);
    await expect(repository.completeChapter(deck, `${RELEASE}#ch-1`)).rejects.toThrow();
    expect(writes(pod)).toHaveLength(1);
    await expect(repository.completeChapter({ ...deck, url: `${CATALOG}#gone` }, `${RELEASE}#ch-1`)).rejects.toMatchObject({ code: "deckGone" });
    await expect(repositoryOn(fakePod().fetch).completeChapter(deck, `${RELEASE}#ch-1`)).rejects.toMatchObject({ code: "deckGone" });
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
    const edited = await repository.setCompletedChapters(deck, { kind: "notDone", chapterUrl: `${LATER}#ch-1` });
    expect(edited.completedChapters).toEqual([`${RELEASE}#ch-2`]);
    expect(checked).toEqual([[deck.url]]);
    expect(writes(pod)).toEqual([expect.objectContaining({ method: "PATCH", url: CATALOG, status: 205 })]);
    expect(completedIn(pod)).toEqual([`<${RELEASE}#ch-2>`]);
    pod.clearRequests();
    await expect(repository.setCompletedChapters(deck, { kind: "notDone", chapterUrl: `${RELEASE}#ch-1` })).resolves.toMatchObject({
      completedChapters: [`${RELEASE}#ch-2`],
    });
    expect(writes(pod)).toEqual([]);
  });

  it("restarts the course: no chapter completed", async () => {
    const pod = await podWithChapters();
    const restarted = await repositoryOn(pod.fetch).setCompletedChapters(deck, { kind: "restart" });
    expect(restarted).not.toHaveProperty("completedChapters");
    expect(completedIn(pod)).toEqual([]);
    expect(await repositoryOn(pod.fetch).readDeck(deck.url)).not.toHaveProperty("completedChapters");
  });

  it("writes nothing the write check refuses", async () => {
    const pod = await podWithChapters();
    const refusing = repositoryOn(pod.fetch, async () => {
      throw new Error("refused");
    });
    await expect(refusing.setCompletedChapters(deck, { kind: "restart" })).rejects.toThrow("refused");
    expect(writes(pod)).toEqual([]);
  });
});
