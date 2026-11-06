// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Statements another app wrote at an IRI the Solid client keeps for
 * subjects not saved yet: the data check, deck writes, the cards and the
 * WebID document go on as if the document did not state them, through
 * the app's own use cases and Solid adapters over a local pod. A local
 * pod stores what it parses, and a read leaves such statements out, so
 * they are added to the text its answers carry, which a server keeps as
 * it was written.
 */
import { describe, expect, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { createUseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import { createThing } from "./client/rdf";
import { getSolidDatasetLinear } from "./client/resources";
import { createLocalPod } from "./localPod";
import { toLibraryDeckContent } from "./mappers/libraryMapper";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";
import { turtleAt } from "./testing/contract/rdf";

const POD = "https://alice.example/";
const ALICE = { webId: `${POD}profile/card#me` };
const LOCAL = createThing({ name: "x" }).url;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** The local pod's `fetch`, its answers to a GET carrying the planted text, and the patches sent. */
function servingPlanted() {
  const pod = createLocalPod({
    root: POD,
    store: createMemoryResourceStore(),
    newEtag: () => `"${crypto.randomUUID()}"`,
  });
  const planted = new Map<string, string>();
  const patches: string[] = [];
  const fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH") patches.push(String(init?.body));
    const response = await pod(input, init);
    const text = planted.get(url.split("#")[0]!);
    if (method !== "GET" || text === undefined || !response.ok) return response;
    const { status, headers } = response;
    const answer = new Response(`${await response.text()}\n${text}\n`, { status, headers });
    Object.defineProperty(answer, "url", { value: url });
    return answer;
  }) as typeof globalThis.fetch;
  return { fetch, planted, patches };
}

async function setup() {
  const { fetch, planted, patches } = servingPlanted();
  await fetch(ALICE.webId.split("#")[0]!, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
    body: `<#me> <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  let next = 0;
  const ids = { now: () => new Date("2026-01-01T00:00:00Z"), randomId: () => `id${++next}` };
  const useCases = createUseCases({
    ...NO_PORTS,
    instanceRepository: createSolidInstanceRepository({ fetch, checkWrite, ...ids }),
    deckRepository: createSolidDeckRepository({ fetch, checkWrite, ...ids }),
    preferencesRepository: createSolidPreferencesRepository({ fetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch, checkWrite }),
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch }),
    shapeValidator,
  } as never);
  const instance = await useCases.createInstance(
    ALICE as never,
    {
      containerUrl: `${POD}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    } as never,
  );
  const deck = await useCases.createDeck(instance.url, { en: "D" } as never);
  const plant = async (url: string, turtle: string) => {
    const there = await fetch(url, { headers: { Accept: "text/turtle" } });
    if (there.status === 404)
      await fetch(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body: "" });
    planted.set(url, turtle);
    const served = await fetch(url, { headers: { Accept: "text/turtle" } });
    expect(await served.text()).toContain(LOCAL);
  };
  return { useCases, instance, deck, plant, patches };
}

type App = Awaited<ReturnType<typeof setup>>;

/** Every use case the statements stood in the way of goes through, the check finding the data sound. */
async function expectAllGoThrough({ useCases, instance, deck }: App) {
  const { conforms } = await useCases.checkInstance(instance.url);
  expect(conforms).toBe(true);
  await expect(useCases.listCards(deck)).resolves.toEqual([]);
  const decks = await useCases.listDecks(instance.url);
  expect(decks.map(({ url }) => url)).toEqual([deck.url]);
  await useCases.renameDeck(deck, { en: "R" } as never);
  const added = await useCases.createDeck(instance.url, { en: "E" } as never);
  await useCases.removeDeck(added);
  await useCases.removeDeck(deck);
  await expect(useCases.listDecks(instance.url)).resolves.toEqual([]);
}

describe("statements at an IRI kept for subjects not saved yet", () => {
  it("leave a catalog's data check and deck writes as they were, for a subject at one", async () => {
    const app = await setup();
    await app.plant(`${POD}solid-memo/catalog.ttl`, `<${LOCAL}> <urn:other:app> "note" .`);
    await expectAllGoThrough(app);
  });

  it("leave a deck's writes as they were, for a value of its entry at one", async () => {
    const app = await setup();
    await app.plant(
      `${POD}solid-memo/catalog.ttl`,
      `<${app.deck.url}> <urn:other:app> <${LOCAL}> .`,
    );
    await expectAllGoThrough(app);
    expect(app.patches.filter((body) => body.includes("#x>"))).toEqual([]);
  });

  it("leave a deck's cards as they were, for a card at one", async () => {
    const app = await setup();
    await app.plant(
      app.deck.cardsDocumentUrl,
      `<${LOCAL}> a <${SM}Card> ; <${SM}front> "f" ; <${SM}back> "b" .`,
    );
    await expectAllGoThrough(app);
  });

  it("leave the WebID document's view as it was", async () => {
    const { useCases, plant } = await setup();
    await plant(ALICE.webId.split("#")[0]!, `<${LOCAL}> <urn:other:app> "note" .`);
    const { subjects } = await useCases.viewWebIdDocument(ALICE as never);
    expect(subjects.map(({ url }) => url)).toEqual([ALICE.webId]);
  });

  it("leave a release read from a link as it was", async () => {
    const url = "https://publisher.example/release.ttl";
    const release = `<${url}> a <${SM}Deck> ;
      <http://purl.org/dc/terms/title> "Capitals" ; <${SM}formatVersion> 2 ;
      <http://purl.org/dc/terms/creator> "Anton Wiklund" ;
      <http://purl.org/dc/terms/license> <https://creativecommons.org/publicdomain/zero/1.0/> ;
      <http://purl.org/dc/terms/description> "From Wikipedia." ;
      <${SM}direction> "bidirectional" .
<#a> a <${SM}Card> ; <${SM}front> "f" ; <${SM}back> "b" ; <${SM}formatVersion> 2 .
<${LOCAL}> a <${SM}Card> ; <${SM}front> "x" ; <${SM}back> "y" ; <${SM}formatVersion> 2 .`;
    const dataset = await getSolidDatasetLinear(url, { fetch: turtleAt(release) });
    const content = toLibraryDeckContent(url, dataset);
    expect(content.cards.map(({ id }) => id)).toEqual(["a"]);
  });
});
