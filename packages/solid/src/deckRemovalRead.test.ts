// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { limitedFetch } from "./client/readLimits";
import { readForRemoval, UNREADABLE } from "./datasets";
import { deleteInstanceData } from "./instanceData";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { withReadDeadline } from "./readDeadline";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { INSTANCE, release } from "./testing/deckWrites";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type { Deck } from "@solid-memo/domain/deck";

type Failure = (
  init: RequestInit | undefined,
  through: () => Promise<Response>,
) => Promise<Response>;

/** A pod in memory where reads of the documents in `failing` fail as `failure` says (a short read deadline). */
function pod(failure: Failure) {
  let n = 0;
  const local = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const failing = new Set<string>();
  const fetch = withReadDeadline(
    ((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      return failing.has(url) && (init?.method ?? "GET") === "GET"
        ? failure(init, () => local(input, init))
        : local(input, init);
    }) as typeof globalThis.fetch,
    5,
  );
  const decks = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-06T00:00:00Z"),
    randomId: () => `r${n++}`,
  });
  const reviews = createSolidReviewStateRepository({ fetch, randomId: () => `s${n++}` });
  const deck = async () => {
    const imported = await decks.importDeck(INSTANCE, release(2));
    await reviews.createReviewStates(imported, { sm2: [], fsrs: [] });
    return imported;
  };
  const status = async (url: string) => (await local(url)).status;
  return { local, fetch, failing, decks, deck, status };
}

const answering =
  (status: number): Failure =>
  async () =>
    new Response("down", { status });

/** A 200 whose body fails after its first chunk, as a connection lost during the download does. */
const cutOff: Failure = async () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("@prefix a: <http://a/> .\n"));
        controller.error(new TypeError("connection reset"));
      },
    }),
    { status: 200, headers: { "Content-Type": "text/turtle", ETag: '"x"' } },
  );

/** The deck's entry, its cards document moved to `url`, as listed again. */
async function withCardsAt(p: ReturnType<typeof pod>, instance: string, deck: Deck, url: string) {
  const catalog = documentUrlOf(deck.url);
  const text = await (await p.local(catalog)).text();
  const written = await p.local(catalog, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: text.split(deck.cardsDocumentUrl).join(url),
  });
  expect(written.ok).toBe(true);
  return (await p.decks.listDecks(instance))[0]!;
}

/** A document outside the instance's folder that says it is the deck's. */
async function claimedOutside(p: ReturnType<typeof pod>, deck: Deck) {
  const outside = "https://pod.example/elsewhere/cards.ttl";
  await p.local(outside, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<> <http://purl.org/dc/terms/isPartOf> <${deck.url}> .`,
  });
  return outside;
}

const FAILURES: readonly (readonly [string, Failure, object])[] = [
  ["a server error", answering(503), { statusCode: 503 }],
  ["a refusal of the login", answering(401), { statusCode: 401 }],
  ["a refusal of access", answering(403), { statusCode: 403 }],
  [
    "a network error",
    async () => {
      throw new TypeError("network down");
    },
    { message: "network down" },
  ],
  [
    "no answer before the read deadline",
    (init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
    { code: "podNoAnswer" },
  ],
  ["a download cut off", cutOff, { message: expect.stringContaining("connection reset") }],
];

describe("removing a deck when a read of one of its documents fails", () => {
  for (const [label, failure, thrown] of FAILURES) {
    it(`keeps its entry and its documents, and can be made again: ${label}`, async () => {
      const p = pod(failure);
      const deck = await p.deck();
      p.failing.add(deck.cardsDocumentUrl);

      await expect(p.decks.removeDeck(deck)).rejects.toMatchObject(thrown);

      expect((await p.decks.listDecks(INSTANCE)).map(({ url }) => url)).toEqual([deck.url]);
      expect(await p.status(deck.cardsDocumentUrl)).toBe(200);

      p.failing.clear();
      await expect(p.decks.removeDeck(deck)).resolves.toEqual({ keptDocuments: [] });
      expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
      expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
      expect(await p.status(deck.reviewsDocumentUrl)).toBe(404);
    });
  }

  it("leaves its documents for the instance's deletion to find", async () => {
    const p = pod(answering(503));
    const deck = await p.deck();
    p.failing.add(deck.cardsDocumentUrl);
    await expect(p.decks.removeDeck(deck)).rejects.toMatchObject({ statusCode: 503 });
    p.failing.clear();

    await deleteInstanceData(INSTANCE, p.fetch);

    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
  });

  it("finishes a removal stopped between its documents", async () => {
    const p = pod(answering(503));
    const deck = await p.deck();
    p.failing.add(deck.reviewsDocumentUrl);

    await expect(p.decks.removeDeck(deck)).rejects.toMatchObject({ statusCode: 503 });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
    expect((await p.decks.listDecks(INSTANCE)).map(({ url }) => url)).toEqual([deck.url]);

    p.failing.clear();
    await expect(p.decks.removeDeck(deck)).resolves.toEqual({ keptDocuments: [] });
    expect(await p.status(deck.reviewsDocumentUrl)).toBe(404);
    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
  });

  it("of several, keeps every entry until each document can be read", async () => {
    const p = pod(answering(503));
    const first = await p.deck();
    const second = await p.deck();
    p.failing.add(second.cardsDocumentUrl);

    await expect(p.decks.removeDecks([first, second])).rejects.toMatchObject({ statusCode: 503 });
    expect((await p.decks.listDecks(INSTANCE)).map(({ url }) => url).sort()).toEqual(
      [first.url, second.url].sort(),
    );
    expect(await p.status(second.cardsDocumentUrl)).toBe(200);

    p.failing.clear();
    await expect(p.decks.removeDecks([first, second])).resolves.toEqual({ keptDocuments: [] });
    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
    expect(await p.status(first.cardsDocumentUrl)).toBe(404);
    expect(await p.status(second.cardsDocumentUrl)).toBe(404);
  });

  it("names a document the pod serves that cannot be read as RDF, keeps it, and removes the entry", async () => {
    const p = pod(answering(503));
    const deck = await p.deck();
    const response = await p.local(deck.cardsDocumentUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: "not RDF",
    });
    expect(response.ok).toBe(true);

    await expect(p.decks.removeDeck(deck)).resolves.toEqual({
      keptDocuments: [deck.cardsDocumentUrl],
    });

    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
  });

  it("keeps the entry when the download is cut off on the read that takes the document out", async () => {
    let reads = 0;
    const p = pod((init, through) => (++reads === 1 ? through() : cutOff(init, through)));
    const deck = await p.deck();
    p.failing.add(deck.cardsDocumentUrl);

    await expect(p.decks.removeDeck(deck)).rejects.toMatchObject({
      message: expect.stringContaining("connection reset"),
    });

    expect((await p.decks.listDecks(INSTANCE)).map(({ url }) => url)).toEqual([deck.url]);
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it("counts a document answered with 410 as gone, on either read", async () => {
    for (const first of [true, false]) {
      let reads = 0;
      const p = pod((init, through) =>
        !first && ++reads === 1 ? through() : answering(410)(init, through),
      );
      const deck = await p.deck();
      p.failing.add(deck.cardsDocumentUrl);

      await expect(p.decks.removeDeck(deck)).resolves.toEqual({ keptDocuments: [] });
      expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
    }
  });

  it("is not held back by a document outside the instance's folder that fails to be read, which it names", async () => {
    const failures = [
      answering(403),
      answering(503),
      async () => {
        throw new TypeError("no such host");
      },
      cutOff,
    ];
    for (const failure of failures) {
      const p = pod(failure);
      const outside = "https://dead.example/cards.ttl";
      p.failing.add(outside);
      const deck = await withCardsAt(p, INSTANCE, await p.deck(), outside);

      await expect(p.decks.removeDeck(deck)).resolves.toEqual({ keptDocuments: [outside] });
      expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
    }
  });

  it("is not held back by a document outside the instance's folder that fails on the read that takes it out", async () => {
    let reads = 0;
    const p = pod((init, through) =>
      ++reads % 2 === 1 ? through() : answering(503)(init, through),
    );
    const imported = await p.deck();
    const outside = await claimedOutside(p, imported);
    const deck = await withCardsAt(p, INSTANCE, imported, outside);
    p.failing.add(outside);

    await expect(p.decks.removeDeck(deck)).resolves.toEqual({ keptDocuments: [outside] });

    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
    expect(await p.status(outside)).toBe(200);
  });

  it("of an instance, names a document outside its folder that fails on the read that takes it out", async () => {
    let reads = 0;
    const p = pod((init, through) =>
      ++reads % 2 === 1 ? through() : answering(503)(init, through),
    );
    const imported = await p.deck();
    const outside = await claimedOutside(p, imported);
    await withCardsAt(p, INSTANCE, imported, outside);
    p.failing.add(outside);

    const deletion = await deleteInstanceData(INSTANCE, p.fetch);

    expect(deletion.keptDocuments).toEqual([outside]);
    expect(await p.status(outside)).toBe(200);
  });

  it("of an instance, names a document outside its folder that fails to be read", async () => {
    const p = pod(answering(503));
    const imported = await p.deck();
    const outside = await claimedOutside(p, imported);
    const deck = await withCardsAt(p, INSTANCE, imported, outside);
    expect(await p.decks.unclaimedDocuments(deck)).toEqual([]);
    p.failing.add(outside);

    const deletion = await deleteInstanceData(INSTANCE, p.fetch);

    expect(deletion.keptDocuments).toEqual([outside]);
    expect(await p.status(outside)).toBe(200);
  });

  it("of an instance at a pod's root, stops before the catalog when a document's read fails", async () => {
    const root = "https://pod.example/";
    const p = pod(answering(503));
    const deck = await p.decks.importDeck(root, release(2));
    p.failing.add(deck.cardsDocumentUrl);

    await expect(deleteInstanceData(root, p.fetch)).rejects.toMatchObject({ statusCode: 503 });

    expect(await p.status(documentUrlOf(deck.url))).toBe(200);
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
    expect((await p.decks.listDecks(root)).map(({ url }) => url)).toEqual([deck.url]);
  });

  it("of an instance at a pod's root, names a document the pod serves that cannot be read as RDF, once", async () => {
    const root = "https://pod.example/";
    const p = pod(answering(503));
    const deck = await p.decks.importDeck(root, release(2));
    await p.local(deck.cardsDocumentUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: "not RDF",
    });

    const deletion = await deleteInstanceData(root, p.fetch);

    expect(deletion.keptDocuments).toEqual([deck.cardsDocumentUrl]);
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it("takes a document past the read's limits for served, by its Content-Length or as it is read", async () => {
    const limits = { bytes: 4, quads: 10, characters: 10 };
    const url = "https://pod.example/big.ttl";
    const long = new Response("<a> <b> <c> .", {
      headers: { "Content-Type": "text/turtle", "Content-Length": "13" },
    });
    const stream = new Response(new Blob(["<a> <b> <c> ."]).stream(), {
      headers: { "Content-Type": "text/turtle" },
    });
    for (const response of [long, stream]) {
      const fetch = limitedFetch(async () => response, limits);
      await expect(readForRemoval(url, fetch)).resolves.toBe(UNREADABLE);
    }
  });

  it("leaves a document that cannot be read to the caller of deleteDocument to handle", async () => {
    const p = pod(answering(503));
    const deck = await p.deck();
    p.failing.add(deck.cardsDocumentUrl);

    await expect(p.decks.deleteDocument(deck, deck.cardsDocumentUrl)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });
});
