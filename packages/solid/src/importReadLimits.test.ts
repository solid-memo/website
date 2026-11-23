// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { FOREIGN_LIMITS, limitedFetch, sharedReadBudget } from "./client/readLimits";
import type { UserStorages } from "./deckPlace";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { deckRepository, INSTANCE, put, release } from "./testing/deckWrites";

// Limits small enough that a document past them is quick to make (GHSA-fxpf-f5hv-cr66).
vi.mock("./client/readLimits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client/readLimits")>()),
  FOREIGN_LIMITS: { bytes: 500_000, quads: 400, characters: 100_000_000, valuesPerPredicate: 50 },
}));

/** A pod in memory, its reads through `reads` (as they are, unless given), and the repositories over it, the user's storages `userStorages` (none unless given). */
function pod(
  reads: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch = (f) => f,
  userStorages?: UserStorages,
) {
  let n = 0;
  const local = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const read = reads(local);
  const fetch: typeof globalThis.fetch = (input, init) =>
    (init?.method ?? "GET") === "GET" ? read(input, init) : local(input, init);
  const decks = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-20T00:00:00Z"),
    randomId: () => `r${n++}`,
    userStorages,
  });
  const reviews = createSolidReviewStateRepository({ fetch, randomId: () => `s${n++}` });
  const status = async (url: string) => (await local(url)).status;
  return { local, decks, reviews, status };
}

/** A deck not yet written, as an import of a file makes one: its documents at their default places. */
function fileDeck(from: Deck): Deck {
  return {
    ...from,
    id: "deck-file",
    url: `${INSTANCE}catalog.ttl#deck-file`,
    cardsDocumentUrl: `${INSTANCE}decks/deck-file.ttl`,
    reviewsDocumentUrl: `${INSTANCE}reviews/deck-file.ttl`,
  };
}

/** The cards of a release of `count` cards, each side `side` characters long, as a deck file's import saves them. */
async function cardsOf(p: ReturnType<typeof pod>, count: number, side: number, deck: Deck) {
  const content = release(count);
  const long = {
    ...content,
    cards: content.cards.map((card) => ({
      ...card,
      front: { en: `${card.id} ${"f".repeat(side)}` },
      back: { en: `${card.id} ${"b".repeat(side)}` },
    })),
  };
  const source = await p.decks.importDeck(INSTANCE, long);
  return (await p.decks.listCards(source)).map((card) => ({
    ...card,
    url: `${deck.cardsDocumentUrl}#${card.id}`,
  }));
}

function stateOf(i: number): ReviewState {
  return {
    cardId: `c${i}`,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-11-21",
    firstReviewedAt: "2026-11-20T08:00:00.000Z",
    lastReviewedAt: "2026-11-20T08:00:00.000Z",
    formatVersion: 2,
  };
}

describe("a deck file's import, held to what a read outside the user's storages takes in (GHSA-fxpf-f5hv-cr66)", () => {
  const imported = async (p: ReturnType<typeof pod>, count: number, side: number) => {
    const deck = fileDeck(await p.decks.importDeck(INSTANCE, release(1)));
    const cards = await cardsOf(p, count, side, deck);
    return { deck, cards };
  };
  const write = (
    p: ReturnType<typeof pod>,
    deck: Deck,
    cards: Awaited<ReturnType<typeof cardsOf>>,
  ) =>
    p.decks.applyCardChanges(
      deck,
      { save: cards, remove: [] },
      { whole: true, version: "absent", fromFile: true },
    );

  it("refuses cards with more triples than one read takes in, sending nothing", async () => {
    const p = pod();
    const { deck, cards } = await imported(p, 80, 1);
    await expect(write(p, deck, cards)).rejects.toMatchObject({
      code: "deckFileTooLarge",
      vars: FOREIGN_LIMITS,
    });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
  });

  it("refuses cards of more bytes than one read takes in, before it reads them back", async () => {
    const p = pod();
    const { deck, cards } = await imported(p, 20, 15_000);
    await expect(write(p, deck, cards)).rejects.toMatchObject({ code: "deckFileTooLarge" });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
  });

  it("refuses cards whose Turtle is small enough but whose triples, one a line, are not", async () => {
    const p = pod();
    const { deck, cards } = await imported(p, 30, 1);
    // A long name each card's triples repeat as N-Triples, but its Turtle names once.
    const named = cards.map((card) => {
      const id = `${card.id}${"n".repeat(3_500)}`;
      return { ...card, id, url: `${deck.cardsDocumentUrl}#${id}` };
    });
    await expect(write(p, deck, named)).rejects.toMatchObject({ code: "deckFileTooLarge" });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
    await write(p, deck, cards);
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it("writes cards a read takes in, and the same cards past the limits when not from a file", async () => {
    const p = pod();
    const small = await imported(p, 2, 1);
    await write(p, small.deck, small.cards);
    expect(await p.status(small.deck.cardsDocumentUrl)).toBe(200);
    const large = await imported(p, 80, 1);
    const deck = { ...large.deck, cardsDocumentUrl: `${INSTANCE}decks/deck-other.ttl` };
    await p.decks.applyCardChanges(
      deck,
      {
        save: large.cards.map((card) => ({ ...card, url: `${deck.cardsDocumentUrl}#${card.id}` })),
        remove: [],
      },
      { whole: true, version: "absent" },
    );
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it("refuses a card with more values of one predicate than a read takes in, as a release made of it would be (GHSA-pgv2-87p9-4jmw)", async () => {
    const p = pod();
    const { deck, cards } = await imported(p, 1, 1);
    const front = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`en-x-p${i}`, `f${i}`]));
    const many = cards.map((card) => ({ ...card, front: front(51) }));
    await expect(write(p, deck, many)).rejects.toMatchObject({
      code: "deckFileTooLarge",
      vars: FOREIGN_LIMITS,
    });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(404);
    await write(
      p,
      deck,
      cards.map((card) => ({ ...card, front: front(50) })),
    );
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it("refuses progress too large for one read, sending nothing, and writes what a read takes in", async () => {
    const p = pod();
    const deck = fileDeck(await p.decks.importDeck(INSTANCE, release(1)));
    const many = Array.from({ length: 80 }, (_, i) => stateOf(i));
    await expect(
      p.reviews.applyReviewChanges(deck, { save: many, remove: [], fromFile: true }),
    ).rejects.toMatchObject({ code: "deckFileTooLarge" });
    expect(await p.status(deck.reviewsDocumentUrl)).toBe(404);
    await p.reviews.applyReviewChanges(deck, { save: [stateOf(0)], remove: [], fromFile: true });
    expect(await p.status(deck.reviewsDocumentUrl)).toBe(200);
  });
});

describe("a deck's removal, its own document past the limits of one read (GHSA-fxpf-f5hv-cr66)", () => {
  /** A deck whose cards document holds more triples than FOREIGN_LIMITS take in, at `at` (its default place unless given). */
  async function oversized(p: ReturnType<typeof pod>, at?: string) {
    const deck = await p.decks.importDeck(INSTANCE, release(1));
    const lines = Array.from({ length: 500 }, (_, i) => `<#x${i}> <#p> "${i}" .`);
    const url = at ?? deck.cardsDocumentUrl;
    await put(p.local, url, lines.join("\n"));
    if (at === undefined) return { deck, url };
    const catalog = `${INSTANCE}catalog.ttl`;
    const text = await (await p.local(catalog)).text();
    await put(p.local, catalog, text.split(deck.cardsDocumentUrl).join(url));
    return { deck: { ...deck, cardsDocumentUrl: url }, url };
  }

  it("deletes the deck's own document no read takes in, unread, and removes the deck", async () => {
    const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS));
    const { deck, url } = await oversized(p);
    expect(await p.decks.removeDecks([deck])).toEqual({ keptDocuments: [] });
    expect(await p.status(url)).toBe(404);
    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
  });

  it("counts a document gone before its deletion as removed", async () => {
    const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS));
    const { deck, url } = await oversized(p);
    let deletes = 0;
    const gone = deckRepository(async (input, init) => {
      if (init?.method === "DELETE" && String(input) === url) {
        deletes++;
        await p.local(url, { method: "DELETE" });
        return new Response("gone", { status: 404 });
      }
      return limitedFetch(p.local, FOREIGN_LIMITS)(input, init);
    });
    expect(await gone.removeDecks([deck])).toEqual({ keptDocuments: [] });
    expect(deletes).toBe(1);
    expect(await p.status(url)).toBe(404);
  });

  it("stops before the catalog when the deletion fails, so the removal can be made again", async () => {
    const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS));
    const { deck, url } = await oversized(p);
    const failing = deckRepository(async (input, init) =>
      init?.method === "DELETE" && String(input) === url
        ? new Response("down", { status: 503 })
        : limitedFetch(p.local, FOREIGN_LIMITS)(input, init),
    );
    await expect(failing.removeDecks([deck])).rejects.toMatchObject({ statusCode: 503 });
    expect(await p.status(url)).toBe(200);
    expect((await p.decks.listDecks(INSTANCE)).map(({ id }) => id)).toEqual([deck.id]);
  });

  it("keeps such a document anywhere else in the instance, and names it", async () => {
    const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS));
    const { deck, url } = await oversized(p, `${INSTANCE}decks/shared.ttl`);
    expect(await p.decks.removeDecks([deck])).toEqual({ keptDocuments: [url] });
    expect(await p.status(url)).toBe(200);
  });

  it("leaves such a document alone where a deck whose id holds `..` would keep its own", async () => {
    const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS));
    const { deck } = await oversized(p);
    const catalog = `${INSTANCE}catalog.ttl`;
    const text = await (await p.local(catalog)).text();
    await put(p.local, catalog, text.split(deck.id).join("a..b"));
    const url = `${INSTANCE}decks/a..b.ttl`;
    await put(p.local, url, await (await p.local(deck.cardsDocumentUrl)).text());
    // A deck naming an address with `..` inside a segment is not listed, read or written (GHSA-h78f-3xr9-29w9).
    expect(await p.decks.listDecks(INSTANCE)).toEqual([]);
    const renamed = { ...deck, id: "a..b", url: `${catalog}#a..b`, cardsDocumentUrl: url };
    expect(await p.decks.removeDecks([renamed])).toEqual({ keptDocuments: [] });
    expect(await p.status(url)).toBe(200);
  });

  it("keeps the deck's own document when the read failed for a budget spent, not its size", async () => {
    const budget = { bytes: 0, quads: 0, characters: 0 };
    const big = { bytes: 1e9, quads: 1e9, characters: 1e9 };
    const p = pod();
    const { deck, url } = await oversized(p);
    const spent = sharedReadBudget({ limits: big, budget, rereads: budget })(p.local);
    const reads = deckRepository((input, init) =>
      (init?.method ?? "GET") === "GET" && String(input) === url
        ? spent(input, init)
        : p.local(input, init),
    );
    expect(await reads.removeDecks([deck])).toEqual({ keptDocuments: [url] });
    expect(await p.status(url)).toBe(200);
  });
});

describe("a deck's removal, its own document unread only where an import could leave it (GHSA-59mh-w2h2-hq93)", () => {
  const ROOT = "https://pod.example/";

  /** The deck's cards document, as another app may leave it: saying it is another deck's when `backLinked`, and with one literal of `length` characters. */
  function otherAppsDocument(length: number, backLinked: boolean): string {
    return [
      "@prefix dcterms: <http://purl.org/dc/terms/>.",
      backLinked ? `<> dcterms:isPartOf <${ROOT}other/catalog.ttl#y>.` : "",
      `<#note> <https://notes.example/body> "${"x".repeat(length)}".`,
    ].join("\n");
  }

  /**
   * A pod whose reads of the deck's cards document give `text` (the pod
   * itself takes no term that long), and the deck. The document the pod
   * holds is gone once a removal deletes it.
   */
  async function servingDeck(instance: string, text: string, userStorages: UserStorages) {
    let at = "";
    const p = pod(
      (local) => async (input, init) =>
        String(input) === at
          ? Object.defineProperty(
              new Response(text, {
                headers: { "Content-Type": "text/turtle", ETag: '"served"' },
              }),
              "url",
              { value: at },
            )
          : local(input, init),
      userStorages,
    );
    const deck = await p.decks.importDeck(instance, release(1));
    at = deck.cardsDocumentUrl;
    return { p, deck };
  }

  it.each([
    ["in the user's storage", INSTANCE, false, [ROOT]],
    ["that says it is another deck's", INSTANCE, true, [ROOT]],
    ["of an instance at a storage's root", ROOT, false, []],
    ["outside the user's storages", INSTANCE, false, []],
  ])(
    "keeps a document with a term longer than any read takes in, %s, and names it",
    async (_, instance, backLinked, storages) => {
      const { p, deck } = await servingDeck(
        instance,
        otherAppsDocument(17_000, backLinked),
        async () => storages,
      );
      expect(await p.decks.removeDecks([deck])).toEqual({
        keptDocuments: [deck.cardsDocumentUrl],
      });
      expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
      expect(await p.decks.listDecks(instance)).toEqual([]);
    },
  );

  it("leaves alone, as before, such a document a read takes in that says it is another deck's", async () => {
    const { p, deck } = await servingDeck(INSTANCE, otherAppsDocument(100, true), async () => [
      ROOT,
    ]);
    expect(await p.decks.removeDecks([deck])).toEqual({ keptDocuments: [] });
    expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
  });

  it.each([
    ["in the user's storage", INSTANCE, async () => [ROOT]],
    ["of an instance at a storage's root", ROOT, async () => []],
    [
      "when the user's storages cannot be had",
      INSTANCE,
      async (): Promise<string[]> => {
        throw new Error("profile down");
      },
    ],
  ])(
    "keeps a document larger than a read takes in, %s, and names it",
    async (_, instance, storages) => {
      const p = pod((local) => limitedFetch(local, FOREIGN_LIMITS), storages);
      const deck = await p.decks.importDeck(instance, release(1));
      const lines = Array.from({ length: 500 }, (_, i) => `<#x${i}> <#p> "${i}" .`);
      await put(p.local, deck.cardsDocumentUrl, lines.join("\n"));
      expect(await p.decks.removeDecks([deck])).toEqual({
        keptDocuments: [deck.cardsDocumentUrl],
      });
      expect(await p.status(deck.cardsDocumentUrl)).toBe(200);
    },
  );
});
