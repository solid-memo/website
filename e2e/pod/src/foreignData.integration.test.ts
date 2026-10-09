// @vitest-environment node
/**
 * What another app wrote, against a real Solid server (docs/data-model.md
 * "Deleting an instance" and "The catalogue"): deleting an instance
 * deletes only what Solid Memo wrote, keeping another app's files in its
 * folder and the folder with them, and deletes the whole folder, access
 * rules and all, when nothing else is in it; a dataset another app listed
 * in the catalogue stays listed through every deck save, and the instance
 * stays valid; what is wrong with another app's subjects is only
 * warned about (docs/validation.md "Data another app wrote"); and a
 * review state another app named its own way is read by what it says it
 * is of, while another scheduler's is left alone (docs/data-model.md
 * "Decks and cards"). The app's own use cases and Solid adapters, wired
 * as in main.tsx.
 */
import { describe, expect, inject, it } from "vitest";
import { Parser, Writer } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { arrangementSetAside, setAsideDecks } from "@solid-memo/domain/validation";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidDocumentBackups } from "@solid-memo/solid/solidDocumentBackups";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { aclOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DCAT_DATASET = "http://www.w3.org/ns/dcat#dataset";
/** A PNG's first bytes: a file another app put in the instance's folder. */
const PICTURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A page of the app as main.tsx wires it. */
function page(): UseCases {
  const writeFence = createWriteFence(fetch);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    documentBackups: createSolidDocumentBackups({ fetch: podFetch }),
    writeFence,
  });
}

async function put(url: string, body: string | Blob, type = "text/turtle"): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": type }, body });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

async function status(url: string): Promise<number> {
  return (await fetch(url, { method: "HEAD" })).status;
}

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** Access rules letting anyone read, write and control the resource (and, for a container, what is in it): the tests' fetch must keep its access. */
function openTo(target: string, inherit: boolean): string {
  return `@prefix acl: <http://www.w3.org/ns/auth/acl#> .
<#public> a acl:Authorization ; acl:agentClass <http://xmlns.com/foaf/0.1/Agent> ; acl:accessTo <${target}> ;
    ${inherit ? `acl:default <${target}> ;` : ""} acl:mode acl:Read, acl:Write, acl:Control .`;
}

/**
 * A user's pod in a fresh folder of the server: a profile with a private
 * type index, and an instance made by the app with two decks, a card, a
 * review state and a month of answers.
 */
async function seed(server: string) {
  const base = new URL(`foreign-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  await put(`${base}profile/card`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const useCases = page();
  const session = { webId };
  const instance: Instance = await useCases.createInstance(session, {
    containerUrl: `${base}solid-memo/main/`,
    name: "Main",
    registrationTarget: "private",
  });
  const capitals = await useCases.createDeck(instance.url, { en: "Capitals" });
  const card = await useCases.addCard(capitals, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
  await put(
    capitals.reviewsDocumentUrl,
    `@prefix sm: <${SM}> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#${card.id}> a sm:ReviewState ; sm:easeFactor 2.5 ; sm:intervalDays 6 ; sm:repetitions 2 ; sm:due "2026-10-15" ;
    sm:firstReviewedAt "2026-10-01T10:00:00Z"^^xsd:dateTime ; sm:lastReviewedAt "2026-10-09T10:00:00Z"^^xsd:dateTime .`,
  );
  const rivers = await useCases.createDeck(instance.url, { en: "Rivers" });
  const month = `${instance.url}history/2026-10.ttl`;
  await put(month, `<#answer-1> a <${SM}Answer> .`);
  return { base, session, typeIndex, instance, decks: [capitals, rivers], month, useCases };
}

describe.each(SERVERS)("what another app wrote, on $name", ({ url: server }) => {
  it("is kept when an instance is deleted, with the folder holding it, while everything Solid Memo wrote goes", async () => {
    const { session, typeIndex, instance, decks, month, useCases } = await seed(server);
    const [capitals, rivers] = decks as [(typeof decks)[0], (typeof decks)[0]];
    const foreign = [`${instance.url}attachments/picture.png`, `${instance.url}decks/their-notes.ttl`];
    await put(foreign[0]!, new Blob([PICTURE]), "image/png");
    await put(foreign[1]!, `<#note> <https://other.example/says> "mine" .`);
    // A deck's cards shared: its access rules are Solid Memo's to delete with it.
    const cardsAcl = await aclOf(capitals.cardsDocumentUrl);
    await put(cardsAcl, openTo(capitals.cardsDocumentUrl, false));
    expect(await status(cardsAcl)).toBe(200);

    await expect(useCases.deleteInstance(session, instance)).resolves.toEqual({ keptFolder: instance.url });

    // Another app's files, byte for byte, and the containers on their path.
    expect(new Uint8Array(await (await fetch(foreign[0]!)).arrayBuffer())).toEqual(PICTURE);
    expect(await triples(foreign[1]!)).toContain(`"mine"`);
    for (const container of [instance.url, `${instance.url}attachments/`, `${instance.url}decks/`]) {
      expect(await status(container), container).toBe(200);
    }
    // Solid Memo's documents gone, their access rules with them, and the containers it alone used.
    for (const url of [
      `${instance.url}meta.ttl`,
      `${instance.url}catalog.ttl`,
      capitals.cardsDocumentUrl,
      capitals.reviewsDocumentUrl,
      cardsAcl,
      month,
      `${instance.url}reviews/`,
      `${instance.url}history/`,
    ]) {
      expect(await status(url), url).toBe(404);
    }
    expect(rivers.cardsDocumentUrl.startsWith(`${instance.url}decks/`)).toBe(true);
    // Unregistered, the catalogue too.
    expect(await page().listInstances(session)).toEqual([]);
    const index = await triples(typeIndex);
    expect(index).not.toContain(instance.url);
  }, 60_000);

  it("deletes the whole folder, its access rules with it, when it holds only what Solid Memo wrote", async () => {
    const { session, instance, useCases } = await seed(server);
    const folderAcl = await aclOf(instance.url);
    await put(folderAcl, openTo(instance.url, true));

    await expect(useCases.deleteInstance(session, instance)).resolves.toEqual({ keptFolder: null });

    expect(await status(instance.url)).toBe(404);
    expect(await status(folderAcl)).toBe(404);
  }, 60_000);

  it("stays listed in the catalogue through every deck save and removal, and the instance stays valid", async () => {
    const { base, instance, decks, useCases } = await seed(server);
    const catalog = `${instance.url}catalog.ttl`;
    const cookbook = `${base}recipes/index.ttl#cookbook`;
    const listing = `<${catalog}#catalog> <${DCAT_DATASET}> <${cookbook}> .`;
    const patch = await fetch(catalog, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA { <${catalog}#catalog> <${DCAT_DATASET}> <${cookbook}> . }`,
    });
    expect(patch.ok, `PATCH ${catalog}: ${patch.status}`).toBe(true);

    const rivers = await useCases.renameDeck(decks[1]!, { en: "Rivers of Europe" });
    expect(await triples(catalog)).toContain(listing);
    const lakes = await useCases.createDeck(instance.url, { en: "Lakes" });
    await useCases.editDeckTree(instance.url, { kind: "move", node: lakes.url, to: { parent: null, after: null } });
    expect(await triples(catalog)).toContain(listing);
    await useCases.removeDeck(rivers);
    const after = await triples(catalog);
    expect(after).toContain(listing);
    expect(after).not.toContain(`<${DCAT_DATASET}> <${rivers.url}>`);
    expect(after).toContain(`<${DCAT_DATASET}> <${lakes.url}>`);

    expect((await page().validateInstance(instance.url)).conforms).toBe(true);
  }, 60_000);

  it("is only warned about by the data check, so it sets no deck aside and blocks nothing", async () => {
    const { instance, decks, useCases } = await seed(server);
    const catalog = `${instance.url}catalog.ttl`;
    const cards = decks[0]!.cardsDocumentUrl;
    // A dataset another app listed without the title and description DCAT-AP asks for, two it listed that no
    // DCAT class or IRI makes a dcat:Dataset, and a nameless agent of its own beside a deck's cards.
    for (const [url, triples] of [
      [catalog, `<${catalog}#catalog> <${DCAT_DATASET}> <${catalog}#recipes> . <${catalog}#recipes> a <http://www.w3.org/ns/dcat#Dataset> .`],
      [catalog, `<${catalog}#catalog> <${DCAT_DATASET}> <${catalog}#menu>, _:theirs . <${catalog}#menu> a <https://schema.org/Dataset> . _:theirs a <http://www.w3.org/ns/dcat#Dataset> .`],
      [cards, `<${cards}#their-agent> a <http://xmlns.com/foaf/0.1/Agent> .`],
    ] as const) {
      const patch = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/sparql-update" },
        body: `INSERT DATA { ${triples} }`,
      });
      expect(patch.ok, `PATCH ${url}: ${patch.status}`).toBe(true);
    }

    const report = await page().validateInstance(instance.url);
    expect(report.conforms).toBe(true);
    const subjects = report.documents.flatMap((document) => document.subjects);
    const warned = { foreign: true, violations: expect.arrayContaining([expect.objectContaining({ severity: "warning" })]) };
    expect(subjects.find((subject) => subject.url === `${catalog}#recipes`)).toMatchObject({ status: "profiled", ...warned });
    expect(subjects.find((subject) => subject.url === `${cards}#their-agent`)).toMatchObject({ status: "checked", shape: "agent", ...warned });
    // The catalogue only has warnings about its links to them.
    expect(subjects.find((subject) => subject.url === `${catalog}#catalog`)).toMatchObject({
      status: "checked",
      violations: expect.arrayContaining([expect.objectContaining({ path: DCAT_DATASET, severity: "warning" })]),
    });
    expect(setAsideDecks(report, decks)).toEqual(new Set());
    expect(arrangementSetAside(report)).toBe(false);
    // Opening the instance checks it the same way.
    expect((await useCases.checkInstance(instance.url)).conforms).toBe(true);
  }, 60_000);

  it("reads a review state by the card it names and reviews it in place, leaving another scheduler's alone", async () => {
    const { instance, decks, useCases } = await seed(server);
    const capitals = decks[0]!;
    const [card] = await useCases.listCards(capitals);
    // The cards document says whose it is.
    expect(await triples(capitals.cardsDocumentUrl)).toContain(
      `<${capitals.cardsDocumentUrl}> <http://purl.org/dc/terms/isPartOf> <${capitals.url}> .`,
    );
    const reviews = capitals.reviewsDocumentUrl;
    const patch = await fetch(reviews, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA {
        <${reviews}#theirs> a <${SM}ReviewState> ; <${SM}reviewOf> <${card!.url}> ; <${SM}reviewDirection> <${SM}backToFront> ;
          <${SM}easeFactor> 2.5 ; <${SM}intervalDays> 1 ; <${SM}repetitions> 1 ; <${SM}due> "2026-10-10" ;
          <${SM}firstReviewedAt> "2026-10-09T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
          <${SM}lastReviewedAt> "2026-10-09T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <${reviews}#${card!.id}@back-to-front> a <${SM}ReviewState> ; <${SM}reviewOf> <${card!.url}> ;
          <${SM}scheduler> <https://fsrs.example/ns#fsrs> ; <https://fsrs.example/ns#stability> 4.2 .
      }`,
    });
    expect(patch.ok, `PATCH ${reviews}: ${patch.status}`).toBe(true);

    const reviewed = await useCases.recordReview(instance.url, capitals, { card: card!, direction: "back-to-front" }, 4, new Date());

    expect(reviewed).toMatchObject({ cardId: card!.id, direction: "back-to-front", repetitions: 2 });
    const after = await triples(reviews);
    expect(after).toContain(`<${reviews}#theirs> <${SM}repetitions> "2"^^<http://www.w3.org/2001/XMLSchema#integer> .`);
    expect(after).toContain(`<${reviews}#theirs> <${SM}scheduler> <${SM}sm2> .`);
    // Another scheduler's state, at the subject Solid Memo's naming rule gives, untouched.
    expect(after).toContain(`<${reviews}#${card!.id}@back-to-front> <https://fsrs.example/ns#stability>`);
    expect(after).not.toContain(`<${reviews}#${card!.id}@back-to-front> <${SM}easeFactor>`);
    const report = await page().validateInstance(instance.url);
    expect(report.conforms).toBe(true);
    expect(report.documents.flatMap((document) => document.subjects).find((subject) => subject.url === `${reviews}#${card!.id}@back-to-front`)).toMatchObject({
      foreign: true,
    });
  }, 60_000);
});
