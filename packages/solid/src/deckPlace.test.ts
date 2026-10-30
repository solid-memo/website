// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { createDeckDocumentGuard } from "./deckPlace";
import { deleteInstanceData } from "./instanceData";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";

const ROOT = "https://pod.example/";
const BOB = `${ROOT}bob/solid-memo/main/`;
const ALICE = `${ROOT}alice/solid-memo/main/`;
const CARD = `${ROOT}alice/profile/card`;
const DIARY = `${ROOT}alice/private/diary.ttl`;
const PROFILE = `<#me> a <http://xmlns.com/foaf/0.1/Person> .`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
const UNO = { front: { "": "uno" }, back: { "": "one" } };
const DOS = { front: { "": "dos" }, back: { "": "two" } };

/**
 * Bob's instance and Alice's documents on one server, in memory. Each
 * address is resolved as a browser's fetch resolves it before the
 * request leaves (dot segments, `%2e%2e` too, removed), and every write
 * is recorded where it really went, with the version it was made on
 * (If-Match), if any.
 */
async function pod() {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
  const writes: string[] = [];
  const conditions: (string | null)[] = [];
  const fetch = (async (input, init) => {
    const url = new Request(String(input instanceof Request ? input.url : input)).url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      writes.push(`${method} ${url}`);
      conditions.push(new Headers(init?.headers).get("If-Match"));
    }
    return local(url, init);
  }) as typeof globalThis.fetch;
  const put = async (url: string, body: string) => {
    const response = await local(url, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body,
    });
    expect(response.ok).toBe(true);
  };
  await put(CARD, PROFILE);
  await put(DIARY, `<#entry> <https://example.org/says> "secret" .`);
  let ids = 0;
  const decks = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-19T00:00:00.000Z"),
    randomId: () => `id${++ids}`,
  });
  const reviews = createSolidReviewStateRepository({ fetch });
  const text = async (url: string) => (await local(url)).text();
  return {
    local,
    fetch,
    put,
    writes,
    conditions,
    decks,
    reviews,
    text,
    urls: () => store.urls(),
  };
}
type Pod = Awaited<ReturnType<typeof pod>>;

/** The instance's catalog with the deck's documents named elsewhere: every `<from>` written `<to>`. */
async function plant(p: Pod, deck: Deck, cards: string, reviews: string, instance = BOB) {
  const catalog = `${instance}catalog.ttl`;
  const turtle = (await p.text(catalog))
    .replaceAll(`<${deck.cardsDocumentUrl}>`, `<${cards}>`)
    .replaceAll(`<decks/${deck.id}.ttl>`, `<${cards}>`)
    .replaceAll(`<${deck.reviewsDocumentUrl}>`, `<${reviews}>`)
    .replaceAll(`<reviews/${deck.id}.ttl>`, `<${reviews}>`);
  await p.put(catalog, turtle);
}

/** A deck's document, with its cards or states as Turtle, that says it is the deck's, or (`linked` false) does not. */
function deckDocument(deck: Deck, turtle: string, linked = true): string {
  return `${linked ? `<> <${IS_PART_OF}> <${deck.url}> .\n` : ""}${turtle}`;
}

/** A card in this app's format, as Turtle. */
function cardTurtle(id: string, front: string): string {
  return `<#${id}> a <${SM}Card> ; <${SM}front> "${front}" ; <${SM}back> "x" ; <${SM}formatVersion> 6 ; <http://purl.org/dc/terms/created> "2026-10-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`;
}

/** How often the document says it is the deck's. */
async function backLinks(p: Pod, url: string, deck: Deck): Promise<number> {
  return (await p.text(url)).split(`<${deck.url}>`).length - 1;
}

const UNSAFE = [
  [
    "dot segments",
    `${BOB}decks/../../../../alice/profile/card`,
    `${BOB}reviews/../../../../alice/private/diary.ttl`,
  ],
  [
    "encoded dot segments",
    `${BOB}%2e%2e/%2E%2e/.%2e/alice/profile/card`,
    `${BOB}decks/%2e%2e/%2e%2e/%2e%2e/%2e%2e/alice/private/diary.ttl`,
  ],
] as const;

describe("a deck the catalog names at an address no deck's may have", () => {
  for (const [label, cards, reviews] of UNSAFE) {
    it(`is not listed, and removing the deck it was removes its entry and nothing else: ${label}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
      await plant(p, deck, cards, reviews);
      expect(await p.decks.listDecks(BOB)).toEqual([]);
      await expect(p.decks.readDeck(deck.url)).resolves.toBeNull();
      expect((await p.decks.readDeckTree(BOB)).children).toEqual([]);

      // The deck as it was listed before the catalog changed, or as the catalog names it now.
      p.writes.length = 0;
      await p.decks.removeDeck({ ...deck, cardsDocumentUrl: cards, reviewsDocumentUrl: reviews });
      expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
      expect(await p.text(`${BOB}catalog.ttl`)).not.toContain("#deck-");
      expect(await p.urls()).toEqual(expect.arrayContaining([CARD, DIARY]));
    });

    it(`is never written through: ${label}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
      const card = await p.decks.addCard(deck, UNO);
      const there: Deck = { ...deck, cardsDocumentUrl: cards, reviewsDocumentUrl: reviews };
      p.writes.length = 0;
      const gone = { code: "deckGone", vars: { deck: deck.title } };
      await expect(p.decks.addCard(there, DOS)).rejects.toMatchObject(gone);
      await expect(p.decks.removeCard(there, card)).rejects.toMatchObject(gone);
      await expect(
        p.reviews.createReviewStates(there, { sm2: [], fsrs: [] }),
      ).rejects.toMatchObject(gone);
      await expect(p.decks.unclaimedDocuments(there)).resolves.toEqual([]);
      await expect(p.decks.claimDocuments(there)).resolves.toBeUndefined();
      expect(p.writes).toEqual([]);
      expect(await p.text(CARD)).toBe(await (await pod()).text(CARD));
    });
  }

  it("is held to the instance whose catalog lists it, not one it names itself", async () => {
    const p = await pod();
    const own = await p.decks.createDeck(ALICE, { en: "Alice's" });
    await p.decks.createDeck(BOB, { en: "Bob's" });
    // Bob's catalog states an entry of Alice's catalog, with her deck's documents.
    await p.put(
      `${BOB}catalog.ttl`,
      `${await p.text(`${BOB}catalog.ttl`)}
<${own.url}> a <${SM}Deck> ; <${SM}cardsDocument> <${own.cardsDocumentUrl}> ; <${SM}reviewsDocument> <${own.reviewsDocumentUrl}> .`,
    );
    expect((await p.decks.listDecks(BOB)).map((deck) => deck.title)).toEqual([{ en: "Bob's" }]);
    expect((await p.decks.listDecks(ALICE)).map((deck) => deck.url)).toEqual([own.url]);
  });
});

describe("a deck the catalog names another of the instance's resources for", () => {
  const OTHERS = [
    [
      "another deck's access control",
      (a: Deck) => `${a.cardsDocumentUrl}.acl`,
      (a: Deck) => `${a.reviewsDocumentUrl}.acl`,
    ],
    [
      "another deck's metadata",
      (a: Deck) => `${a.cardsDocumentUrl}.meta`,
      (a: Deck) => `${a.reviewsDocumentUrl}.acr`,
    ],
    [
      "another deck's documents by an empty segment",
      (a: Deck) => `${BOB}decks//${a.id}.ttl`,
      (a: Deck) => `${BOB}reviews//${a.id}.ttl`,
    ],
    ["the instance's own documents", () => `${BOB}meta.ttl`, () => `${BOB}preferences.ttl`],
  ] as const;

  for (const [label, cardsOf, reviewsOf] of OTHERS) {
    it(`is not listed, written through, nor removed with them: ${label}`, async () => {
      const p = await pod();
      const a = await p.decks.createDeck(BOB, { en: "Spanish" });
      await p.decks.addCard(a, UNO);
      const b = await p.decks.createDeck(BOB, { en: "Korean" });
      const cards = cardsOf(a);
      const reviews = reviewsOf(a);
      await plant(p, b, cards, reviews);
      expect((await p.decks.listDecks(BOB)).map((deck) => deck.url)).toEqual([a.url]);

      const there: Deck = { ...b, cardsDocumentUrl: cards, reviewsDocumentUrl: reviews };
      const before = await p.text(a.cardsDocumentUrl);
      p.writes.length = 0;
      const gone = { code: "deckGone", vars: { deck: b.title } };
      await expect(p.decks.addCard(there, DOS)).rejects.toMatchObject(gone);
      await expect(
        p.reviews.createReviewStates(there, { sm2: [], fsrs: [] }),
      ).rejects.toMatchObject(gone);
      expect(p.writes).toEqual([]);

      await p.decks.removeDeck(there);
      expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
      expect(await p.text(a.cardsDocumentUrl)).toBe(before);
      expect((await p.decks.listDecks(BOB)).map((deck) => deck.url)).toEqual([a.url]);
    });
  }
});

describe("a deck whose documents do not say they are its own", () => {
  it("is read, but never written to or deleted through, when they are another's: the profile, another pod's", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const card = await p.decks.addCard(deck, UNO);
    await plant(p, deck, CARD, DIARY);
    const [listed] = await p.decks.listDecks(BOB);
    expect(listed).toMatchObject({ cardsDocumentUrl: CARD, reviewsDocumentUrl: DIARY });
    await expect(p.decks.listCards(listed!)).resolves.toEqual([]);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([CARD, DIARY]);

    p.writes.length = 0;
    const unclaimed = { code: "deckDocumentUnclaimed", vars: { deck: deck.title } };
    await expect(p.decks.addCard(listed!, DOS)).rejects.toMatchObject(unclaimed);
    await expect(p.decks.removeCard(listed!, card)).rejects.toMatchObject(unclaimed);
    await expect(
      p.reviews.createReviewStates(listed!, { sm2: [], fsrs: [] }),
    ).rejects.toMatchObject(unclaimed);
    await expect(
      p.reviews.applyReviewChanges(listed!, {
        save: [],
        remove: [{ cardId: "me", direction: "front-to-back" }],
      }),
    ).rejects.toMatchObject(unclaimed);
    expect(p.writes).toEqual([]);

    // Removing the deck removes its entry, and neither document.
    await p.decks.removeDeck(listed!);
    expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
    expect(await p.text(CARD)).toBe(await (await pod()).text(CARD));
    expect(await p.urls()).toEqual(expect.arrayContaining([CARD, DIARY]));
  });

  it("counts one that cannot be read as RDF as unclaimed, and leads no write there", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const picture = `${ROOT}alice/photos/cat.png`;
    await p.local(picture, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: "not RDF",
    });
    await plant(p, deck, picture, DIARY);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([picture, DIARY]);
    p.writes.length = 0;
    await expect(p.decks.addCard(listed!, DOS)).rejects.toThrow();
    expect(p.writes).toEqual([]);
    await p.decks.removeDeck(listed!);
    expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
    expect(await p.urls()).toContain(picture);
  });

  it("is refused when they say they are another instance's deck's", async () => {
    const p = await pod();
    const alices = await p.decks.createDeck(ALICE, { en: "Alice's" });
    await p.decks.addCard(alices, UNO);
    await p.reviews.createReviewStates(alices, { sm2: [], fsrs: [] });
    const deck = await p.decks.createDeck(BOB, { en: "Bob's" });
    await plant(p, deck, alices.cardsDocumentUrl, alices.reviewsDocumentUrl);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.listCards(listed!)).resolves.toHaveLength(1);
    const before = await p.text(alices.cardsDocumentUrl);

    p.writes.length = 0;
    await expect(p.decks.addCard(listed!, DOS)).rejects.toMatchObject({
      code: "deckDocumentUnclaimed",
    });
    await p.decks.removeDeck(listed!);
    expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
    expect(await p.text(alices.cardsDocumentUrl)).toBe(before);
    expect(await backLinks(p, alices.cardsDocumentUrl, alices)).toBe(1);
  });

  it("in the instance's folder, is refused when they say they are an instance's deck's that is nested in it", async () => {
    const p = await pod();
    const nested = `${BOB}nested/`;
    const inner = await p.decks.createDeck(nested, { en: "Inner" });
    await p.decks.addCard(inner, UNO);
    await p.reviews.createReviewStates(inner, { sm2: [], fsrs: [] });
    const deck = await p.decks.createDeck(BOB, { en: "Bob's" });
    await plant(p, deck, inner.cardsDocumentUrl, inner.reviewsDocumentUrl);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.listCards(listed!)).resolves.toHaveLength(1);
    // In the instance's own folder, not read for the data check: refused on a write instead.
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([]);
    const cards = await p.text(inner.cardsDocumentUrl);
    const reviews = await p.text(inner.reviewsDocumentUrl);

    p.writes.length = 0;
    const unclaimed = { code: "deckDocumentUnclaimed", vars: { deck: deck.title } };
    await expect(p.decks.addCard(listed!, DOS)).rejects.toMatchObject(unclaimed);
    await expect(
      p.reviews.applyReviewChanges(listed!, {
        save: [],
        remove: [{ cardId: "card-id2", direction: "front-to-back" }],
      }),
    ).rejects.toMatchObject(unclaimed);
    expect(p.writes).toEqual([]);

    // Deleting the outer instance leaves the inner one's documents as they were.
    await deleteInstanceData(BOB, p.fetch);
    expect(p.writes.filter((write) => write.includes(nested))).toEqual([]);
    expect(await p.text(inner.cardsDocumentUrl)).toBe(cards);
    expect(await p.text(inner.reviewsDocumentUrl)).toBe(reviews);
    expect((await p.decks.listCards(inner)).map((card) => card.id)).toEqual(["card-id2"]);

    // And removing the deck, its entry only.
    const again = await p.decks.createDeck(BOB, { en: "Bob's" });
    await plant(p, again, inner.cardsDocumentUrl, inner.reviewsDocumentUrl);
    const [relisted] = await p.decks.listDecks(BOB);
    p.writes.length = 0;
    await p.decks.removeDeck(relisted!);
    expect(p.writes).toEqual([`PATCH ${BOB}catalog.ttl`]);
    expect(await p.text(inner.cardsDocumentUrl)).toBe(cards);
  });

  it("saying it is two decks', keeps the other's cards when one goes, taking out only its saying it is its", async () => {
    const p = await pod();
    const nested = `${BOB}nested/`;
    const inner = await p.decks.createDeck(nested, { en: "Inner" });
    await p.decks.addCard(inner, UNO);
    await p.reviews.createReviewStates(inner, { sm2: [], fsrs: [] });
    const deck = await p.decks.createDeck(BOB, { en: "Bob's" });
    await plant(p, deck, inner.cardsDocumentUrl, inner.reviewsDocumentUrl);
    // Both documents say they are the outer deck's too (as an earlier version, or another app, left them).
    const alsoOf = async (outer: Deck) => {
      for (const url of [inner.cardsDocumentUrl, inner.reviewsDocumentUrl]) {
        await p.put(url, `${await p.text(url)}\n<${url}> <${IS_PART_OF}> <${outer.url}> .`);
      }
    };
    await alsoOf(deck);
    const [listed] = await p.decks.listDecks(BOB);
    expect(await backLinks(p, inner.cardsDocumentUrl, deck)).toBe(1);
    await p.decks.addCard(listed!, DOS);

    await expect(p.decks.removeDeck(listed!)).resolves.toEqual({
      keptDocuments: [inner.cardsDocumentUrl, inner.reviewsDocumentUrl],
    });
    expect(await backLinks(p, inner.cardsDocumentUrl, deck)).toBe(0);
    expect(await backLinks(p, inner.cardsDocumentUrl, inner)).toBe(1);
    expect(await backLinks(p, inner.reviewsDocumentUrl, deck)).toBe(0);
    expect((await p.decks.listCards(inner)).map((card) => card.id).sort()).toEqual([
      "card-id2",
      "card-id4",
    ]);

    // Deleting the outer instance, its deck named in them again, does the same.
    const again = await p.decks.createDeck(BOB, { en: "Bob's" });
    await plant(p, again, inner.cardsDocumentUrl, inner.reviewsDocumentUrl);
    await alsoOf(again);
    const result = await deleteInstanceData(BOB, p.fetch);
    expect(result.keptDocuments).toEqual(
      expect.arrayContaining([inner.cardsDocumentUrl, inner.reviewsDocumentUrl]),
    );
    expect(await backLinks(p, inner.cardsDocumentUrl, again)).toBe(0);
    expect(await backLinks(p, inner.cardsDocumentUrl, inner)).toBe(1);
    expect(await p.decks.listCards(inner)).toHaveLength(2);
    await expect(p.decks.unclaimedDocuments(inner)).resolves.toEqual([]);
  });

  it("in renamed folders of the instance's own folder (kort/, answers/), says so on its next write", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const cards = `${BOB}kort/spanska.ttl`;
    const reviews = `${BOB}answers/spanska.ttl`;
    await p.put(cards, deckDocument(deck, cardTurtle("card-1", "uno"), false));
    await p.put(reviews, "");
    await plant(p, deck, cards, reviews);
    const [listed] = await p.decks.listDecks(BOB);
    expect((await p.decks.listCards(listed!)).map((card) => card.id)).toEqual(["card-1"]);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([]);

    await p.decks.addCard(listed!, DOS);
    await p.reviews.applyReviewChanges(listed!, {
      save: [],
      remove: [],
      fsrs: { save: [], remove: [] },
    });
    expect(await backLinks(p, cards, deck)).toBe(1);
    expect((await p.decks.listCards(listed!)).map((card) => card.id).sort()).toEqual([
      "card-1",
      "card-id2",
    ]);

    // Removing the deck deletes both: they are its own now.
    await p.decks.removeDeck(listed!);
    expect(await p.urls()).not.toContain(cards);
  });

  it("removes a card's states when its cards document is gone, saying the reviews document is the deck's", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const card = await p.decks.addCard(deck, UNO);
    await p.reviews.createReviewStates(deck, { sm2: [], fsrs: [] });
    await p.local(deck.cardsDocumentUrl, { method: "DELETE" });
    p.writes.length = 0;
    await p.decks.removeCard(deck, card);
    expect(p.writes).toEqual([`PATCH ${deck.reviewsDocumentUrl}`]);
    expect(await backLinks(p, deck.reviewsDocumentUrl, deck)).toBe(1);
  });

  it("anywhere else, is written to once the user claims them: one write each, on the version read", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const cards = `${ROOT}bob/kort/spanska.ttl`;
    const reviews = `${ROOT}bob/answers/spanska.ttl`;
    await p.put(cards, deckDocument(deck, cardTurtle("card-1", "uno"), false));
    await plant(p, deck, cards, reviews);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([cards, reviews]);

    p.writes.length = 0;
    p.conditions.length = 0;
    await p.decks.claimDocuments(listed!);
    expect(p.writes).toEqual([`PATCH ${cards}`, `PUT ${reviews}`]);
    // The cards on the version read; the reviews document made only where there was none.
    expect(p.conditions[0]).toMatch(/^"e\d+"$/);
    expect(await backLinks(p, cards, deck)).toBe(1);
    expect(await backLinks(p, reviews, deck)).toBe(1);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([]);

    // Claimed once: claiming again sends nothing, and writes work, the link stated once.
    p.writes.length = 0;
    await p.decks.claimDocuments(listed!);
    expect(p.writes).toEqual([]);
    await p.decks.addCard(listed!, DOS);
    expect(await backLinks(p, cards, deck)).toBe(1);
    expect((await p.decks.listCards(listed!)).map((card) => card.id).sort()).toEqual([
      "card-1",
      "card-id2",
    ]);
  });

  it("is written to wherever it is when it says it is the deck's", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const cards = `${ROOT}carol/shared/spanish`;
    await p.put(cards, deckDocument(deck, cardTurtle("card-1", "uno")));
    await plant(p, deck, cards, `${BOB}reviews/${deck.id}.ttl`);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([]);
    await p.decks.addCard(listed!, DOS);
    expect(await backLinks(p, cards, deck)).toBe(1);
    await p.decks.removeDeck(listed!);
    expect(await p.urls()).not.toContain(cards);
  });
});

describe("a deck whose document is a deck itself: a release", () => {
  it("is read, but never written to, claimed or deleted through, though it says it is the deck's", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    await p.decks.addCard(deck, UNO);
    const release = `${ALICE}releases/spanish-v2.ttl`;
    await p.put(release, deckDocument(deck, `<> a <${SM}Deck> .`));
    await plant(p, deck, deck.cardsDocumentUrl, release);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([release]);
    const before = await p.text(release);

    p.writes.length = 0;
    await expect(
      p.reviews.createReviewStates(listed!, { sm2: [], fsrs: [] }),
    ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
    await p.decks.claimDocuments(listed!);
    await p.decks.removeDeck(listed!);
    expect(p.writes.filter((write) => write.endsWith(release))).toEqual([]);
    expect(await p.text(release)).toBe(before);
  });
});

describe("a deck whose document is one of a draft's, as a draft made from a release may hold", () => {
  for (const name of ["release.ttl", "cards.ttl", "chapter-intro.ttl"]) {
    it(`is read, but never written to, claimed or deleted through, though it says it is the deck's: ${name}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
      await p.decks.addCard(deck, UNO);
      const container = `${ALICE}drafts/spanish/v2/`;
      await p.put(`${container}release.ttl`, `<> a <${SM}Deck> .`);
      const document = `${container}${name}`;
      if (name !== "release.ttl")
        await p.put(document, deckDocument(deck, cardTurtle("q1", "uno")));
      await plant(p, deck, deck.cardsDocumentUrl, document);
      const [listed] = await p.decks.listDecks(BOB);
      await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([document]);
      const before = await p.text(document);

      p.writes.length = 0;
      await expect(
        p.reviews.createReviewStates(listed!, { sm2: [], fsrs: [] }),
      ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
      await p.decks.claimDocuments(listed!);
      await p.decks.removeDeck(listed!);
      expect(p.writes.filter((write) => write.endsWith(document))).toEqual([]);
      expect(await p.text(document)).toBe(before);
    });
  }

  it("is one however its address is spelled, and an address that is none is no draft's", async () => {
    const p = await pod();
    const guard = createDeckDocumentGuard(p.fetch);
    const deck = {
      url: `${ALICE}catalog.ttl#deck-1`,
      title: { en: "Spanish" },
      cardsDocumentUrl: `${ALICE}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${ALICE}reviews/deck-1.ttl`,
    };
    for (const url of [
      `${ALICE}drafts/spanish/v2/c%61rds.ttl`,
      `https://POD.example:443/alice/solid-memo/main/drafts/spanish/v2/chapter-intro.ttl`,
      `${ALICE}%E0%A4%A/drafts/spanish/v2/cards.ttl`,
    ])
      await expect(guard.standing(deck, url, null)).resolves.toBe("unclaimed");
    await expect(guard.standing(deck, `${ALICE}drafts/spanish/v2/notes.ttl`, null)).resolves.toBe(
      "adoptable",
    );
    await expect(guard.standing(deck, "no address", null)).resolves.toBe("unclaimed");
  });
});

describe("removing a deck whose document holds another app's data too", () => {
  it("takes out only the deck's cards and its saying it is the deck's, keeps the document, and names it", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(BOB, { en: "Spanish" });
    const cards = `${ROOT}carol/shared/spanish`;
    await p.put(
      cards,
      deckDocument(
        deck,
        `${cardTurtle("card-1", "uno")}\n<#recipe> <https://other.example/says> "kept" .`,
      ),
    );
    await plant(p, deck, cards, `${BOB}reviews/${deck.id}.ttl`);
    const [listed] = await p.decks.listDecks(BOB);
    await expect(p.decks.removeDeck(listed!)).resolves.toEqual({ keptDocuments: [cards] });
    const left = await p.text(cards);
    expect(left).toContain("https://other.example/says");
    expect(left).not.toContain(SM);
    expect(await backLinks(p, cards, deck)).toBe(0);
    await expect(p.decks.listDecks(BOB)).resolves.toEqual([]);
  });
});

describe("deleting an instance", () => {
  it("deletes a deck's documents that say they are its own, wherever they are, and keeps unclaimed ones", async () => {
    const p = await pod();
    const claimed = await p.decks.createDeck(BOB, { en: "Spanish" });
    const unclaimed = await p.decks.createDeck(BOB, { en: "Korean" });
    const kort = `${ROOT}bob/kort/spanish.ttl`;
    await p.put(kort, deckDocument(claimed, cardTurtle("card-1", "uno")));
    await plant(p, claimed, kort, `${BOB}reviews/${claimed.id}.ttl`);
    const older = `${ROOT}bob/kort/korean.ttl`;
    await p.put(older, deckDocument(unclaimed, cardTurtle("card-1", "hana"), false));
    await plant(p, unclaimed, older, CARD);
    await deleteInstanceData(BOB, p.fetch);
    const urls = await p.urls();
    expect(urls).not.toContain(kort);
    expect(urls).toEqual(expect.arrayContaining([older, CARD, DIARY]));
  });
});

describe("an instance at the pod's root, laid out flat", () => {
  it("reads, writes and removes its decks, its documents named freely", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(ROOT, { en: "Spanish" });
    const card = await p.decks.addCard(deck, UNO);
    expect(await backLinks(p, deck.cardsDocumentUrl, deck)).toBe(1);
    await p.reviews.createReviewStates(deck, { sm2: [], fsrs: [] });
    expect(await backLinks(p, deck.reviewsDocumentUrl, deck)).toBe(1);

    // Moved to the root, renamed, with the catalog's links changed: the back-link moves with them.
    const cards = `${ROOT}spanish-cards.ttl`;
    const reviews = `${ROOT}spanish-reviews.ttl`;
    const moved = async (from: string, to: string) =>
      p.put(to, (await p.text(from)).replaceAll(`<${from}>`, `<${to}>`));
    await moved(deck.cardsDocumentUrl, cards);
    await moved(deck.reviewsDocumentUrl, reviews);
    await plant(p, deck, cards, reviews, ROOT);
    const [listed] = await p.decks.listDecks(ROOT);
    expect(listed).toMatchObject({ cardsDocumentUrl: cards, reviewsDocumentUrl: reviews });
    expect((await p.decks.listCards(listed!)).map((one) => one.id)).toEqual([card.id]);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([]);
    await p.decks.addCard(listed!, DOS);
    await p.decks.removeDeck(listed!);
    expect(await p.urls()).not.toContain(cards);
    expect(await p.urls()).not.toContain(reviews);
    expect(await p.urls()).toEqual(expect.arrayContaining([CARD, DIARY]));
  });

  it("never marks an older document as a deck's by itself, as the root holds the user's other data too", async () => {
    const p = await pod();
    const deck = await p.decks.createDeck(ROOT, { en: "Spanish" });
    const cards = `${ROOT}spanish.ttl`;
    await p.put(cards, deckDocument(deck, cardTurtle("card-1", "uno"), false));
    await plant(p, deck, cards, `${ROOT}reviews/${deck.id}.ttl`, ROOT);
    const [listed] = await p.decks.listDecks(ROOT);
    await expect(p.decks.listCards(listed!)).resolves.toHaveLength(1);
    await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([cards]);

    p.writes.length = 0;
    await expect(p.decks.addCard(listed!, DOS)).rejects.toMatchObject({
      code: "deckDocumentUnclaimed",
    });
    await p.decks.removeDeck(listed!);
    expect(p.writes).toEqual([`PATCH ${ROOT}catalog.ttl`]);
    expect(await p.urls()).toContain(cards);
  });

  for (const spelled of ["https://POD.example/", "https://pod.example:443/"]) {
    it(`never writes to an older document or the profile the catalog spells otherwise: ${spelled}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(ROOT, { en: "Spanish" });
      const cards = `${ROOT}spanish.ttl`;
      await p.put(cards, deckDocument(deck, cardTurtle("card-1", "uno"), false));
      const other = (url: string) => url.replace(ROOT, spelled);
      await plant(p, deck, other(cards), other(CARD), ROOT);
      const [listed] = await p.decks.listDecks(ROOT);
      await expect(p.decks.unclaimedDocuments(listed!)).resolves.toEqual([
        other(cards),
        other(CARD),
      ]);

      p.writes.length = 0;
      await expect(p.decks.addCard(listed!, DOS)).rejects.toMatchObject({
        code: "deckDocumentUnclaimed",
      });
      await expect(
        p.reviews.applyReviewChanges(listed!, {
          save: [],
          remove: [{ cardId: "card-1", direction: "front-to-back" }],
        }),
      ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
      expect(p.writes).toEqual([]);
    });
  }

  it("is not its own folder at a storage's root, and asks again a folder that did not answer", async () => {
    const p = await pod();
    const at = (instance: string) => ({
      url: `${instance}catalog.ttl#deck-1`,
      title: { en: "Spanish" },
      cardsDocumentUrl: `${instance}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instance}reviews/deck-1.ttl`,
    });
    await p.put(`${ROOT}bob/decks/deck-1.ttl`, "");
    const storage = (async (input, init) =>
      String(input) === `${ROOT}bob/`
        ? new Response(null, {
            headers: { Link: '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' },
          })
        : p.fetch(input, init)) as typeof globalThis.fetch;
    await expect(createDeckDocumentGuard(storage).unclaimed(at(`${ROOT}bob/`))).resolves.toEqual([
      `${ROOT}bob/decks/deck-1.ttl`,
    ]);
    let asked = 0;
    const offline = createDeckDocumentGuard((async () => {
      asked += 1;
      throw new Error("offline");
    }) as typeof globalThis.fetch);
    await expect(offline.unclaimed(at(BOB))).rejects.toThrow("offline");
    await expect(offline.unclaimed(at(BOB))).rejects.toThrow("offline");
    expect(asked).toBe(2);

    // A folder that answers 503 once is asked again, not kept as another's: its document is the deck's to mark.
    await p.put(`${BOB}decks/deck-1.ttl`, "");
    let heads = 0;
    const busy = createDeckDocumentGuard((async (input, init) => {
      if (String(input) === BOB && init?.method === "HEAD" && ++heads === 1)
        return new Response(null, { status: 503 });
      return p.fetch(input, init);
    }) as typeof globalThis.fetch);
    await expect(busy.unclaimed(at(BOB))).rejects.toMatchObject({
      code: "cannotCheck",
      vars: { url: BOB, status: 503 },
    });
    await expect(busy.unclaimed(at(BOB))).resolves.toEqual([]);
    expect(heads).toBe(2);
  });
});

describe("an instance whose address is spelled otherwise than a request sends it", () => {
  for (const instance of [
    `${ROOT}bob/kortlekar-å/`,
    `${ROOT}bob/한국어/`,
    "https://Pod.Example/bob/solid-memo/main/",
    "https://pod.example:443/bob/solid-memo/main/",
  ]) {
    it(`lists, removes and deletes its decks: ${instance}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(instance, { en: "Spanish" });
      await p.decks.addCard(deck, UNO);
      expect((await p.decks.listDecks(instance)).map((one) => one.url)).toEqual([deck.url]);
      await expect(p.decks.readDeck(deck.url)).resolves.toMatchObject({ url: deck.url });
      const second = await p.decks.createDeck(instance, { en: "Korean" });
      await p.decks.addCard(second, UNO);
      const sent = (url: string) => new Request(url).url;
      expect(await p.urls()).toEqual(expect.arrayContaining([sent(deck.cardsDocumentUrl)]));
      // An edit of a document read is made on the version read, however its address is spelled.
      p.writes.length = 0;
      p.conditions.length = 0;
      await p.decks.addCard(deck, DOS);
      expect(p.writes).toEqual([`PATCH ${sent(deck.cardsDocumentUrl)}`]);
      expect(p.conditions).toEqual([expect.stringMatching(/^"e\d+"$/)]);

      p.writes.length = 0;
      await p.decks.removeDeck(deck);
      // Its reviews document was never written: there is none to delete.
      expect(p.writes).toEqual([
        `DELETE ${sent(deck.cardsDocumentUrl)}`,
        `PATCH ${sent(`${instance}catalog.ttl`)}`,
      ]);
      expect(await p.urls()).not.toContain(sent(deck.cardsDocumentUrl));

      await deleteInstanceData(instance, p.fetch);
      expect(await p.urls()).not.toContain(sent(second.cardsDocumentUrl));
      expect(await p.urls()).toEqual(expect.arrayContaining([CARD, DIARY]));
    });

    it(`keeps a listed deck's cards and progress where they were written: ${instance}`, async () => {
      const p = await pod();
      const deck = await p.decks.createDeck(instance, { en: "Spanish" });
      const card = await p.decks.addCard(deck, UNO);
      await p.decks.addCard(deck, DOS);
      const key = { cardId: card.id, direction: "front-to-back" } as const;
      const grade = ({ sm2 }: { sm2: ReviewState | null }) => ({
        sm2: {
          ...key,
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: (sm2?.repetitions ?? 0) + 1,
          due: "2026-10-20",
          firstReviewedAt: "2026-10-19T00:00:00.000Z",
          lastReviewedAt: "2026-10-19T00:00:00.000Z",
          formatVersion: 3,
        },
      });
      await p.reviews.gradeReviewState(deck, key, grade);
      const [listed] = await p.decks.listDecks(instance);
      await p.reviews.gradeReviewState(listed!, key, grade);
      const states = await p.reviews.listReviewStates(listed!);
      expect(states.sm2.map((one) => one.repetitions)).toEqual([2]);

      const archive = createSolidDeckArchive({ fetch: p.fetch });
      const file = await archive.exportDeck(listed!, { format: "turtle", withProgress: true });
      const read = await archive.readDeckFile(file, "turtle", "https://example.org/deck");
      expect(read.cards).toHaveLength(2);
      expect(read.reviews).toHaveLength(1);
      expect(read.dropped).toEqual([]);
    });
  }
});
