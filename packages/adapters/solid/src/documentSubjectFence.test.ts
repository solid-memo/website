// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Whose a deck's cards or reviews document is, the document says of
 * itself (`<> dcterms:isPartOf` its deck's catalog entry). Whether a
 * deck may write the document is judged on the document as read, never
 * on the edit about to be saved, and the document itself is never read,
 * or removed, as a card, a distractor or a review state: a deck the
 * catalog points at another deck's document cannot write it, and no
 * removal through it takes the other deck's back-link away. The pod is
 * a local one.
 */
import { describe, expect, it } from "vitest";
import {
  buildThing,
  createSolidDataset,
  getThing,
  removeThings,
  setThing,
} from "@solid-memo/solid-client/rdf";
import { asReadOf, getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createDeckDocumentGuard } from "./deckPlace";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { DCTERMS, SM } from "./vocab";

const ROOT = "https://pod.example/";
const INSTANCE = `${ROOT}bob/solid-memo/main/`;
const PART_OF = `<${DCTERMS.isPartOf}>`;
const CARD = {
  created: `<${DCTERMS.created}> "2026-10-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>`,
};
const DOS = { front: { "": "dos" }, back: { "": "two" } };

/**
 * Deck V with a card, and deck X, which the catalog points at V's cards
 * and reviews documents: X is not their deck, so a write of them through
 * X is refused.
 */
async function setUp() {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    local(new Request(String(input)).url, init)) as typeof globalThis.fetch;
  const put = (url: string, body: string) =>
    local(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body });
  const text = async (url: string) => (await local(url)).text();
  let ids = 0;
  const decks = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-22T00:00:00.000Z"),
    randomId: () => `id${++ids}`,
  });
  const reviews = createSolidReviewStateRepository({ fetch, randomId: () => `s${++ids}` });
  const victim = await decks.createDeck(INSTANCE, { en: "Victim" });
  const card = await decks.addCard(victim, { front: { "": "uno" }, back: { "": "one" } });
  await reviews.applyReviewChanges(victim, {
    remove: [],
    save: [
      {
        cardId: card.id,
        direction: "front-to-back",
        due: "2026-12-01",
        intervalDays: 3,
        easeFactor: 2.5,
        repetitions: 1,
        firstReviewedAt: "2026-11-20T10:00:00.000Z",
        lastReviewedAt: "2026-11-21T10:00:00.000Z",
        formatVersion: 2,
      },
    ],
  });
  const x = await decks.createDeck(INSTANCE, { en: "Planted" });
  const catalog = `${INSTANCE}catalog.ttl`;
  await put(
    catalog,
    (await text(catalog))
      .replaceAll(`<decks/${x.id}.ttl>`, `<decks/${victim.id}.ttl>`)
      .replaceAll(`<${x.cardsDocumentUrl}>`, `<${victim.cardsDocumentUrl}>`)
      .replaceAll(`<reviews/${x.id}.ttl>`, `<reviews/${victim.id}.ttl>`)
      .replaceAll(`<${x.reviewsDocumentUrl}>`, `<${victim.reviewsDocumentUrl}>`),
  );
  const planted = (await decks.listDecks(INSTANCE)).find((deck) => deck.url === x.url)!;
  expect(planted.cardsDocumentUrl).toBe(victim.cardsDocumentUrl);
  expect(planted.reviewsDocumentUrl).toBe(victim.reviewsDocumentUrl);
  /** Append Turtle to a document, as anyone who may append to it can. */
  const append = async (url: string, turtle: string) =>
    expect((await put(url, `${await text(url)}\n${turtle}`)).ok).toBe(true);
  return { fetch, decks, victim, planted, append, text };
}

/** The lines of a document that say whose it is. */
const backLinks = (turtle: string) => turtle.split("\n").filter((line) => line.includes(PART_OF));

/** V still says it is V's alone, X is still refused, and V still writes its own document. */
async function expectStillVictims(
  { decks, victim, planted, text }: Awaited<ReturnType<typeof setUp>>,
  before: string,
) {
  const after = await text(victim.cardsDocumentUrl);
  expect(after).toBe(before);
  expect(backLinks(after).join("\n")).toContain(`<${victim.url}>`);
  expect(backLinks(after).join("\n")).not.toContain(`<${planted.url}>`);
  await expect(decks.addCard(planted, DOS)).rejects.toMatchObject({
    code: "deckDocumentUnclaimed",
  });
  await expect(decks.addCard(victim, DOS)).resolves.toBeDefined();
}

describe("a deck's document another deck is pointed at", () => {
  it("is no card at the document's own IRI, and removing it through the other deck writes nothing", async () => {
    const pod = await setUp();
    const { decks, planted, victim, append, text } = pod;
    const doc = victim.cardsDocumentUrl;
    await append(
      doc,
      `<${doc}> a <${SM.Card}>; <${SM.front}> "Delete me"; <${SM.back}> "x"; <${SM.formatVersion}> 6; ${CARD.created} .`,
    );
    const before = await text(doc);
    expect((await decks.listCards(planted)).map((card) => card.url)).not.toContain(doc);
    const [own] = await decks.listCards(victim);
    await expect(decks.removeCard(planted, { ...own!, url: doc, id: doc })).rejects.toMatchObject({
      code: "deckDocumentUnclaimed",
    });
    await expectStillVictims(pod, before);
  });

  it("is no distractor at the document's own IRI, and removing the card that names it through the other deck writes nothing", async () => {
    const pod = await setUp();
    const { decks, planted, victim, append, text } = pod;
    const doc = victim.cardsDocumentUrl;
    await append(
      doc,
      `<${doc}#card-z> a <${SM.Card}>; <${SM.front}> "Delete me"; <${SM.back}> "x";
  <${SM.distractor}> <${doc}>; <${SM.formatVersion}> 6; ${CARD.created} .
<${doc}> a <${SM.Distractor}>; <${SM.distractorText}> "planted"; <${SM.formatVersion}> 1 .`,
    );
    const before = await text(doc);
    const z = (await decks.listCards(planted)).find((card) => card.url === `${doc}#card-z`)!;
    expect(z.distractors ?? []).toEqual([]);
    await expect(
      decks.applyCardChanges(planted, { save: [], remove: ["card-z"] }),
    ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
    await expect(decks.removeCard(planted, z)).rejects.toMatchObject({
      code: "deckDocumentUnclaimed",
    });
    await expectStillVictims(pod, before);
  });

  it("is judged as read, not as an edit that takes the other deck's back-link out of it", async () => {
    const { fetch, victim, planted, text } = await setUp();
    const guard = createDeckDocumentGuard(fetch);
    for (const url of [victim.cardsDocumentUrl, victim.reviewsDocumentUrl]) {
      const before = await text(url);
      const read = (await getSolidDatasetOrNull(url, fetch))!;
      const edited = removeThings(read, [url]);
      expect(asReadOf(edited)).toBe(read);
      await expect(guard.writable(planted, url, edited)).rejects.toMatchObject({
        code: "deckDocumentUnclaimed",
      });
      // The deck whose document it is still writes it, as read.
      await expect(guard.writable(victim, url, edited)).resolves.toBeDefined();
      expect(await text(url)).toBe(before);
    }
  });

  it("is judged on what a save left it holding, for an edit of that", async () => {
    const { fetch, victim, planted } = await setUp();
    const guard = createDeckDocumentGuard(fetch);
    const url = victim.cardsDocumentUrl;
    const read = (await getSolidDatasetOrNull(url, fetch))!;
    const note = buildThing(getThing(read, url)!)
      .addStringNoLocale("https://example.org/note", "a note")
      .build();
    await saveDataset(url, setThing(read, note), fetch);
    const saved = (await getSolidDatasetOrNull(url, fetch))!;
    expect(asReadOf(saved)).toBe(saved);
    await expect(guard.writable(planted, url, removeThings(saved, [url]))).rejects.toMatchObject({
      code: "deckDocumentUnclaimed",
    });
  });
});

describe("the document's own subject", () => {
  it("stays whole, with whose the document is, when its own deck removes the cards that would take it", async () => {
    const { decks, victim, append, text } = await setUp();
    const doc = victim.cardsDocumentUrl;
    const reviewsDoc = victim.reviewsDocumentUrl;
    const [own] = await decks.listCards(victim);
    await append(
      doc,
      `<${doc}> a <${SM.Card}>, <${SM.Distractor}>; <${SM.front}> "Delete me"; <${SM.back}> "x"; <${SM.formatVersion}> 6; ${CARD.created} .
<${doc}#card-z> a <${SM.Card}>; <${SM.front}> "Delete me"; <${SM.back}> "x";
  <${SM.distractor}> <${doc}>; <${SM.formatVersion}> 6; ${CARD.created} .`,
    );
    await append(
      reviewsDoc,
      `<${reviewsDoc}> a <${SM.ReviewState}>; <${SM.reviewOf}> <${own!.url}> .`,
    );
    expect((await decks.listCards(victim)).map((card) => card.url)).toEqual([
      own!.url,
      `${doc}#card-z`,
    ]);
    await decks.applyCardChanges(victim, { save: [], remove: ["card-z"] });
    await decks.removeCard(victim, { ...own!, url: doc, id: doc });
    await decks.removeCard(victim, own!);
    const cards = await text(doc);
    expect(cards).toContain("Delete me");
    expect(cards).not.toContain("card-z");
    expect(backLinks(cards).join("\n")).toContain(`<${victim.url}>`);
    const progress = await text(reviewsDoc);
    expect(progress).toContain(SM.ReviewState);
    expect(backLinks(progress).join("\n")).toContain(`<${victim.url}>`);
  });
});

describe("asReadOf", () => {
  it("is the dataset itself for one no read made", () => {
    const built = createSolidDataset();
    expect(asReadOf(built)).toBe(built);
  });
});
