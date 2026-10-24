// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck imported from the library, end to end, through the app's own use
 * cases and Solid adapters wired as in createAppUseCases (docs/deck-library.md): the
 * library publishes its releases at library deck format 4 or 5 and their
 * cards at the format each was frozen at; an import writes the user's
 * copy at the formats this app writes (deck 6, card 5), its text exactly
 * the release's, keywords included, and every write is checked against
 * those shapes. The pod is a local one.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import type { ResourceStore } from "@solid-memo/application/ports";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckLibrary } from "./solidDeckLibrary";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";

const POD = "https://alice.example/";
const ALICE = { webId: `${POD}profile/card#me` };
const SITE = "https://solid-memo.com/";
const RELEASE = `${SITE}decks/capitals/v2.ttl`;
/** A release of library deck format 5: its keywords tagged with their language. */
const TAGGED_RELEASE = `${SITE}decks/capitals/v3.ttl`;
const KEYWORD = "http://www.w3.org/ns/dcat#keyword";
const SM_NS = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DCTERMS = "http://purl.org/dc/terms/";

/**
 * The cards of a format-4 release (the release document is the deck
 * fixture): tagged sides, sides that do not say their language, a note
 * in two languages, a described picture, a card that names what it is
 * about, which format 4 does not know, and a card frozen at format 3.
 */
const CARDS = `
<#se>
    a solid-memo:Card ;
    <http://purl.org/dc/terms/subject> <http://www.wikidata.org/entity/Q34> ,
                                       <http://www.wikidata.org/entity/Q1754> ;
    solid-memo:front "Sweden"@en ,
                     "Sverige"@sv ;
    solid-memo:back "Stockholm"@en ,
                    "Stockholm"@sv ;
    solid-memo:formatVersion 4 .

<#no>
    a solid-memo:Card ;
    solid-memo:front "Norway" ;
    solid-memo:frontNote "Independent since 1905."@en ,
                         "Självständigt sedan 1905."@sv ;
    solid-memo:backLabel "Capital"@en ;
    solid-memo:back "Oslo" ;
    solid-memo:formatVersion 4 .

<#q12418>
    a solid-memo:Card ;
    solid-memo:frontImage <https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa.jpg> ;
    solid-memo:frontImageDescription "A painted portrait of a woman with folded hands"@en ,
                                     "Ett målat porträtt av en kvinna med knäppta händer"@sv ;
    solid-memo:back "Mona Lisa — Leonardo da Vinci, 1500s"@en ;
    solid-memo:formatVersion 4 .

<#dk>
    a solid-memo:Card ;
    solid-memo:front "Denmark" ;
    solid-memo:frontNote "A kingdom."@en ;
    solid-memo:back "Copenhagen" ;
    solid-memo:formatVersion 3 .
`;

/** Every RDF document of a store, as N-Triples lines. */
async function everyTriple(store: ResourceStore): Promise<string[]> {
  const lines: string[] = [];
  for (const url of await store.urls()) {
    const resource = await store.get(url);
    if (resource?.kind === "rdf") lines.push(...resource.triples);
  }
  return lines;
}

/** A document the app reads: a library release (a fixture), or a shape document as the site publishes it. */
const siteFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const body =
    url === RELEASE
      ? `${await readFile(`${VOCAB_ROOT}fixtures/deck/v4/valid/library-release.ttl`, "utf8")}${CARDS}`
      : url === TAGGED_RELEASE
        ? `${await readFile(`${VOCAB_ROOT}fixtures/library-deck/v5/valid/library-release.ttl`, "utf8")}${CARDS}`
        : undefined;
  if (body === undefined) return shapesFetch(url);
  const response = new Response(body, { headers: { "content-type": "text/turtle" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

/** The app over a local pod kept in `store`, reading the library through `site`. */
async function app(site: typeof fetch = siteFetch, store = createMemoryResourceStore()) {
  const podFetch = createLocalPod({ root: POD, store, newEtag: () => `"${crypto.randomUUID()}"` });
  // Alice's profile, on a pod that has none yet.
  await podFetch(`${POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch: siteFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    ...NO_PORTS,
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: createSolidDeckLibrary({ fetch: site, indexUrl: `${SITE}decks/index.ttl` }),
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository({ fetch: podFetch, checkWrite, ...ids }),
    deckRepository: createSolidDeckRepository({ fetch: podFetch, checkWrite, ...ids }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
  });
  return { useCases, store };
}

describe("a deck imported from the library", () => {
  it("is written at deck format 6 and card format 7 from a format-4 release, its text and what its cards are about exactly the release's", {
    timeout: 30_000,
  }, async () => {
    // Releases are frozen: a format-4 release is read as it was published.
    expect(LATEST_VERSION.libraryDeck).toBe(6);
    const { useCases, store } = await app();
    const instance = await useCases.createInstance(ALICE, {
      containerUrl: `${POD}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });

    const deck = await useCases.importLibraryDeck(instance.url, { url: RELEASE } as LibraryDeck);

    expect(deck).toMatchObject({
      formatVersion: 6,
      sourceUrl: RELEASE,
      title: { en: "Capitals", sv: "Huvudstäder" },
      keywords: { "": ["capitals"] },
    });
    const [listed] = await useCases.listDecks(instance.url);
    expect(listed).toMatchObject({
      formatVersion: 6,
      title: { en: "Capitals", sv: "Huvudstäder" },
      keywords: { "": ["capitals"] },
    });
    const cards = await useCases.listCards(listed!);
    expect(cards.map((card) => [card.id, card.formatVersion]).sort()).toEqual([
      ["dk", 7],
      ["no", 7],
      ["q12418", 7],
      ["se", 7],
    ]);
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
    expect(await useCases.planMigration(instance.url)).toMatchObject({
      deckCount: 0,
      cardCount: 0,
    });

    // The text is the release's, triple for triple: nothing tagged, nothing dropped, nothing invented.
    const triples = await everyTriple(store);
    const card = (id: string) => `<${listed!.cardsDocumentUrl}#${id}>`;
    expect(triples).toEqual(
      expect.arrayContaining([
        `<${listed!.url}> <${DCTERMS}title> "Capitals"@en .`,
        `<${listed!.url}> <${DCTERMS}title> "Huvudstäder"@sv .`,
        `<${listed!.url}> <${DCTERMS}description> "Capitals of the world."@en .`,
        `<${listed!.url}> <${DCTERMS}description> "Världens huvudstäder."@sv .`,
        // The release's keyword states no language, and none is guessed.
        `<${listed!.url}> <${KEYWORD}> "capitals" .`,
        `${card("se")} <${SM_NS}front> "Sweden"@en .`,
        `${card("se")} <${SM_NS}front> "Sverige"@sv .`,
        `${card("se")} <${SM_NS}back> "Stockholm"@en .`,
        `${card("se")} <${SM_NS}back> "Stockholm"@sv .`,
        `${card("se")} <${DCTERMS}subject> <http://www.wikidata.org/entity/Q34> .`,
        `${card("se")} <${DCTERMS}subject> <http://www.wikidata.org/entity/Q1754> .`,
        `${card("no")} <${SM_NS}front> "Norway" .`,
        `${card("no")} <${SM_NS}back> "Oslo" .`,
        `${card("no")} <${SM_NS}frontNote> "Independent since 1905."@en .`,
        `${card("no")} <${SM_NS}frontNote> "Självständigt sedan 1905."@sv .`,
        `${card("no")} <${SM_NS}backLabel> "Capital"@en .`,
        `${card("q12418")} <${SM_NS}frontImageDescription> "A painted portrait of a woman with folded hands"@en .`,
        `${card("q12418")} <${SM_NS}frontImageDescription> "Ett målat porträtt av en kvinna med knäppta händer"@sv .`,
        `${card("q12418")} <${SM_NS}back> "Mona Lisa — Leonardo da Vinci, 1500s"@en .`,
        `${card("dk")} <${SM_NS}front> "Denmark" .`,
        `${card("dk")} <${SM_NS}back> "Copenhagen" .`,
        `${card("dk")} <${SM_NS}frontNote> "A kingdom."@en .`,
      ]),
    );
    expect(triples).toContain(
      `<${listed!.url}> <${SM_NS}formatVersion> "6"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
    );
    for (const subject of ["se", "no", "q12418", "dk"].map(card)) {
      expect(triples, subject).toContain(
        `${subject} <${SM_NS}formatVersion> "7"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
      );
    }
    const texts = (subject: string, predicate: string) =>
      triples.filter((line) => line.startsWith(`${subject} <${predicate}> "`)).length;
    expect(texts(`<${listed!.url}>`, `${DCTERMS}title`)).toBe(2);
    expect(texts(`<${listed!.url}>`, KEYWORD)).toBe(1);
    expect(texts(card("se"), `${SM_NS}front`)).toBe(2);
    expect(texts(card("no"), `${SM_NS}front`)).toBe(1);
    expect(texts(card("dk"), `${SM_NS}frontNote`)).toBe(1);
  });

  it("copies a format-5 release's keywords with their language tags", {
    timeout: 30_000,
  }, async () => {
    const { useCases, store } = await app();
    const instance = await useCases.createInstance(ALICE, {
      containerUrl: `${POD}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });

    const deck = await useCases.importLibraryDeck(instance.url, {
      url: TAGGED_RELEASE,
    } as LibraryDeck);

    expect(deck.keywords).toEqual({ en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] });
    const [listed] = await useCases.listDecks(instance.url);
    expect(listed!.keywords).toEqual({
      en: ["capitals", "countries"],
      sv: ["huvudstäder", "länder"],
    });
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
    const keywords = (await everyTriple(store))
      .filter((line) => line.startsWith(`<${listed!.url}> <${KEYWORD}> `))
      .sort();
    expect(keywords).toEqual([
      `<${listed!.url}> <${KEYWORD}> "capitals"@en .`,
      `<${listed!.url}> <${KEYWORD}> "countries"@en .`,
      `<${listed!.url}> <${KEYWORD}> "huvudstäder"@sv .`,
      `<${listed!.url}> <${KEYWORD}> "länder"@sv .`,
    ]);
  });
});

const FIRST = `${SITE}decks/capitals-of-the-world/v1.ttl`;
const LATEST = `${SITE}decks/capitals-of-the-world/v4.ttl`;

/** The card ids a release of the library holds, as the site publishes it through `site`. */
async function releaseCardIds(url: string, site: typeof fetch = siteFetch): Promise<string[]> {
  const turtle = await (await site(url)).text();
  return [...turtle.matchAll(/^<#([^>]+)>\n {4}a solid-memo:Card\b/gm)]
    .map((match) => match[1]!)
    .sort();
}

/** The library as the site publishes it, its latest capitals-of-the-world release without the card `id`. */
function withoutCard(id: string): typeof fetch {
  return async (input, init) => {
    const response = await siteFetch(input, init);
    if (String(input) !== LATEST) return response;
    const turtle = (await response.text()).replace(new RegExp(`\\n<#${id}>\\n(?:.+\\n)+`), "\n");
    const changed = new Response(turtle, { headers: { "content-type": "text/turtle" } });
    return Object.defineProperty(changed, "url", { value: LATEST });
  };
}

/** How often the document at `url` says it is the deck's. */
async function backLinks(store: ResourceStore, url: string, deckUrl: string): Promise<number> {
  return (await everyTriple(store)).filter(
    (line) => line.startsWith(`<${url}> <${DCTERMS}isPartOf> `) && line.includes(deckUrl),
  ).length;
}

/** The document at `url` as one written before documents said whose they are: its dcterms:isPartOf gone. */
async function unlink(store: ResourceStore, url: string): Promise<void> {
  const resource = await store.get(url);
  if (resource?.kind !== "rdf") throw new Error(`${url} is not an RDF document`);
  await store.set(url, {
    ...resource,
    etag: `"${crypto.randomUUID()}"`,
    triples: resource.triples.filter((line) => !line.startsWith(`<${url}> <${DCTERMS}isPartOf> `)),
  });
}

/**
 * A library deck imported into an instance at `containerUrl`, one card
 * studied, and the site whose latest release removes that card.
 */
async function studiedDeck(containerUrl: string) {
  const first = await app();
  const instance = await first.useCases.createInstance(ALICE, {
    containerUrl,
    name: "Main",
    registrationTarget: "private",
  });
  const deck = await first.useCases.importLibraryDeck(instance.url, { url: FIRST } as LibraryDeck);
  const cards = await first.useCases.listCards(deck);
  const studied = [...cards].sort((a, b) => a.id.localeCompare(b.id));
  for (const card of studied.slice(0, 2)) {
    await first.useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      new Date("2026-10-20T10:00:00.000Z"),
    );
  }
  const removed = studied[0]!.id;
  const kept = studied[1]!.id;
  return { store: first.store, instance, deck, removed, kept, site: withoutCard(removed) };
}

/** The deck's library upgrade to the latest release, through the app over `site` and the same pod. */
async function upgrade(
  store: ResourceStore,
  site: typeof fetch,
  instanceUrl: string,
  deckUrl: string,
) {
  const { useCases } = await app(site, store);
  const deck = (await useCases.listDecks(instanceUrl)).find((one) => one.url === deckUrl)!;
  const [copy] = await useCases.listLibraryUpdates(instanceUrl);
  const plan = await useCases.planLibraryUpgrade(deck, copy);
  expect(plan).not.toBeNull();
  return { useCases, deck, plan: plan!, outcome: await useCases.applyLibraryUpgrade(deck, plan!) };
}

describe("a library deck's documents, through its import and an upgrade", () => {
  it("say once each that they are the deck's, and its cards and review states are as they would be without it", {
    timeout: 60_000,
  }, async () => {
    const { useCases, store } = await app();
    const instance = await useCases.createInstance(ALICE, {
      containerUrl: `${POD}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const deck = await useCases.importLibraryDeck(instance.url, { url: FIRST } as LibraryDeck);
    const cards = await useCases.listCards(deck);
    await useCases.recordReview(
      instance.url,
      deck,
      { card: cards[0]!, direction: "front-to-back" },
      4,
      new Date("2026-10-20T10:00:00.000Z"),
    );
    // Only the documents say so: no card or review state does.
    const partOfSubjects = async () =>
      new Set(
        (await everyTriple(store))
          .filter((line) => line.includes(`<${DCTERMS}isPartOf> <${deck.url}>`))
          .map((line) => line.split(" ")[0]),
      );
    expect(await backLinks(store, deck.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, deck.reviewsDocumentUrl, deck.url)).toBe(1);
    const states = await useCases.listDeckReviewStates(deck);
    expect(states.sm2.map((state) => state.cardId)).toEqual([cards[0]!.id]);

    const [copy] = await useCases.listLibraryUpdates(instance.url);
    const plan = await useCases.planLibraryUpgrade(deck, copy);
    expect(plan).not.toBeNull();
    await expect(useCases.applyLibraryUpgrade(deck, plan!)).resolves.toMatchObject({ ok: true });

    const [upgraded] = await useCases.listDecks(instance.url);
    expect(upgraded!.sourceUrl).toBe(LATEST);
    expect(await backLinks(store, upgraded!.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, upgraded!.reviewsDocumentUrl, deck.url)).toBe(1);
    expect(await partOfSubjects()).toEqual(
      new Set([`<${upgraded!.cardsDocumentUrl}>`, `<${upgraded!.reviewsDocumentUrl}>`]),
    );
    // The cards are the release's, every one; the state studied is as it was.
    expect((await useCases.listCards(upgraded!)).map((card) => card.id).sort()).toEqual(
      await releaseCardIds(LATEST),
    );
    expect(await useCases.listDeckReviewStates(upgraded!)).toEqual(states);
    const report = await useCases.validateInstance(instance.url);
    expect(report.conforms).toBe(true);
    expect(report.unclaimed).toBeUndefined();
  });

  it("an upgrade that removes a studied card writes the reviews document too, which still says once it is the deck's", {
    timeout: 60_000,
  }, async () => {
    const { store, instance, deck, removed, kept, site } = await studiedDeck(`${POD}solid-memo/`);
    const { useCases, plan, outcome } = await upgrade(store, site, instance.url, deck.url);
    expect(plan.remove.map((card) => card.id)).toEqual([removed]);
    expect(outcome).toMatchObject({ ok: true });

    const [upgraded] = await useCases.listDecks(instance.url);
    expect((await useCases.listCards(upgraded!)).map((card) => card.id).sort()).toEqual(
      await releaseCardIds(LATEST, site),
    );
    const states = await useCases.listDeckReviewStates(upgraded!);
    expect(states.sm2.map((state) => state.cardId)).toEqual([kept]);
    expect(await backLinks(store, upgraded!.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, upgraded!.reviewsDocumentUrl, deck.url)).toBe(1);
  });

  it("made before documents said whose they are, in the instance's own folder, says so in the upgrade's own writes", {
    timeout: 60_000,
  }, async () => {
    const { store, instance, deck, kept, site } = await studiedDeck(`${POD}solid-memo/`);
    await unlink(store, deck.cardsDocumentUrl);
    await unlink(store, deck.reviewsDocumentUrl);
    expect(await backLinks(store, deck.cardsDocumentUrl, deck.url)).toBe(0);

    const { useCases, outcome } = await upgrade(store, site, instance.url, deck.url);
    expect(outcome).toMatchObject({ ok: true });
    const [upgraded] = await useCases.listDecks(instance.url);
    expect(upgraded!.sourceUrl).toBe(LATEST);
    expect(
      (await useCases.listDeckReviewStates(upgraded!)).sm2.map((state) => state.cardId),
    ).toEqual([kept]);
    expect(await backLinks(store, upgraded!.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, upgraded!.reviewsDocumentUrl, deck.url)).toBe(1);
  });

  it("made before documents said whose they are, in an instance at the pod's root, is refused, nothing changed, until the user claims them", {
    timeout: 60_000,
  }, async () => {
    const { store, instance, deck, removed, kept, site } = await studiedDeck(POD);
    expect(instance.url).toBe(POD);
    await unlink(store, deck.cardsDocumentUrl);
    await unlink(store, deck.reviewsDocumentUrl);
    const before = await everyTriple(store);

    const refused = await upgrade(store, site, instance.url, deck.url);
    expect(refused.outcome).toMatchObject({
      ok: false,
      step: "cards",
      error: expect.objectContaining({ code: "deckDocumentUnclaimed" }),
      changed: false,
    });
    expect(await everyTriple(store)).toEqual(before);

    await refused.useCases.claimDeckDocuments(instance.url, deck.url);
    expect(await backLinks(store, deck.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, deck.reviewsDocumentUrl, deck.url)).toBe(1);

    const { useCases, plan, outcome } = await upgrade(store, site, instance.url, deck.url);
    expect(plan.remove.map((card) => card.id)).toEqual([removed]);
    expect(outcome).toMatchObject({ ok: true });
    const [upgraded] = await useCases.listDecks(instance.url);
    expect(upgraded!.sourceUrl).toBe(LATEST);
    expect((await useCases.listCards(upgraded!)).map((card) => card.id).sort()).toEqual(
      await releaseCardIds(LATEST, site),
    );
    expect(
      (await useCases.listDeckReviewStates(upgraded!)).sm2.map((state) => state.cardId),
    ).toEqual([kept]);
    expect(await backLinks(store, upgraded!.cardsDocumentUrl, deck.url)).toBe(1);
    expect(await backLinks(store, upgraded!.reviewsDocumentUrl, deck.url)).toBe(1);
  });
});
