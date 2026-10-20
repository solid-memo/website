// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Where an instance's documents are, against a real Solid server
 * (docs/data-model.md "Where an instance's documents are"): a deck's
 * documents are read wherever its catalog entry names them, and written
 * to or deleted only when they say they are the deck's. A catalog that
 * names another user's documents leads no write or delete there; one
 * that names them by an address that climbs out of the instance (`..`,
 * `%2e%2e`) leads no read either: the deck is not listed and the
 * instance check names its entry. Removing the deck the user had
 * removes only its entry, and deleting the instance deletes nothing
 * outside it. A pod laid out flat, the instance at its root, works, an
 * older document there claimed once. Node's fetch resolves an address as
 * a browser's does before the request leaves, so the server sees where
 * each request really goes.
 */
import { DataFactory, Parser, Writer } from "n3";
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { instanceAddressOf } from "@solid-memo/domain/instanceLayout";
import { deleteInstanceData } from "@solid-memo/solid/instanceData";
import { hasStorageLink } from "@solid-memo/solid/solidStorageGateway";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";

const SERVERS = inject("solidServers");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body,
  });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

/** A GET's status: Solid-Nextcloud answers a HEAD with 204, whether the document is there or not. */
async function status(url: string): Promise<number> {
  return (await fetch(url)).status;
}

/**
 * Two users' folders on one server, as pods of one host are: Alice's
 * profile and a private document, and Bob's instance with one deck,
 * whose catalog then names Alice's documents as the deck's, spelled
 * `spell(instance, document)`. Every request is recorded where it went.
 */
async function seed(server: string, spell: (instance: string, path: string) => string) {
  const base = new URL(`place-${crypto.randomUUID()}/`, server).href;
  const alice = { card: `${base}alice/profile/card`, diary: `${base}alice/private/diary.ttl` };
  await put(alice.card, `<#me> a <http://xmlns.com/foaf/0.1/Person> .`);
  await put(alice.diary, `<#entry> <https://example.org/says> "secret" .`);
  const instance = `${base}bob/solid-memo/main/`;
  await put(`${instance}meta.ttl`, `<#it> a <${SM}Instance> .`);
  const requests: string[] = [];
  const recording = (async (input, init) => {
    const response = await fetch(input, init);
    requests.push(`${init?.method ?? "GET"} ${response.url || String(input)}`);
    return response;
  }) as typeof globalThis.fetch;
  const decks = createSolidDeckRepository({
    fetch: recording,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  });
  const deck = await decks.createDeck(instance, { en: "Spanish" });
  const catalogUrl = `${instance}catalog.ttl`;
  let catalog = await (await fetch(catalogUrl, { headers: { accept: "text/turtle" } })).text();
  // As the server writes the address: in full, or relative to the catalog.
  for (const [from, path] of [
    [deck.cardsDocumentUrl, "alice/profile/card"],
    [deck.reviewsDocumentUrl, "alice/private/diary.ttl"],
  ] as const) {
    for (const written of [from, from.slice(instance.length)]) {
      catalog = catalog.replaceAll(`<${written}>`, `<${spell(instance, path)}>`);
    }
  }
  await put(catalogUrl, catalog);
  expect(await (await fetch(catalogUrl)).text()).not.toContain(deck.cardsDocumentUrl);
  return { base, alice, instance, deck, decks, requests };
}

/** How a catalog may name Alice's documents climbing out of Bob's instance. */
const SPELLINGS: [string, (instance: string, path: string) => string][] = [
  ["by dot segments", (instance, path) => `${instance}decks/../../../../${path}`],
  ["by encoded dot segments", (instance, path) => `${instance}%2e%2e/%2E%2e/.%2e/${path}`],
];

/** Alice's documents by their own address. */
const byAddress = (instance: string, path: string) => new URL(`../../../${path}`, instance).href;

describe.each(SERVERS)(
  "a catalog naming another user's documents by their address, on $name",
  ({ url: server }) => {
    it("reads them, and leads no write or delete there", async () => {
      const { alice, instance, deck, decks, requests } = await seed(server, byAddress);
      const [listed] = await decks.listDecks(instance);
      expect(listed).toMatchObject({
        cardsDocumentUrl: alice.card,
        reviewsDocumentUrl: alice.diary,
      });
      await expect(decks.unclaimedDocuments(listed!)).resolves.toEqual([alice.card, alice.diary]);

      requests.length = 0;
      // Refused: unclaimed, or (where the server serves the profile as no RDF) not read at all.
      await expect(
        decks.addCard(listed!, { front: { "": "uno" }, back: { "": "one" } }),
      ).rejects.toThrow();
      await decks.removeDeck(listed!);
      expect(requests.filter((request) => !/^(GET|HEAD) /.test(request))).toEqual([
        `PATCH ${instance}catalog.ttl`,
      ]);
      expect(await status(alice.card)).toBe(200);
      expect(await status(alice.diary)).toBe(200);
      expect(deck.url).toBe(listed!.url);

      await put(
        `${instance}catalog.ttl`,
        `<#deck-x> a <${SM}Deck> ; <${SM}cardsDocument> <${alice.card}> ; <${SM}reviewsDocument> <${alice.diary}> .`,
      );
      await deleteInstanceData(instance, fetch);
      expect(await status(alice.card)).toBe(200);
      expect(await status(alice.diary)).toBe(200);
    }, 60_000);
  },
);

describe.each(SERVERS)(
  "a catalog naming documents by an address that climbs out of its instance, on $name",
  ({ url: server }) => {
    it.each(SPELLINGS)(
      "leads no delete there, %s",
      async (_label, spell) => {
        const { alice, instance, deck, decks, requests } = await seed(server, spell);

        expect(await decks.listDecks(instance)).toEqual([]);
        const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
        const report = await validator.validateDocument(`${instance}catalog.ttl`);
        const entry = report.subjects.find((subject) => subject.url === deck.url);
        expect(entry?.status === "checked" && entry.violations.map((v) => v.constraint)).toEqual(
          expect.arrayContaining(["DeckPlace"]),
        );

        // The deck as the user had it listed, before its catalog changed: its entry goes, and nothing of Alice's.
        requests.length = 0;
        await decks.removeDeck(deck);
        expect(requests.filter((request) => !request.startsWith("GET"))).toEqual([
          `PATCH ${instance}catalog.ttl`,
        ]);
        expect(await status(alice.card)).toBe(200);
        expect(await status(alice.diary)).toBe(200);

        // The catalog names them again, and the instance is deleted.
        await put(
          `${instance}catalog.ttl`,
          `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .
<#deck-x> a <${SM}Deck> ; <${SM}cardsDocument> <${spell(instance, "alice/profile/card")}> ;
  <${SM}reviewsDocument> <${spell(instance, "alice/private/diary.ttl")}> .`,
        );
        const deletes: string[] = [];
        await deleteInstanceData(instance, (async (input, init) => {
          const response = await fetch(input, init);
          if (init?.method === "DELETE") deletes.push(response.url || String(input));
          return response;
        }) as typeof globalThis.fetch);
        expect(deletes.every((url) => url.startsWith(instance))).toBe(true);
        expect(await status(alice.card)).toBe(200);
        expect(await status(alice.diary)).toBe(200);
        expect(await status(`${instance}meta.ttl`)).toBe(404);
      },
      60_000,
    );
  },
);

describe.each(SERVERS)(
  "an instance whose address is spelled otherwise than a request sends it, on $name",
  ({ url: server }) => {
    it.each([
      ["a folder named outside ASCII", "kortlekar-å/"],
      ["a folder named in Hangul", "한국어/"],
    ])(
      "keeps its decks: %s",
      async (_label, folder) => {
        const base = new URL(`place-${crypto.randomUUID()}/`, server).href;
        // As the user typed it, made into the address a request sends, as creating an instance does.
        const typed = `${base}bob/${folder}`;
        const instance = instanceAddressOf(typed);
        expect(instance).not.toBe(typed);
        await put(`${instance}meta.ttl`, `<#it> a <${SM}Instance> .`);
        const decks = createSolidDeckRepository({
          fetch,
          now: () => new Date(),
          randomId: () => crypto.randomUUID(),
        });
        const deck = await decks.createDeck(instance, { en: "Spanish" });
        await decks.addCard(deck, { front: { "": "uno" }, back: { "": "one" } });
        const second = await decks.createDeck(instance, { en: "Korean" });
        await decks.addCard(second, { front: { "": "dos" }, back: { "": "two" } });
        // At its address, and as an instance registered before as typed is read.
        for (const at of [instance, typed]) {
          expect((await decks.listDecks(at)).map((one) => one.title)).toEqual(
            expect.arrayContaining([{ en: "Spanish" }, { en: "Korean" }]),
          );
        }

        const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
        const report = await validator.validateDocument(`${instance}catalog.ttl`);
        expect(
          report.subjects.flatMap((subject) =>
            subject.status === "checked" ? subject.violations.map((v) => v.constraint) : [],
          ),
        ).not.toContain("DeckPlace");

        await decks.removeDeck(deck);
        expect(await status(deck.cardsDocumentUrl)).toBe(404);
        expect(await status(second.cardsDocumentUrl)).toBe(200);
        await deleteInstanceData(typed, fetch);
        expect(await status(second.cardsDocumentUrl)).toBe(404);
        expect(await status(`${instance}meta.ttl`)).toBe(404);
      },
      60_000,
    );
  },
);

/** The address the server names for a document's access control (`Link: <…>; rel="acl"`), else `<document>.acl`. */
async function accessControlOf(url: string): Promise<string> {
  const link = (await fetch(url, { method: "HEAD" })).headers.get("link") ?? "";
  const named = /<([^>]*)>\s*;\s*rel="?acl"?/.exec(link)?.[1];
  return named === undefined ? `${url}.acl` : new URL(named, url).href;
}

describe.each(SERVERS)(
  "a catalog naming another of the instance's documents as a deck's, on $name",
  ({ url: server }) => {
    it.each([
      ["another deck's access control", accessControlOf],
      [
        "another deck's documents by an empty segment",
        async (url: string) => url.replace(/\/decks\/|\/reviews\//, (folder) => `${folder}/`),
      ],
    ] as const)(
      "leads no write there, nor a delete: %s",
      async (_label, spell) => {
        const base = new URL(`place-${crypto.randomUUID()}/`, server).href;
        const instance = `${base}bob/solid-memo/main/`;
        await put(`${instance}meta.ttl`, `<#it> a <${SM}Instance> .`);
        const requests: string[] = [];
        const recording = (async (input, init) => {
          const response = await fetch(input, init);
          requests.push(`${init?.method ?? "GET"} ${response.url || String(input)}`);
          return response;
        }) as typeof globalThis.fetch;
        const decks = createSolidDeckRepository({
          fetch: recording,
          now: () => new Date(),
          randomId: () => crypto.randomUUID(),
        });
        const a = await decks.createDeck(instance, { en: "Spanish" });
        await decks.addCard(a, { front: { "": "uno" }, back: { "": "one" } });
        await decks.addCard(a, { front: { "": "dos" }, back: { "": "two" } });
        const b = await decks.createDeck(instance, { en: "Korean" });
        const cards = await spell(a.cardsDocumentUrl);
        const reviews = await spell(a.reviewsDocumentUrl);
        // The catalog as the server serves it, B's documents named as A's, written back as N-Triples.
        const catalogUrl = `${instance}catalog.ttl`;
        const served = await (
          await fetch(catalogUrl, { headers: { accept: "text/turtle" } })
        ).text();
        const renamed = new Map([
          [b.cardsDocumentUrl, cards],
          [b.reviewsDocumentUrl, reviews],
        ]);
        const quads = new Parser({ baseIRI: catalogUrl })
          .parse(served)
          .map((quad) =>
            DataFactory.quad(
              quad.subject,
              quad.predicate,
              renamed.has(quad.object.value)
                ? DataFactory.namedNode(renamed.get(quad.object.value)!)
                : quad.object,
            ),
          );
        await put(catalogUrl, new Writer({ format: "N-Triples" }).quadsToString(quads));

        expect((await decks.listDecks(instance)).map((deck) => deck.url)).toEqual([a.url]);
        const there = { ...b, cardsDocumentUrl: cards, reviewsDocumentUrl: reviews };
        requests.length = 0;
        await expect(
          decks.addCard(there, { front: { "": "tres" }, back: { "": "three" } }),
        ).rejects.toMatchObject({ code: "deckGone" });
        await decks.removeDeck(there);
        expect(requests.filter((request) => !request.startsWith("GET"))).toEqual([
          `PATCH ${catalogUrl}`,
        ]);
        expect(await status(a.cardsDocumentUrl)).toBe(200);
        expect(await decks.listCards(a)).toHaveLength(2);
      },
      60_000,
    );
  },
);

/** How many times the document at `url` says it is the deck's. */
async function backLinks(url: string, deckUrl: string): Promise<number> {
  const served = await (await fetch(url, { headers: { accept: "text/turtle" } })).text();
  return new Parser({ baseIRI: url })
    .parse(served)
    .filter(
      (quad) =>
        quad.subject.value === url &&
        quad.predicate.value === "http://purl.org/dc/terms/isPartOf" &&
        quad.object.value === deckUrl,
    ).length;
}

describe.each(SERVERS)(
  "a pod laid out flat, the instance at its root, on $name",
  ({ url: server }) => {
    it("reads, writes and removes a deck whose documents are named freely, an older one claimed once", async () => {
      const root = server;
      const requests: string[] = [];
      const recording = (async (input, init) => {
        const response = await fetch(input, init);
        requests.push(`${init?.method ?? "GET"} ${response.url || String(input)}`);
        return response;
      }) as typeof globalThis.fetch;
      const decks = createSolidDeckRepository({
        fetch: recording,
        now: () => new Date(),
        randomId: () => crypto.randomUUID(),
      });
      const deck = await decks.createDeck(root, { en: "Spanish" });
      const id = crypto.randomUUID();
      const cards = `${root}flat-${id}-cards.ttl`;
      const reviews = `${root}flat-${id}-reviews.ttl`;
      // An older cards document, from before documents said whose they are.
      await put(
        cards,
        `<#card-1> a <${SM}Card> ; <${SM}front> "uno" ; <${SM}back> "one" ; <${SM}formatVersion> 6 ;
  <http://purl.org/dc/terms/created> "2026-10-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`,
      );
      const catalogUrl = `${root}catalog.ttl`;
      let catalog = await (await fetch(catalogUrl, { headers: { accept: "text/turtle" } })).text();
      for (const [from, to] of [
        [deck.cardsDocumentUrl, cards],
        [deck.reviewsDocumentUrl, reviews],
      ] as const) {
        for (const written of [from, from.slice(root.length)]) {
          catalog = catalog.replaceAll(`<${written}>`, `<${to}>`);
        }
      }
      await put(catalogUrl, catalog);
      const [listed] = await decks.listDecks(root);
      expect(listed).toMatchObject({ cardsDocumentUrl: cards, reviewsDocumentUrl: reviews });
      expect((await decks.listCards(listed!)).map((card) => card.id)).toEqual(["card-1"]);

      // A storage's root holds the user's other data too: an older document there is the user's to claim.
      const head = await fetch(root, { method: "HEAD" });
      const storageRoot =
        new URL(root).pathname === "/" || hasStorageLink(head.headers.get("link"));
      if (storageRoot) {
        await expect(decks.unclaimedDocuments(listed!)).resolves.toEqual([cards]);
        requests.length = 0;
        await expect(
          decks.addCard(listed!, { front: { "": "dos" }, back: { "": "two" } }),
        ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
        expect(requests.filter((request) => !/^(GET|HEAD) /.test(request))).toEqual([]);
        await decks.claimDocuments(listed!);
        expect(requests.filter((request) => !/^(GET|HEAD) /.test(request))).toEqual([
          `PATCH ${cards}`,
        ]);
      }
      await expect(decks.unclaimedDocuments(listed!)).resolves.toEqual([]);
      await decks.addCard(listed!, { front: { "": "dos" }, back: { "": "two" } });
      expect(await backLinks(cards, deck.url)).toBe(1);
      expect(await decks.listCards(listed!)).toHaveLength(2);

      await decks.removeDeck(listed!);
      expect(await status(cards)).toBe(404);
      expect((await decks.listDecks(root)).map((one) => one.url)).not.toContain(deck.url);
      await fetch(catalogUrl, { method: "DELETE" });
    }, 60_000);
  },
);

describe.each(SERVERS)("an instance nested in another's folder, on $name", ({ url: server }) => {
  it("is never written through the outer instance's catalog alone, and keeps its cards when the outer one is deleted", async () => {
    const outer = new URL(`nested-${crypto.randomUUID()}/`, server).href;
    const inner = `${outer}nested/`;
    const requests: string[] = [];
    const recording = (async (input, init) => {
      const response = await fetch(input, init);
      requests.push(`${init?.method ?? "GET"} ${response.url || String(input)}`);
      return response;
    }) as typeof globalThis.fetch;
    const decks = createSolidDeckRepository({
      fetch: recording,
      now: () => new Date(),
      randomId: () => crypto.randomUUID(),
    });
    const own = await decks.createDeck(inner, { en: "Inner" });
    await decks.addCard(own, { front: { "": "uno" }, back: { "": "one" } });
    const deck = await decks.createDeck(outer, { en: "Outer" });
    const catalogUrl = `${outer}catalog.ttl`;
    let catalog = await (await fetch(catalogUrl, { headers: { accept: "text/turtle" } })).text();
    for (const [from, to] of [
      [deck.cardsDocumentUrl, own.cardsDocumentUrl],
      [deck.reviewsDocumentUrl, own.reviewsDocumentUrl],
    ] as const) {
      for (const written of [from, from.slice(outer.length)]) {
        catalog = catalog.replaceAll(`<${written}>`, `<${to}>`);
      }
    }
    await put(catalogUrl, catalog);
    const [listed] = await decks.listDecks(outer);
    expect(listed).toMatchObject({ cardsDocumentUrl: own.cardsDocumentUrl });
    // In the outer instance's own folder: not read for the data check, refused on a write.
    await expect(decks.unclaimedDocuments(listed!)).resolves.toEqual([]);

    requests.length = 0;
    await expect(
      decks.addCard(listed!, { front: { "": "dos" }, back: { "": "two" } }),
    ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
    expect(requests.filter((request) => !/^(GET|HEAD) /.test(request))).toEqual([]);

    // Saying it is the outer deck's too (as an earlier version, or another app, left it), then
    // the outer instance deleted: only its deck's saying so goes.
    const served = await (
      await fetch(own.cardsDocumentUrl, { headers: { accept: "text/turtle" } })
    ).text();
    const quads = new Parser({ baseIRI: own.cardsDocumentUrl }).parse(served);
    quads.push(
      DataFactory.quad(
        DataFactory.namedNode(own.cardsDocumentUrl),
        DataFactory.namedNode("http://purl.org/dc/terms/isPartOf"),
        DataFactory.namedNode(deck.url),
      ),
    );
    // A second on from the app's read: a server whose ETag is the second of the change tells the two apart.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await put(own.cardsDocumentUrl, new Writer({ format: "N-Triples" }).quadsToString(quads));
    expect(await backLinks(own.cardsDocumentUrl, deck.url)).toBe(1);
    await decks.addCard(listed!, { front: { "": "dos" }, back: { "": "two" } });
    const result = await deleteInstanceData(outer, recording);
    expect(result.keptDocuments).toContain(own.cardsDocumentUrl);
    expect(await backLinks(own.cardsDocumentUrl, deck.url)).toBe(0);
    expect(await backLinks(own.cardsDocumentUrl, own.url)).toBe(1);
    expect(await decks.listCards(own)).toHaveLength(2);
    await deleteInstanceData(inner, fetch);
  }, 60_000);
});
